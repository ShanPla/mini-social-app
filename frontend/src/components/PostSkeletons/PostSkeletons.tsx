import './PostSkeletons.css';

/* Grey placeholder cards shown while posts load (feed and the single-post page) */
export default function PostSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="post-skels" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="post-skel">
          <div className="post-skel-header">
            <div className="post-skel-avatar" />
            <div className="post-skel-meta">
              <div className="post-skel-line post-skel-line--short" />
              <div className="post-skel-line post-skel-line--xshort" />
            </div>
          </div>
          <div className="post-skel-line post-skel-line--wide" />
          <div className="post-skel-line post-skel-line--medium" />
        </div>
      ))}
    </div>
  );
}
