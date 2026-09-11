import './LoadingScreen.css';

type Props = {
  /* Page-sized (inside the layout) rather than the full viewport */
  compact?: boolean;
};

/*
 * The ✦ that shows while something loads: the auth gate at startup, and the
 * Suspense fallback while a lazily loaded page's code arrives.
 * The glyph is decoration; the live region reads [Loading].
 */
export default function LoadingScreen({ compact = false }: Props) {
  return (
    <div className={`loading-screen ${compact ? 'loading-screen--compact' : ''}`} role="status">
      <span className="loading-screen-mark" aria-hidden="true">✦</span>
      <span className="loading-screen-text">Loading</span>
    </div>
  );
}
