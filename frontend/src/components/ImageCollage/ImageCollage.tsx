import { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import Lightbox from '../Lightbox/Lightbox';
import './ImageCollage.css';

type Props = {
  images: string[];
};

/* Expand hint shown on hover and on keyboard focus. Module scope: declared
   inside the component it would be a new type every render and React would
   remount it each time. */
const ExpandHint = () => (
  <span className="collage-expand-hint">
    <ZoomIn size={20} color="white" />
  </span>
);

export default function ImageCollage({ images }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!images.length) return null;

  const count = images.length;
  const displayImages = images.slice(0, 4);
  const overflow = count > 4 ? count - 3 : 0;

  const handleClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(index);
  };

  /* Tiles are buttons, so the keyboard can open the lightbox too */
  const label = (index: number) => (count === 1 ? 'Open image' : `Open image ${index + 1} of ${count}`);

  return (
    <>
      {count === 1 && (
        <div className="collage collage--1">
          <button type="button" className="collage-img" onClick={(e) => handleClick(0, e)} aria-label={label(0)}>
            <img src={displayImages[0]} alt="Post image" loading="lazy" />
            <ExpandHint />
          </button>
        </div>
      )}

      {count === 2 && (
        <div className="collage collage--2">
          {displayImages.map((src, i) => (
            <button type="button" key={i} className="collage-img" onClick={(e) => handleClick(i, e)} aria-label={label(i)}>
              <img src={src} alt={`Post image ${i + 1}`} loading="lazy" />
              <ExpandHint />
            </button>
          ))}
        </div>
      )}

      {count === 3 && (
        <div className="collage collage--3">
          <button type="button" className="collage-img collage-img--main" onClick={(e) => handleClick(0, e)} aria-label={label(0)}>
            <img src={displayImages[0]} alt="Post image 1" loading="lazy" />
            <ExpandHint />
          </button>
          <div className="collage-side">
            {displayImages.slice(1).map((src, i) => (
              <button type="button" key={i} className="collage-img" onClick={(e) => handleClick(i + 1, e)} aria-label={label(i + 1)}>
                <img src={src} alt={`Post image ${i + 2}`} loading="lazy" />
                <ExpandHint />
              </button>
            ))}
          </div>
        </div>
      )}

      {count >= 4 && (
        <div className="collage collage--4">
          {displayImages.map((src, i) => (
            <button type="button" key={i} className="collage-img" onClick={(e) => handleClick(i, e)} aria-label={label(i)}>
              <img src={src} alt={`Post image ${i + 1}`} loading="lazy" />
              {i === 3 && overflow > 0
                ? <span className="collage-overflow">+{overflow}</span>
                : <ExpandHint />
              }
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
