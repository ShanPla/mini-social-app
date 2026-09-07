import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, SquarePen } from 'lucide-react';
import type { Profile } from '../../lib/supabaseClient';
import { useChat } from '../../context/ChatContext';
import UserPicker from '../UserPicker/UserPicker';
import './NewChatModal.css';

type PickedUser = Pick<Profile, 'id' | 'username' | 'avatar_url'>;

type Props = {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
};

/* Start a DM (one person) or a group (two or more, optional name). */
export default function NewChatModal({ onClose, onCreated }: Props) {
  const { userId, createGroup } = useChat();
  const [selected, setSelected] = useState<PickedUser[]>([]);
  const [groupName, setGroupName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const isGroup = selected.length > 1;

  const handleCreate = async () => {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    const id = await createGroup(selected.map((u) => u.id), isGroup ? groupName : null);
    setSubmitting(false);
    if (!id) { setError('Could not start the conversation. Try again.'); return; }
    onCreated(id);
  };

  return createPortal(
    <div className="nc-backdrop" onClick={onClose}>
      <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="nc-header">
          <div className="nc-title">
            <SquarePen size={16} />
            <h3>New message</h3>
          </div>
          <button className="nc-close" onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        <div className="nc-body">
          <UserPicker
            excludeIds={userId ? [userId] : []}
            selected={selected}
            onChange={setSelected}
            placeholder="To: search people…"
            autoFocus
          />

          {/* Group name appears once two or more people are picked */}
          {isGroup && (
            <div className="form-group nc-group-name">
              <label>Group name (optional)</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Weekend plans"
                maxLength={60}
              />
            </div>
          )}

          {error && <p className="error-msg">{error}</p>}
        </div>

        <div className="nc-footer">
          <span className="nc-hint">
            {selected.length === 0
              ? 'Pick one person for a chat, or several for a group.'
              : isGroup ? `Group with ${selected.length} people` : `Chat with @${selected[0].username}`}
          </span>
          <button className="btn-primary" onClick={handleCreate} disabled={selected.length === 0 || submitting}>
            {submitting ? 'Starting…' : isGroup ? 'Create group' : 'Start chat'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
