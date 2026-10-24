import './CharCount.css';

/*
 * A length/limit counter for a text field, e.g. 460/500.
 * Turns accent coloured near the limit (the last 10% of it, at least 10
 * characters) and bold once the limit is reached. Near the limit it also
 * tells screen readers how many characters are left. It is not a live
 * region on purpose: announcing every keystroke would be noise.
 */
export default function CharCount({ length, max, className }: { length: number; max: number; className?: string }) {
  /* Never below zero, e.g. text loaded from before a limit was lowered */
  const left = Math.max(0, max - length);
  const full = length >= max;
  const near = left <= Math.max(10, Math.round(max * 0.1));
  const state = full ? 'char-count--full' : near ? 'char-count--near' : '';

  return (
    <span className={`char-count ${state} ${className ?? ''}`}>
      {length}/{max}
      {near && <span className="char-count-sr"> — {left} characters left</span>}
    </span>
  );
}
