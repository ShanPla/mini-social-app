import { useState, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import { useCooldown } from '../../lib/useCooldown';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { shrinkImage, imageExtension, IMAGE_MAX_EDGE } from '../../lib/images';
import { withSignedImage } from '../../lib/postImages';
import { removePostImageFiles } from '../../lib/storage';
import { fetchPosts } from '../../lib/posts';
import { revokePreview, useRevokeOnUnmount } from '../../lib/useObjectUrls';
import { isSubmitShortcut, SUBMIT_SHORTCUT_LABEL, SUBMIT_SHORTCUT_ARIA } from '../../lib/submitShortcut';
import { readDraft, writeDraft } from '../../lib/drafts';
import CharCount from '../CharCount/CharCount';
import MentionInput from '../MentionInput/MentionInput';
import './ComposePost.css';

type Visibility = 'public' | 'followers' | 'private';

type Props = {
  userId: string;
  /* Called with the new post (profile embedded, images attached) so the
     parent can prepend it to whatever list it is showing */
  onPosted: (post: Post) => void;
  /* A retry added photos to a post that is already in the list */
  onPhotosAdded: (post: Post) => void;
  label?: string;
  placeholder?: string;
};

/* The post composer. The feed and your own profile both publish through here. */
export default function ComposePost({
  userId,
  onPosted,
  onPhotosAdded,
  label = "What's on your mind?",
  placeholder = 'Share something with the world…',
}: Props) {
  /* Unfinished text is kept on this device (per user) until it is published */
  const draftKey = `post:${userId}`;
  const [content, setContent] = useState(() => readDraft(draftKey));
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [posting, setPosting] = useState(false);
  /* The post went up but these photos did not: offered for another try */
  const [retry, setRetry] = useState<{ post: Post; files: File[]; total: number; detail: string } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOnCooldown, triggerCooldown] = useCooldown(3000);
  const toast = useToast();

  /* Blob previews still held when the composer goes away get freed */
  useRevokeOnUnmount(imagePreviews);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 10);
    imagePreviews.forEach(revokePreview);
    setImageFiles(files);
    setImagePreviews(files.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (index: number) => {
    revokePreview(imagePreviews[index]);
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const clearImages = () => {
    imagePreviews.forEach(revokePreview);
    setImageFiles([]);
    setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canPost = !!content.trim() || imageFiles.length > 0;

  /* Uploads the files and attaches them to the post. Files that fail come
     back in failedFiles; if attaching fails, all of them do, and the uploads
     are removed again. */
  const attachPhotos = async (postId: string, files: File[], startPosition: number) => {
    const uploaded: { post_id: string; image_url: string; position: number }[] = [];
    const failedFiles: File[] = [];
    for (const original of files) {
      try {
        /* Big phone photos are resized first, so they fit the 5 MB limit */
        const file = await shrinkImage(original, IMAGE_MAX_EDGE.post);
        const path = `${userId}/${postId}/${crypto.randomUUID()}.${imageExtension(file)}`;
        const { error } = await supabase.storage.from('post-images').upload(path, file, { contentType: file.type || undefined });
        if (error) { failedFiles.push(original); continue; }
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
        uploaded.push({ post_id: postId, image_url: urlData.publicUrl, position: startPosition + uploaded.length });
      } catch {
        failedFiles.push(original);
      }
    }
    if (uploaded.length === 0) return { rows: [], failedFiles, attachFailed: false, detail: '' };
    /* Read the rows back so the card holds their real ids: editing the post
       straight away deletes removed images by id */
    const { data: rows, error } = await supabase
      .from('post_images')
      .insert(uploaded)
      .select('id, post_id, image_url, position');
    if (error || !rows) {
      void removePostImageFiles(uploaded.map((img) => img.image_url));
      /* A server message (photo cap, rate limit) beats the generic line */
      return { rows: [], failedFiles: files, attachFailed: true, detail: describeError(error, '') };
    }
    return { rows: [...rows].sort((a, b) => a.position - b.position), failedFiles, attachFailed: false, detail: '' };
  };

  const handleRetry = async () => {
    if (!retry || retrying) return;
    setRetrying(true);
    const existing = retry.post.post_images ?? [];
    const start = existing.reduce((max, img) => Math.max(max, img.position + 1), 0);
    const result = await attachPhotos(retry.post.id, retry.files, start);
    const post = { ...retry.post, post_images: [...existing, ...result.rows] };
    if (result.rows.length > 0) {
      /* Read it back: the post may have been edited since it was published */
      const page = await fetchPosts({ postId: post.id });
      onPhotosAdded(page.posts[0] ?? await withSignedImage(post));
    }
    if (result.failedFiles.length > 0) {
      setRetry({ post, files: result.failedFiles, total: retry.total, detail: result.detail });
    } else {
      setRetry(null);
      toast.success('Photos added to your post');
    }
    setRetrying(false);
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost || posting || isOnCooldown || retry) return;
    setPosting(true);

    const { data: postData, error: postError } = await supabase
      .from('posts')
      .insert({ user_id: userId, content: content.trim(), visibility })
      .select('*, profiles!posts_user_id_fkey(id, username, display_name, avatar_url)')
      .single();

    if (postError || !postData) {
      toast.error(describeError(postError, 'Could not publish your post. Please try again.'));
      setPosting(false);
      return;
    }

    /* Same shape fetch_posts returns, so the card needs no special case */
    const newPost: Post = { ...(postData as Post), updated_at: null, like_count: 0, comment_count: 0, liked_by_me: false, saved_by_me: false, post_images: [] };

    let stillFailed: File[] = [];
    let failDetail = '';

    if (imageFiles.length > 0) {
      const result = await attachPhotos(postData.id, imageFiles, 0);
      newPost.post_images = result.rows;
      stillFailed = result.failedFiles;
      failDetail = result.detail;

      /* An image-only post with no image attached would be a blank post:
         take it back and keep the draft so the user can try again */
      if (!content.trim() && result.rows.length === 0) {
        const { error: undoError } = await supabase.from('posts').delete().eq('id', postData.id);
        if (undoError) console.warn('could not remove the empty post:', undoError.message);
        toast.error(result.attachFailed
          ? (failDetail ? `${failDetail} Nothing was published.` : 'Your photos could not be attached, so nothing was published. Please try again.')
          : 'Your photos could not be uploaded, so nothing was published. Please try again.');
        setPosting(false);
        return;
      }
    }

    onPosted(await withSignedImage(newPost));
    if (stillFailed.length > 0) {
      setRetry({ post: newPost, files: stillFailed, total: imageFiles.length, detail: failDetail });
    } else {
      toast.success('Post published');
    }
    setContent('');
    writeDraft(draftKey, '');
    clearImages();
    setPosting(false);
    triggerCooldown();
  };

  return (
    <div className="compose-card">
      <h3 className="compose-label">{label}</h3>
      <form onSubmit={handlePost}>
        <MentionInput
          multiline
          aria-label={label}
          value={content}
          onValueChange={(v) => {
            setContent(v);
            writeDraft(draftKey, v);
          }}
          placeholder={placeholder}
          maxLength={500}
          rows={3}
          aria-keyshortcuts={SUBMIT_SHORTCUT_ARIA}
          onKeyDown={(e) => {
            if (!isSubmitShortcut(e.nativeEvent)) return;
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }}
        />

        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <div className="compose-previews">
            {imagePreviews.map((src, i) => (
              <div key={i} className="compose-preview-item">
                <img src={src} alt={`Preview ${i + 1}`} />
                <button type="button" className="preview-remove" onClick={() => removeImage(i)} title="Remove" aria-label={`Remove image ${i + 1}`}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        <div className="compose-image-section">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {/* A real button, so the keyboard can open the file picker too */}
          <button type="button" className="file-upload-area" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus size={15} />
            <span>{imageFiles.length > 0 ? `${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} selected` : 'Add photos (up to 10)…'}</span>
          </button>
          {imageFiles.length > 0 && (
            <button type="button" className="clear-images-btn" onClick={clearImages}>Clear all</button>
          )}
        </div>

        {/* Visibility selector */}
        <div className="compose-visibility">
          <select
            aria-label="Who can see this post"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            className="visibility-select"
          >
            <option value="public">Public</option>
            <option value="followers">Followers only</option>
            <option value="private">Private</option>
          </select>
        </div>

        {/* The post is up, some photos are not */}
        {retry && (
          <div className="compose-retry" role="alert">
            <p>
              Your post is up, but {retry.files.length} of {retry.total} photo{retry.total > 1 ? 's' : ''} did not upload.{' '}
              {retry.detail || 'Use JPG, PNG, WebP or GIF; a GIF must be under 5 MB.'}
            </p>
            <div className="compose-retry-actions">
              <button type="button" className="btn-ghost" onClick={handleRetry} disabled={retrying}>
                {retrying ? 'Retrying…' : 'Retry'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setRetry(null)} disabled={retrying}>
                Skip these photos
              </button>
            </div>
          </div>
        )}

        <div className="compose-footer">
          <CharCount length={content.length} max={500} />
          <button type="submit" className="btn-primary" disabled={posting || !canPost || !!retry} title={`Publish (${SUBMIT_SHORTCUT_LABEL})`}>
            {posting ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </form>
    </div>
  );
}
