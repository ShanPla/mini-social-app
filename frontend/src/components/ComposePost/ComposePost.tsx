import { useState, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import { useCooldown } from '../../lib/useCooldown';
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
  const [content, setContent] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOnCooldown, triggerCooldown] = useCooldown(3000);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 10);
    setImageFiles(files);
    setImagePreviews(files.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const clearImages = () => {
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
      .select('*, profiles(id, username, avatar_url), likes(id, user_id), comments(id)')
      .single();

    if (postError || !postData) { setPosting(false); return; }

    if (imageFiles.length > 0) {
      const uploadedImages: { post_id: string; image_url: string; position: number }[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const ext = file.name.split('.').pop();
        const path = `${userId}/${postData.id}/${i}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('post-images').upload(path, file);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
          uploadedImages.push({ post_id: postData.id, image_url: urlData.publicUrl, position: i });
        }
      }

      if (uploadedImages.length > 0) {
        await supabase.from('post_images').insert(uploadedImages);
        (postData as Post).post_images = uploadedImages.map((img, i) => ({
          id: `temp-${i}`,
          post_id: postData.id,
          image_url: img.image_url,
          position: img.position,
        }));
      }
    }

    onPosted(postData as Post);
    setContent('');
    clearImages();
    setPosting(false);
    triggerCooldown();
  };

  return (
    <div className="compose-card">
      <h3 className="compose-label">{label}</h3>
      <form onSubmit={handlePost}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          rows={3}
        />

        {/* Image previews */}
        {imagePreviews.length > 0 && (
          <div className="compose-previews">
            {imagePreviews.map((src, i) => (
              <div key={i} className="compose-preview-item">
                <img src={src} alt={`Preview ${i + 1}`} />
                <button type="button" className="preview-remove" onClick={() => removeImage(i)} title="Remove">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        <div className="compose-image-section">
          <div className="file-upload-area" onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <ImagePlus size={15} />
            <span>{imageFiles.length > 0 ? `${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} selected` : 'Add photos (up to 10)…'}</span>
          </div>
          {imageFiles.length > 0 && (
            <button type="button" className="clear-images-btn" onClick={clearImages}>Clear all</button>
          )}
        </div>

        {/* Visibility selector */}
        <div className="compose-visibility">
          <select
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
          <span className="char-count">{content.length}/500</span>
          <button type="submit" className="btn-primary" disabled={posting || !canPost}>
            {posting ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </form>
    </div>
  );
}
