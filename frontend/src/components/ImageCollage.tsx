import './ImageCollage.css';

type Props = {
  images: string[];
  onImageClick?: (index: number) => void;
};

export default function ImageCollage({ images, onImageClick }: Props) {
  if (!images.length) return null;

  const count = images.length;
  const displayImages = images.slice(0, 4);
  const overflow = count > 4 ? count - 3 : 0;

  const handleClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onImageClick?.(index);
  };

  if (count === 1) {
    return (
      <div className="collage collage--1">
        <div className="collage-img" onClick={(e) => handleClick(0, e)}>
          <img src={displayImages[0]} alt="Post image" />
        </div>
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="collage collage--2">
        {displayImages.map((src, i) => (
          <div key={i} className="collage-img" onClick={(e) => handleClick(i, e)}>
            <img src={src} alt={`Post image ${i + 1}`} />
          </div>
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="collage collage--3">
        <div className="collage-img collage-img--main" onClick={(e) => handleClick(0, e)}>
          <img src={displayImages[0]} alt="Post image 1" />
        </div>
        <div className="collage-side">
          {displayImages.slice(1).map((src, i) => (
            <div key={i} className="collage-img" onClick={(e) => handleClick(i + 1, e)}>
              <img src={src} alt={`Post image ${i + 2}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 4+ images
  return (
    <div className="collage collage--4">
      {displayImages.map((src, i) => (
        <div
          key={i}
          className="collage-img"
          onClick={(e) => handleClick(i, e)}
        >
          <img src={src} alt={`Post image ${i + 1}`} />
          {i === 3 && overflow > 0 && (
            <div className="collage-overflow">+{overflow}</div>
          )}
        </div>
      ))}
    </div>
  );
}
