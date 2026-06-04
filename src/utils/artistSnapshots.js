export const FOLLOWED_ARTIST_SNAPSHOTS_KEY = 'followedArtistSnapshots';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

export const normalizeArtistSnapshot = (artist, options = {}) => {
  const id = normalizeText(options.id || artist?.id || artist?.externalId || artist?.external_id);

  if (!id) {
    return null;
  }

  return {
    id,
    externalId: normalizeText(artist?.externalId || artist?.external_id || ''),
    name: normalizeText(artist?.name) || '아티스트',
    imageUrl: normalizeText(artist?.imageUrl || artist?.image_url || ''),
    genres: Array.isArray(artist?.genres) ? artist.genres.filter(Boolean) : [],
    source: normalizeText(artist?.source) || 'manual',
  };
};

export const getSafeArtistSnapshots = (snapshots) => {
  const seenKeys = new Set();
  const safeSnapshots = Array.isArray(snapshots) ? snapshots : [];

  return safeSnapshots
    .map((snapshot) => normalizeArtistSnapshot(snapshot))
    .filter((snapshot) => {
      if (!snapshot) {
        return false;
      }

      const key = snapshot.externalId ? `external:${snapshot.externalId}` : `id:${snapshot.id}`;

      if (seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    });
};

export const mergeArtistSnapshots = (currentSnapshots, nextSnapshots) => {
  const snapshotByKey = new Map();

  [...getSafeArtistSnapshots(currentSnapshots), ...getSafeArtistSnapshots(nextSnapshots)].forEach((snapshot) => {
    const key = snapshot.externalId ? `external:${snapshot.externalId}` : `id:${snapshot.id}`;
    snapshotByKey.set(key, snapshot);
  });

  return Array.from(snapshotByKey.values()).slice(-80);
};

export const removeArtistSnapshotsByIds = (snapshots, artistIds) => {
  const ids = new Set((Array.isArray(artistIds) ? artistIds : []).filter(Boolean));

  if (ids.size === 0) {
    return getSafeArtistSnapshots(snapshots);
  }

  return getSafeArtistSnapshots(snapshots).filter(
    (snapshot) => !ids.has(snapshot.id) && !ids.has(snapshot.externalId),
  );
};

export const readArtistSnapshots = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    return getSafeArtistSnapshots(JSON.parse(window.localStorage.getItem(FOLLOWED_ARTIST_SNAPSHOTS_KEY) || '[]'));
  } catch {
    return [];
  }
};

export const writeArtistSnapshots = (snapshots) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(FOLLOWED_ARTIST_SNAPSHOTS_KEY, JSON.stringify(getSafeArtistSnapshots(snapshots)));
};

export const findArtistSnapshot = (artistId) => {
  const id = normalizeText(artistId);

  if (!id) {
    return null;
  }

  return readArtistSnapshots().find((snapshot) => snapshot.id === id || snapshot.externalId === id) || null;
};
