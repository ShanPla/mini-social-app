import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Reply } from 'lucide-react';
import { REACTION_EMOJI } from '../../lib/reactions';
import { moveFocus } from '../../lib/menuKeys';
import './ReactionPicker.css';

const EMOJI_LABEL: Record<string, string> = {
  [REACTION_EMOJI[0]]: 'Thumbs up',
  [REACTION_EMOJI[1]]: 'Heart',
  [REACTION_EMOJI[2]]: 'Laughing',
  [REACTION_EMOJI[3]]: 'Surprised',
  [REACTION_EMOJI[4]]: 'Sad',
  [REACTION_EMOJI[5]]: 'Thanks',
};

/* Rough width of the bar, used only to keep it on screen */
const BAR_WIDTH = 300;
const BAR_HEIGHT = 52;

type Props = {
  /* Where the bar was opened (viewport coordinates), taken when it opened */
  anchor: { top: number; bottom: number; left: number; width: number };
  /* My current reaction on this message, if any */
  current: string | null;
  onPick: (emoji: string) => void;
  /* Long-press menu on a phone also offers Reply */
  onReply?: () => void;
  /* restoreFocus: give focus back to the button that opened the bar */
  onClose: (restoreFocus: boolean) => void;
};

/*
 * The six reactions as a toolbar next to a message. Arrow keys move,
 * Escape and Tab close, a tap outside or any scrolling closes.
 */
export default function ReactionPicker({ anchor, current, onPick, onReply, onClose }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const bar = barRef.current;
    const first = bar?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? bar?.querySelector<HTMLElement>('button');
    first?.focus();

    const handlePointer = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) closeRef.current(false);
    };
    const handleScroll = (e: Event) => {
      if (barRef.current && e.target instanceof Node && barRef.current.contains(e.target)) return;
      closeRef.current(false);
    };
    const handleResize = () => closeRef.current(false);
    document.addEventListener('pointerdown', handlePointer, true);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointer, true);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onClose(true);
    } else {
      /* Left / Right move like Up / Down do in a menu */
      const key = e.key === 'ArrowLeft' ? 'ArrowUp' : e.key === 'ArrowRight' ? 'ArrowDown' : e.key;
      if (moveFocus(barRef.current, key, 'button')) e.preventDefault();
    }
  };

  const above = anchor.top - BAR_HEIGHT - 6 >= 8;
  const top = above ? anchor.top - BAR_HEIGHT - 6 : anchor.bottom + 6;
  const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - BAR_WIDTH / 2, window.innerWidth - BAR_WIDTH - 8));

  return createPortal(
    <div
      ref={barRef}
      className="react-picker"
      role="toolbar"
      aria-label="Add a reaction"
      style={{ top, left }}
      onKeyDown={handleKeyDown}
    >
      {REACTION_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={`react-picker-btn ${current === emoji ? 'react-picker-btn--on' : ''}`}
          aria-label={EMOJI_LABEL[emoji]}
          aria-pressed={current === emoji}
          title={current === emoji ? `${EMOJI_LABEL[emoji]} (tap to remove)` : EMOJI_LABEL[emoji]}
          tabIndex={-1}
          onClick={() => onPick(emoji)}
        >
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
      {onReply && (
        <button type="button" className="react-picker-btn react-picker-reply" aria-label="Reply" title="Reply" tabIndex={-1} onClick={onReply}>
          <Reply size={18} />
        </button>
      )}
    </div>,
    document.body,
  );
}
