import { useState, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../lib/useScrollLock';
import { useDialog } from '../../lib/useDialog';
import { X, ImagePlus, Globe, Users, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Post } from '../../lib/supabaseClient';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import { removePostImageFiles } from '../../lib/storage';
import { withSignedRows } from '../../lib/postImages';
import { shrinkImage, imageExtension, IMAGE_MAX_EDGE } from '../../lib/images';
import { revokePreview, useRevokeOnUnmount } from '../../lib/useObjectUrls';
import { isSubmitShortcut, SUBMIT_SHORTCUT_LABEL, SUBMIT_SHORTCUT_ARIA } from '../../lib/submitShortcut';
import CharCount from '../CharCount/CharCount';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import MentionInput from '../MentionInput/MentionInput';
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
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /* What the database holds for this post right now. Starts as the opening
     snapshot and follows every delete and insert, so a retried save works
     from the real state rather than the stale post prop. */
  const savedImagesRef = useRef<NonNullable<Post['post_images']>>(post.post_images || []);
  /* New file -> URL it was already uploaded to, so Save again does not upload it twice */
  const uploadedRef = useRef(new Map<File, string>());
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const toast = useToast();

  /* Anything that differs from the saved post: text, visibility, removed or added images */
  const dirty = content !== post.content
    || visibility !== (post.visibility || 'public')
    || existingImages.length !== (post.post_images || []).length
    || newFiles.length > 0;

  /* Every way out (Escape, backdrop, X, Cancel) asks first when there is something to lose */
  const requestClose = () => {
    /* Never close mid-save: the save would carry on against an unmounted modal */
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else discardAndClose();
  };

  /* Leaving without a successful save: files a failed attempt already uploaded
     would otherwise stay in post-images with no row pointing at them */
  const discardAndClose = () => {
    const leftovers = [...uploadedRef.current.values()];
    uploadedRef.current.clear();
    if (leftovers.length > 0) void removePostImageFiles(leftovers);
    onClose();
  };

  /* The page stops scrolling underneath; focus in, Tab kept inside, Escape asks or closes */
  useScrollLock();
  useDialog(boxRef, requestClose);
  useRevokeOnUnmount(newPreviews);

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
    revokePreview(newPreviews[index]);
    /* An earlier failed save may already have uploaded this one: take it back */
    const uploaded = uploadedRef.current.get(newFiles[index]);
    if (uploaded) {
      uploadedRef.current.delete(newFiles[index]);
      void removePostImageFiles([uploaded]);
    }
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  /* Part of the save went through and the dialog stays open for another try.
     The card and this dialog both move to what the database holds now, so
     Cancel leaves a correct card and Save again starts from the real state.
     stillToRemove: rows the user took out that could not be deleted yet. */
  const syncAfterPartialSave = async (updatedAt: string | null | undefined, stillToRemove: string[] = []) => {
    const { data } = await supabase.from('post_images').select('*').eq('post_id', post.id).order('position');
    const rows = await withSignedRows(data || []);
    savedImagesRef.current = rows;
    setExistingImages(rows.filter((img) => !stillToRemove.includes(img.id)));
    setContent(content.trim());
    onSave({ ...post, content: content.trim(), visibility, updated_at: updatedAt ?? post.updated_at, post_images: rows } as Post);
  };

  /* The rows first, then the files behind them. False when the rows could not be deleted. */
  const deleteSavedImages = async (images: NonNullable<Post['post_images']>) => {
    if (images.length === 0) return true;
    const { error: removeError } = await supabase.from('post_images').delete().in('id', images.map((img) => img.id));
    if (removeError) return false;
    savedImagesRef.current = savedImagesRef.current.filter((img) => !images.includes(img));
    void removePostImageFiles(images.map((img) => img.image_url));
    return true;
  };

  const handleSave = async () => {
    /* The keyboard shortcut can fire while a save is already running */
    if (saving) return;
    if (!content.trim() && existingImages.length === 0 && newFiles.length === 0) {
      setError('Post must have text or at least one image.');
      return;
    }
    setSaving(true);

    /* Upload first, before anything on the post changes: if the text is empty,
       the old photos are going and no new photo made it, saving would leave a
       blank post. Files uploaded by an earlier attempt are reused. */
    const failedIndexes: number[] = [];
    for (let i = 0; i < newFiles.length; i++) {
      if (uploadedRef.current.has(newFiles[i])) continue;
      try {
        /* Big phone photos are resized first, so they fit the 5 MB limit */
        const file = await shrinkImage(newFiles[i], IMAGE_MAX_EDGE.post);
        const path = `${post.user_id}/${post.id}/${crypto.randomUUID()}.${imageExtension(file)}`;
        const { error: uploadError } = await supabase.storage.from('post-images').upload(path, file, { contentType: file.type || undefined });
        if (uploadError) {
          failedIndexes.push(i);
          continue;
        }
        uploadedRef.current.set(newFiles[i], supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl);
      } catch {
        failedIndexes.push(i);
      }
    }
    if (!content.trim() && existingImages.length === 0 && failedIndexes.length === newFiles.length) {
      setError(`Nothing was changed: the new image${newFiles.length > 1 ? 's' : ''} did not upload and the post would be empty. Use JPG, PNG, WebP or GIF; a GIF must be under 5 MB. Press Save to try again.`);
      setSaving(false);
      return;
    }

    /* Update post content and visibility */
    const { data: updatedRow, error: updateError } = await supabase
      .from('posts')
      .update({ content: content.trim(), visibility })
      .eq('id', post.id)
      .select('updated_at')
      .single();

    if (updateError) {
      setError(describeError(updateError, 'Could not save your changes. Please try again.'));
      setSaving(false);
      return;
    }

    /* Compared with what is stored now (not the opening snapshot), so a retry
       after a partial failure does not delete the same rows again. New photos
       are attached before the old ones go, so a failure can not leave an empty
       post. Only what would push the post over the 10-photo cap has to go first. */
    const removedImages = savedImagesRef.current.filter((img) => !existingImages.find((e) => e.id === img.id));
    const uploadedCount = newFiles.length - failedIndexes.length;
    const overflow = Math.max(0, savedImagesRef.current.length + uploadedCount - 10);
    const removeFirst = removedImages.slice(0, overflow);
    const removeLast = removedImages.slice(overflow);
    const REMOVE_FAILED = 'The text was saved, but the removed images could not be taken off. Try Save again.';

    if (!(await deleteSavedImages(removeFirst))) {
      setError(REMOVE_FAILED);
      setSaving(false);
      return;
    }

    /* Attach the new images */
    if (newFiles.length > 0) {
      /* New images go after the highest position still in use: positions only
         sort, and removing a middle image leaves a gap, so counting images
         would hand out a position a kept image already has */
      const startPosition = savedImagesRef.current.reduce((max, img) => Math.max(max, img.position + 1), 0);
      const uploadedImages: { post_id: string; image_url: string; position: number }[] = [];
      newFiles.forEach((file) => {
        const url = uploadedRef.current.get(file);
        if (url) uploadedImages.push({ post_id: post.id, image_url: url, position: startPosition + uploadedImages.length });
      });

      if (uploadedImages.length > 0) {
        const { data: insertedRows, error: insertError } = await supabase
          .from('post_images')
          .insert(uploadedImages)
          .select('id, post_id, image_url, position');
        if (insertError) {
          /* The photo cap and rate limits come with their own message */
          const detail = describeError(insertError, '');
          setError(detail ? `The text was saved, but the new images could not be attached. ${detail}` : 'The text was saved, but the new images could not be attached. Try Save again.');
          await syncAfterPartialSave(updatedRow?.updated_at, removeLast.map((img) => img.id));
          setSaving(false);
          return;
        }
        savedImagesRef.current = [...savedImagesRef.current, ...(insertedRows || [])];
        uploadedRef.current.clear();
      }
    }

    /* Only the photos that failed stay in the dialog, so Save again cannot
       attach the others twice */
    if (uploadedCount > 0) {
      newPreviews.forEach((src, i) => { if (!failedIndexes.includes(i)) revokePreview(src); });
      setNewFiles(failedIndexes.map((i) => newFiles[i]));
      setNewPreviews(failedIndexes.map((i) => newPreviews[i]));
    }

    if (!(await deleteSavedImages(removeLast))) {
      setError(REMOVE_FAILED);
      await syncAfterPartialSave(updatedRow?.updated_at, removeLast.map((img) => img.id));
      setSaving(false);
      return;
    }

    if (failedIndexes.length > 0) {
      setError(`Your other changes were saved, but ${failedIndexes.length} of ${newFiles.length} new image${newFiles.length > 1 ? 's' : ''} did not upload. Use JPG, PNG, WebP or GIF; a GIF must be under 5 MB. Press Save to try again, or remove them.`);
      await syncAfterPartialSave(updatedRow?.updated_at);
      setSaving(false);
      return;
    }

    /* Fetch updated post_images */
    const { data: updatedImages } = await supabase
      .from('post_images')
      .select('*')
      .eq('post_id', post.id)
      .order('position');

    /* updated_at comes back from the row: the server only sets it when the text or visibility changed */
    onSave({
      ...post,
      content: content.trim(),
      visibility,
      updated_at: updatedRow?.updated_at ?? post.updated_at,
      post_images: await withSignedRows(updatedImages || []),
    } as Post);
    toast.success('Post updated');
    setSaving(false);
    onClose();
  };

  /* Portaled to body: the page wrapper keeps a transform after its entrance
     animation, which would otherwise anchor this fixed overlay to the page
     instead of the viewport */
  return (
    <>
    {createPortal(
    <div className="edit-modal-backdrop" onClick={requestClose}>
      <div
        className="edit-modal-box"
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="edit-modal-header">
          <h3 id={`${fieldId}-title`}>Edit Post</h3>
          <button className="edit-modal-close" onClick={requestClose} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="edit-modal-body">

          {/* Text */}
          <div className="edit-section">
            <label className="edit-label" htmlFor={`${fieldId}-content`}>Content</label>
            <MentionInput
              multiline
              id={`${fieldId}-content`}
              value={content}
              onValueChange={setContent}
              maxLength={500}
              rows={4}
              className="edit-textarea"
              placeholder="What's on your mind?"
              aria-keyshortcuts={SUBMIT_SHORTCUT_ARIA}
              onKeyDown={(e) => {
                if (!isSubmitShortcut(e.nativeEvent)) return;
                e.preventDefault();
                void handleSave();
              }}
            />
            <CharCount length={content.length} max={500} className="edit-char-count" />
          </div>

          {/* Visibility */}
          <div className="edit-section">
            <span className="edit-label" id={`${fieldId}-visibility`}>Visibility</span>
            <div className="visibility-options" role="group" aria-labelledby={`${fieldId}-visibility`}>
              {VISIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`visibility-option ${visibility === opt.value ? 'active' : ''}`}
                  onClick={() => setVisibility(opt.value)}
                  type="button"
                  aria-pressed={visibility === opt.value}
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
            <span className="edit-label">Images</span>

            {/* Existing images */}
            {existingImages.length > 0 && (
              <div className="edit-images-grid">
                {existingImages.map((img) => (
                  <div key={img.id} className="edit-image-item">
                    <img src={img.display_url ?? img.image_url} alt="Post image" width={80} height={80} decoding="async" />
                    <button className="edit-image-remove" onClick={() => removeExisting(img.id)} type="button" aria-label="Remove image" title="Remove">
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
                    <img src={src} alt={`New image ${i + 1}`} width={80} height={80} decoding="async" />
                    <button className="edit-image-remove" onClick={() => removeNew(i)} type="button" aria-label={`Remove new image ${i + 1}`} title="Remove">
                      <X size={10} />
                    </button>
                    <span className="edit-image-new-badge">New</span>
                  </div>
                ))}
              </div>
            )}

            {/* Add more photos */}
            {(existingImages.length + newFiles.length) < 10 && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleNewFiles}
                  style={{ display: 'none' }}
                />
                <button type="button" className="edit-add-images" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus size={15} />
                  <span>Add photos</span>
                </button>
              </>
            )}
          </div>

          {error && <p className="edit-error">{error}</p>}
        </div>

        {/* Footer */}
        <div className="edit-modal-footer">
          <button className="btn-ghost" onClick={requestClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} title={`Save (${SUBMIT_SHORTCUT_LABEL})`}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
    )}

    {/* Sibling of the dialog, not a child: clicks inside it must not reach the backdrop */}
    {confirmDiscard && (
      <ConfirmModal
        title="Discard changes?"
        message="Your edits to this post have not been saved and will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => { setConfirmDiscard(false); discardAndClose(); }}
        onCancel={() => setConfirmDiscard(false)}
      />
    )}
    </>
  );
}
