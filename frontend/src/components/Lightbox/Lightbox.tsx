import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../lib/useScrollLock';
import { useDialog } from '../../lib/useDialog';
import './Lightbox.css';

type Props = {
  images: string[];
  startIndex?: number;
  onClose: () => void;
};

export default function Lightbox({ images, startIndex = 0, onClose }: Props) {
  const [current, setCurrent] = useState(startIndex);

  const hasPrev = current > 0;
  const hasNext = current < images.length - 1;

  const boxRef = useRef<HTMLDivElement>(null);

  useScrollLock();
  /* Focus starts on Close, Tab stays inside, Escape closes */
  useDialog(boxRef, onClose);

  /* Left and right arrows page through the images */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrev) setCurrent((c) => c - 1);
      if (e.key === 'ArrowRight' && hasNext) setCurrent((c) => c + 1);
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [hasPrev, hasNext]);

  return createPortal(
    <div
      className="lightbox-backdrop"
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label={images.length > 1 ? `Image ${current + 1} of ${images.length}` : 'Image'}
      tabIndex={-1}
      onClick={onClose}
    >
      {/* Close button */}
      <button className="lightbox-close" onClick={onClose} aria-label="Close" title="Close">✕</button>

      {/* Counter */}
      {images.length > 1 && (
        <div className="lightbox-counter">{current + 1} / {images.length}</div>
      )}

      {/* Prev */}
      {hasPrev && (
        <button
          className="lightbox-nav lightbox-nav--prev"
          onClick={(e) => { e.stopPropagation(); setCurrent((c) => c - 1); }}
          aria-label="Previous image"
          title="Previous image"
        >‹</button>
      )}

      {/* Image */}
      <div className="lightbox-image-wrap" onClick={(e) => e.stopPropagation()}>
        <img src={images[current]} alt={`Image ${current + 1}`} className="lightbox-image" loading="lazy" />
      </div>

      {/* Next */}
      {hasNext && (
        <button
          className="lightbox-nav lightbox-nav--next"
          onClick={(e) => { e.stopPropagation(); setCurrent((c) => c + 1); }}
          aria-label="Next image"
          title="Next image"
        >›</button>
      )}

      {/* Thumbnail strip for multiple images */}
      {images.length > 1 && (
        <div className="lightbox-thumbs" onClick={(e) => e.stopPropagation()}>
          {images.map((src, i) => (
            <button
              type="button"
              key={i}
              className={`lightbox-thumb ${i === current ? 'active' : ''}`}
              onClick={() => setCurrent(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === current ? 'true' : undefined}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}