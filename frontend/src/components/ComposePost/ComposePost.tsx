import { useState, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import { useCooldown } from '../../lib/useCooldown';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { shrinkImage, imageExtension, IMAGE_MAX_EDGE } from '../../lib/images';
import { removePostImageFiles } from '../../lib/storage';
import { revokePreview, useRevokeOnUnmount } from '../../lib/useObjectUrls';
import { isSubmitShortcut, SUBMIT_SHORTCUT_LABEL, SUBMIT_SHORTCUT_ARIA } from '../../lib/submitShortcut';
import { readDraft, writeDraft } from '../../lib/drafts';
import CharCount from '../CharCount/CharCount';
import './ComposePost.css';

type Visibility = 'public' | 'followers' | 'private';

type Props = {
  userId: string;
  /* Called with the new post (profile embedded, images attached) so the
     parent can prepend it to whatever list it is showing */
  onPosted: (post: Post) => void;
  label?: string;
  placeholder?: string;
};

/* The post composer. The feed and your own profile both publish through here. */
export default function ComposePost({
  userId,
  onPosted,
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

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost || posting || isOnCooldown) return;
    setPosting(true);

    const { data: postData, error: postError } = await supabase
      .from('posts')
      .insert({ user_id: userId, content: content.trim(), visibility })
      .select('*, profiles(id, username, display_name, avatar_url)')
      .single();

    if (postError || !postData) {
      toast.error(describeError(postError, 'Could not publish your post. Please try again.'));
      setPosting(false);
      return;
    }

    /* Same shape fetch_posts returns, so the card needs no special case */
    const newPost: Post = { ...(postData as Post), like_count: 0, comment_count: 0, liked_by_me: false, post_images: [] };

    if (imageFiles.length > 0) {
      const uploadedImages: { post_id: string; image_url: string; position: number }[] = [];
      let failed = 0;
      let attachFailed = false;

      for (let i = 0; i < imageFiles.length; i++) {
        /* Big phone photos are resized first, so they fit the 5 MB limit */
        const file = await shrinkImage(imageFiles[i], IMAGE_MAX_EDGE.post);
        const path = `${userId}/${postData.id}/${i}.${imageExtension(file)}`;
        const { error: uploadError } = await supabase.storage.from('post-images').upload(path, file, { contentType: file.type || undefined });
        if (uploadError) {
          failed += 1;
        } else {
          const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
          uploadedImages.push({ post_id: postData.id, image_url: urlData.publicUrl, position: i });
        }
      }

      if (failed > 0) {
        toast.error(`${failed} of ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} could not be uploaded. Use JPG, PNG, WebP or GIF; a GIF must be under 5 MB.`);
      }

      if (uploadedImages.length > 0) {
        /* Read the rows back so the card holds their real ids: editing the
           post straight away deletes removed images by id */
        const { data: imageRows, error: imagesError } = await supabase
          .from('post_images')
          .insert(uploadedImages)
          .select('id, post_id, image_url, position');
        if (imagesError || !imageRows) {
          attachFailed = true;
          void removePostImageFiles(uploadedImages.map((img) => img.image_url));
          if (content.trim()) toast.error('The post went up, but its images could not be attached.');
        } else {
          newPost.post_images = [...imageRows].sort((a, b) => a.position - b.position);
        }
      }

      /* An image-only post with no image attached would be a blank post:
         take it back and keep the draft so the user can try again */
      if (!content.trim() && (newPost.post_images ?? []).length === 0) {
        if (!attachFailed) void removePostImageFiles(uploadedImages.map((img) => img.image_url));
        const { error: undoError } = await supabase.from('posts').delete().eq('id', postData.id);
        if (undoError) console.warn('could not remove the empty post:', undoError.message);
        toast.error(attachFailed
          ? 'Your photos could not be attached, so nothing was published. Please try again.'
          : 'Your photos could not be uploaded, so nothing was published. Please try again.');
        setPosting(false);
        return;
      }
    }

    onPosted(newPost);
    toast.success('Post published');
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
        <textarea
          aria-label={label}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            writeDraft(draftKey, e.target.value);
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

        <div className="compose-footer">
          <CharCount length={content.length} max={500} />
          <button type="submit" className="btn-primary" disabled={posting || !canPost} title={`Publish (${SUBMIT_SHORTCUT_LABEL})`}>
            {posting ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </form>
    </div>
  );
}
