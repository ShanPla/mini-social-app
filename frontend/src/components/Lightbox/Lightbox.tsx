import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

  useEffect(() => {
    document.body.style.overflow = 'hidden';

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) setCurrent((c) => c - 1);
      if (e.key === 'ArrowRight' && hasNext) setCurrent((c) => c + 1);
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [hasPrev, hasNext, onClose]);

  return createPortal(
    <div className="lightbox-backdrop" onClick={onClose}>
      {/* Close button */}
      <button className="lightbox-close" onClick={onClose}>✕</button>

      {/* Counter */}
      {images.length > 1 && (
        <div className="lightbox-counter">{current + 1} / {images.length}</div>
      )}

      {/* Prev */}
      {hasPrev && (
        <button
          className="lightbox-nav lightbox-nav--prev"
          onClick={(e) => { e.stopPropagation(); setCurrent((c) => c - 1); }}
        >‹</button>
      )}

      {/* Image */}
      <div className="lightbox-image-wrap" onClick={(e) => e.stopPropagation()}>
        <img src={images[current]} alt={`Image ${current + 1}`} className="lightbox-image" />
      </div>

      {/* Next */}
      {hasNext && (
        <button
          className="lightbox-nav lightbox-nav--next"
          onClick={(e) => { e.stopPropagation(); setCurrent((c) => c + 1); }}
        >›</button>
      )}

      {/* Thumbnail strip for multiple images */}
      {images.length > 1 && (
        <div className="lightbox-thumbs" onClick={(e) => e.stopPropagation()}>
          {images.map((src, i) => (
            <div
              key={i}
              className={`lightbox-thumb ${i === current ? 'active' : ''}`}
              onClick={() => setCurrent(i)}
            >
              <img src={src} alt={`Thumb ${i + 1}`} />
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}