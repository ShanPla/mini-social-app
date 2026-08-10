import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import './EditPostModal.css';

type Props = {
  post: Post;
  onClose: () => void;
  onSave: (updated: Post) => void;
};

type Visibility = 'public' | 'followers' | 'private';

const VISIBILITY_OPTIONS: { value: Visibility; label: string; desc: string; icon: string }[] = [
  { value: 'public', label: 'Public', desc: 'Anyone can see this post', icon: '🌐' },
  { value: 'followers', label: 'Followers', desc: 'Only your followers can see this', icon: '👥' },
  { value: 'private', label: 'Private', desc: 'Only you can see this', icon: '🔒' },
];

export default function EditPostModal({ post, onClose, onSave }: Props) {
  const [content, setContent] = useState(post.content);
  const [visibility, setVisibility] = useState<Visibility>((post as any).visibility || 'public');
  const [existingImages, setExistingImages] = useState(
    post.post_images?.sort((a, b) => a.position - b.position) || []
  );
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const total = existingImages.length + newFiles.length + files.length;
    if (total > 10) {
      setError('Maximum 10 images per post.');
      return;
    }
    setNewFiles((prev) => [...prev, ...files]);
    setNewPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
    setError('');
  };

  const removeExisting = (id: string) => {
    setExistingImages((prev) => prev.filter((img) => img.id !== id));
  };

  const removeNew = (index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!content.trim() && existingImages.length === 0 && newFiles.length === 0) {
      setError('Post must have text or at least one image.');
      return;
    }
    setSaving(true);

    // 1. Update post content and visibility
    const { error: updateError } = await supabase
      .from('posts')
      .update({ content: content.trim(), visibility })
      .eq('id', post.id);

    if (updateError) { setError('Failed to save. Please try again.'); setSaving(false); return; }

    // 2. Delete removed images from DB
    const removedIds = (post.post_images || [])
      .filter((img) => !existingImages.find((e) => e.id === img.id))
      .map((img) => img.id);

    if (removedIds.length > 0) {
      await supabase.from('post_images').delete().in('id', removedIds);
    }

    // 3. Upload new images
    if (newFiles.length > 0) {
      const startPosition = existingImages.length;
      const uploadedImages: { post_id: string; image_url: string; position: number }[] = [];

      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        const ext = file.name.split('.').pop();
        const path = `${post.user_id}/${post.id}/${Date.now()}-${i}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('post-images').upload(path, file);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
          uploadedImages.push({ post_id: post.id, image_url: urlData.publicUrl, position: startPosition + i });
        }
      }

      if (uploadedImages.length > 0) {
        await supabase.from('post_images').insert(uploadedImages);
      }
    }

    // 4. Fetch updated post_images
    const { data: updatedImages } = await supabase
      .from('post_images')
      .select('*')
      .eq('post_id', post.id)
      .order('position');

    onSave({
      ...post,
      content: content.trim(),
      visibility,
      post_images: updatedImages || [],
    } as Post);

    setSaving(false);
    onClose();
  };

  return (
    <div className="edit-modal-backdrop" onClick={onClose}>
      <div className="edit-modal-box" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="edit-modal-header">
          <h3>Edit Post</h3>
          <button className="edit-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Content */}
        <div className="edit-modal-body">

          {/* Text */}
          <div className="edit-section">
            <label className="edit-label">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={500}
              rows={4}
              className="edit-textarea"
              placeholder="What's on your mind?"
            />
            <span className="edit-char-count">{content.length}/500</span>
          </div>

          {/* Visibility */}
          <div className="edit-section">
            <label className="edit-label">Visibility</label>
            <div className="visibility-options">
              {VISIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`visibility-option ${visibility === opt.value ? 'active' : ''}`}
                  onClick={() => setVisibility(opt.value)}
                  type="button"
                >
                  <span className="visibility-icon">{opt.icon}</span>
                  <div className="visibility-text">
                    <span className="visibility-label">{opt.label}</span>
                    <span className="visibility-desc">{opt.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Images */}
          <div className="edit-section">
            <label className="edit-label">Images</label>

            {/* Existing images */}
            {existingImages.length > 0 && (
              <div className="edit-images-grid">
                {existingImages.map((img) => (
                  <div key={img.id} className="edit-image-item">
                    <img src={img.image_url} alt="Post image" />
                    <button
                      className="edit-image-remove"
                      onClick={() => removeExisting(img.id)}
                      type="button"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* New image previews */}
            {newPreviews.length > 0 && (
              <div className="edit-images-grid">
                {newPreviews.map((src, i) => (
                  <div key={i} className="edit-image-item edit-image-item--new">
                    <img src={src} alt={`New image ${i + 1}`} />
                    <button
                      className="edit-image-remove"
                      onClick={() => removeNew(i)}
                      type="button"
                    >✕</button>
                    <span className="edit-image-new-badge">New</span>
                  </div>
                ))}
              </div>
            )}

            {/* Add more */}
            {(existingImages.length + newFiles.length) < 10 && (
              <div
                className="edit-add-images"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleNewFiles}
                  style={{ display: 'none' }}
                />
                <span>📁 Add photos</span>
              </div>
            )}
          </div>

          {error && <p className="edit-error">{error}</p>}
        </div>

        {/* Footer */}
        <div className="edit-modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
