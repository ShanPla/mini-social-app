import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../lib/useScrollLock';
import { X, ImagePlus, Globe, Users, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { removePostImageFiles } from '../../lib/storage';
import './EditPostModal.css';

type Props = {
  post: Post;
  onClose: () => void;
  onSave: (updated: Post) => void;
};

type Visibility = 'public' | 'followers' | 'private';

const VISIBILITY_OPTIONS: { value: Visibility; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: 'public', label: 'Public', desc: 'Anyone can see this post', icon: <Globe size={16} /> },
  { value: 'followers', label: 'Followers', desc: 'Only your followers can see this', icon: <Users size={16} /> },
  { value: 'private', label: 'Private', desc: 'Only you can see this', icon: <Lock size={16} /> },
];

export default function EditPostModal({ post, onClose, onSave }: Props) {
  const [content, setContent] = useState(post.content);
  const [visibility, setVisibility] = useState<Visibility>(post.visibility || 'public');
  const [existingImages, setExistingImages] = useState(
    [...(post.post_images || [])].sort((a, b) => a.position - b.position)
  );
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useScrollLock();

  /* Escape closes and the page stops scrolling underneath, same as ConfirmModal */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handleNewFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const total = existingImages.length + newFiles.length + files.length;
    if (total > 10) { setError('Maximum 10 images per post.'); return; }
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

    /* Update post content and visibility */
    const { error: updateError } = await supabase
      .from('posts')
      .update({ content: content.trim(), visibility })
      .eq('id', post.id);

    if (updateError) {
      setError(describeError(updateError, 'Could not save your changes. Please try again.'));
      setSaving(false);
      return;
    }

    /* Delete removed images: the rows first, then the files behind them */
    const removedImages = (post.post_images || []).filter((img) => !existingImages.find((e) => e.id === img.id));

    if (removedImages.length > 0) {
      const { error: removeError } = await supabase.from('post_images').delete().in('id', removedImages.map((img) => img.id));
      if (removeError) {
        setError('The text was saved, but the removed images could not be taken off. Try Save again.');
        setSaving(false);
        return;
      }
      void removePostImageFiles(removedImages.map((img) => img.image_url));
    }

    /* Upload new images */
    if (newFiles.length > 0) {
      const startPosition = existingImages.length;
      const uploadedImages: { post_id: string; image_url: string; position: number }[] = [];
      let failed = 0;

      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        const ext = file.name.split('.').pop();
        const path = `${post.user_id}/${post.id}/${Date.now()}-${i}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('post-images').upload(path, file);
        if (uploadError) {
          failed += 1;
        } else {
          const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
          uploadedImages.push({ post_id: post.id, image_url: urlData.publicUrl, position: startPosition + i });
        }
      }

      if (failed > 0) {
        toast.error(`${failed} of ${newFiles.length} new image${newFiles.length > 1 ? 's' : ''} could not be uploaded. Images only, up to 5 MB each.`);
      }

      if (uploadedImages.length > 0) {
        const { error: insertError } = await supabase.from('post_images').insert(uploadedImages);
        if (insertError) {
          setError('The text was saved, but the new images could not be attached. Try Save again.');
          setSaving(false);
          return;
        }
      }
    }

    /* Fetch updated post_images */
    const { data: updatedImages } = await supabase
      .from('post_images')
      .select('*')
      .eq('post_id', post.id)
      .order('position');

    onSave({ ...post, content: content.trim(), visibility, post_images: updatedImages || [] } as Post);
    toast.success('Post updated');
    setSaving(false);
    onClose();
  };

  /* Portaled to body: the page wrapper keeps a transform after its entrance
     animation, which would otherwise anchor this fixed overlay to the page
     instead of the viewport */
  return createPortal(
    <div className="edit-modal-backdrop" onClick={onClose}>
      <div className="edit-modal-box" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="edit-modal-header">
          <h3>Edit Post</h3>
          <button className="edit-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
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
                    <button className="edit-image-remove" onClick={() => removeExisting(img.id)} type="button">
                      <X size={10} />
                    </button>
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
                    <button className="edit-image-remove" onClick={() => removeNew(i)} type="button">
                      <X size={10} />
                    </button>
                    <span className="edit-image-new-badge">New</span>
                  </div>
                ))}
              </div>
            )}

            {/* Add more photos */}
            {(existingImages.length + newFiles.length) < 10 && (
              <div className="edit-add-images" onClick={() => fileInputRef.current?.click()}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleNewFiles}
                  style={{ display: 'none' }}
                />
                <ImagePlus size={15} />
                <span>Add photos</span>
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
    </div>,
    document.body
  );
}
