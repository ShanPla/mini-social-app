import { useEffect, useRef } from 'react';
import './LoadMore.css';

type Props = {
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
  endLabel?: string;
};

/*
 * Bottom of a paged list. Scrolling near it loads the next page; the button
 * does the same for keyboards, screen readers and when the observer is not
 * available. Shows the end label once there is nothing left.
 */
export default function LoadMore({ hasMore, loading, onMore, endLabel = 'You are all caught up' }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || loading) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) onMore(); },
      { rootMargin: '400px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, onMore]);

  if (!hasMore) return <p className="load-more-end">{endLabel}</p>;

  return (
    <div ref={ref} className="load-more">
      <button type="button" className="btn-ghost" onClick={onMore} disabled={loading}>
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}
