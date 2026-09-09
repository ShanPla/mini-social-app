import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Pencil, Check, UserPlus, LogOut, Users, Info } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { Profile } from '../../lib/supabaseClient';
import { useChat } from '../../context/ChatContext';
import { conversationTitle } from '../../lib/chat';
import UserPicker from '../UserPicker/UserPicker';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import { displayName } from '../../lib/names';
import { useScrollLock } from '../../lib/useScrollLock';
import './ConversationInfoModal.css';

type PickedUser = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

type Props = {
  conversationId: string;
  onClose: () => void;
  /* Called after the user leaves the conversation */
  onLeft?: () => void;
};

/* Members, rename, add people, leave — for groups. Members + profile link for DMs. */
export default function ConversationInfoModal({ conversationId, onClose, onLeft }: Props) {
  const { userId, getConversation, refreshConversations, leaveConversation } = useChat();
  const conv = getConversation(conversationId);

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(conv?.name || '');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<PickedUser[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useScrollLock();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (!conv) return null;

  const title = conversationTitle(conv, userId);
  const memberIds = conv.members.map((m) => m.user_id);

  const handleRename = async () => {
    const name = nameDraft.trim();
    if (saving) return;
    setSaving(true);
    setError(null);
    const { error: updErr } = await supabase
      .from('conversations')
      .update({ name: name || null })
      .eq('id', conversationId);
    setSaving(false);
    if (updErr) { setError('Could not rename the group.'); return; }
    setRenaming(false);
    refreshConversations();
  };

  const handleAdd = async () => {
    if (toAdd.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const { error: insErr } = await supabase
      .from('conversation_members')
      .insert(toAdd.map((u) => ({ conversation_id: conversationId, user_id: u.id })));
    setSaving(false);
    if (insErr) { setError('Could not add people.'); return; }
    setToAdd([]);
    setAdding(false);
    refreshConversations();
  };

  const handleLeave = async () => {
    setConfirmLeave(false);
    const ok = await leaveConversation(conversationId);
    if (!ok) { setError('Could not leave the group.'); return; }
    onClose();
    onLeft?.();
  };

  return createPortal(
    <div className="ci-backdrop" onClick={onClose}>
      <div className="ci-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ci-header">
          <div className="ci-title">
            {conv.is_group ? <Users size={16} /> : <Info size={16} />}
            {renaming ? (
              <div className="ci-rename">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Group name"
                  maxLength={60}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
                />
                <button className="ci-icon-btn" onClick={handleRename} disabled={saving} title="Save"><Check size={15} /></button>
                <button className="ci-icon-btn" onClick={() => { setRenaming(false); setNameDraft(conv.name || ''); }} title="Cancel"><X size={15} /></button>
              </div>
            ) : (
              <>
                <h3>{title}</h3>
                {conv.is_group && (
                  <button className="ci-icon-btn" onClick={() => setRenaming(true)} title="Rename group"><Pencil size={14} /></button>
                )}
              </>
            )}
          </div>
          <button className="ci-close" onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        <div className="ci-body">
          {/* Members */}
          <div className="ci-section-label">
            {conv.is_group ? `${conv.members.length} members` : 'People'}
          </div>
          <div className="ci-members">
            {conv.members.map((m) => (
              <Link key={m.user_id} to={`/profile/${m.user_id}`} className="ci-member" onClick={onClose}>
                <div className="ci-avatar">
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt={m.username} loading="lazy" />
                    : <span>{(m.username[0] || '?').toUpperCase()}</span>
                  }
                </div>
                <span className="ci-username">{displayName(m)}</span>
                {m.user_id === userId && <span className="ci-you">you</span>}
                {conv.is_group && m.user_id === conv.created_by && <span className="ci-you">creator</span>}
              </Link>
            ))}
          </div>

          {/* Add people (groups) */}
          {conv.is_group && (
            adding ? (
              <div className="ci-add">
                <UserPicker
                  excludeIds={memberIds}
                  selected={toAdd}
                  onChange={setToAdd}
                  placeholder="Search people to add…"
                  autoFocus
                />
                <div className="ci-add-actions">
                  <button className="btn-ghost" onClick={() => { setAdding(false); setToAdd([]); }}>Cancel</button>
                  <button className="btn-primary" onClick={handleAdd} disabled={toAdd.length === 0 || saving}>
                    {saving ? 'Adding…' : `Add ${toAdd.length || ''}`.trim()}
                  </button>
                </div>
              </div>
            ) : (
              <button className="ci-action" onClick={() => setAdding(true)}>
                <UserPlus size={15} /> Add people
              </button>
            )
          )}

          {error && <p className="error-msg">{error}</p>}
        </div>

        {/* Leave (groups) */}
        {conv.is_group && (
          <div className="ci-footer">
            <button className="ci-leave" onClick={() => setConfirmLeave(true)}>
              <LogOut size={14} /> Leave group
            </button>
          </div>
        )}
      </div>

      {confirmLeave && (
        <ConfirmModal
          title="Leave this group?"
          message="You'll stop receiving messages from this group. You can be added back by a member."
          confirmLabel="Leave"
          danger
          onConfirm={handleLeave}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>,
    document.body
  );
}
