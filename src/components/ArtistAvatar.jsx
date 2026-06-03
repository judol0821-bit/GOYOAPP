import { useState } from 'react';

const getInitial = (name) => {
  if (typeof name !== 'string' || !name.trim()) {
    return '?';
  }

  return name.trim().slice(0, 1);
};

export default function ArtistAvatar({ artist, className = '' }) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUrl = typeof artist?.imageUrl === 'string' ? artist.imageUrl.trim() : '';
  const artistName = artist?.name || '아티스트';
  const fallbackClassName = ['artist-avatar', className].filter(Boolean).join(' ');

  if (!imageUrl || hasImageError) {
    return (
      <span className={fallbackClassName} role="img" aria-label={`${artistName} 프로필 placeholder`}>
        {getInitial(artistName)}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={imageUrl}
      alt={`${artistName} 프로필`}
      loading="lazy"
      onError={() => setHasImageError(true)}
    />
  );
}
