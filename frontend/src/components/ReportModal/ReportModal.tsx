import { useState, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useScrollLock } from '../../lib/useScrollLock';
import { useDialog } from '../../lib/useDialog';
import { useToast } from '../../context/ToastContext';
import { describeError } from '../../lib/errors';
import CharCount from '../CharCount/CharCount';
import './ReportModal.css';

export type ReportTarget = 'post' | 'comment' | 'user' | 'message';

type Props = {
  targetType: ReportTarget;
  targetId: string;
  onClose: () => void;
};

const REASON_MAX = 500;

/* Quick reasons fill the box; the person can still edit the text */
const QUICK_REASONS: { label: string; text: string }[] = [
  { label: 'Spam', text: 'Spam' },
  { label: 'Harassment', text: 'Harassment' },
  { label: 'Inappropriate', text: 'Inappropriate content' },
  { label: 'Other', text: 'Other: ' },
];

const TITLES: Record<ReportTarget, string> = {
  post: 'Report this post',
  comment: 'Report this comment',
  user: 'Report this user',
  message: 'Report this message',
};

export default function ReportModal({ targetType, targetId, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const toast = useToast();

  useScrollLock();
  useDialog(boxRef, () => { if (!sending) onClose(); });

  const trimmed = reason.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || sending) return;
    setSending(true);
    setError('');
    /* reporter_id defaults to auth.uid() on the server */
    const { error: dbError } = await supabase
      .from('reports')
      .insert({ target_type: targetType, target_id: targetId, reason: trimmed });
    if (!dbError) {
      toast.success('Report sent. Thank you.');
      onClose();
      return;
    }
    if (dbError.code === '23505') {
      toast.info('You already reported this.');
      onClose();
      return;
    }
    setError(describeError(dbError, 'Could not send your report. Please try again.'));
    setSending(false);
  };

  return createPortal(
    <div className="report-backdrop" onClick={() => { if (!sending) onClose(); }}>
      <div
        className="report-box"
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="report-header">
          <h3 id={`${id}-title`}>{TITLES[targetType]}</h3>
          <button type="button" className="report-close" onClick={onClose} disabled={sending} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="report-body">
            <p className="report-hint">Tell us what is wrong. Only the moderators see your report.</p>
            <div className="report-quick" role="group" aria-label="Quick reasons">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  className="report-chip"
                  onClick={() => { setReason(r.text); textRef.current?.focus(); }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <label className="report-label" htmlFor={`${id}-reason`}>Reason</label>
            <textarea
              id={`${id}-reason`}
              ref={textRef}
              className="report-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={REASON_MAX}
              rows={4}
              required
            />
            <CharCount length={reason.length} max={REASON_MAX} className="report-char-count" />
            {error && <p className="report-error" role="alert">{error}</p>}
          </div>

          <div className="report-footer">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={sending}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!trimmed || sending}>
              {sending ? 'Sending…' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
