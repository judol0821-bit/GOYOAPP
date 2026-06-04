import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureArtistSaved } from '../api/artists.js';
import ArtistAvatar from '../components/ArtistAvatar.jsx';
import useArtistSearch from '../hooks/useArtistSearch.js';
import useLocalStorage from '../hooks/useLocalStorage.js';
import {
  getSafeArtistSnapshots,
  mergeArtistSnapshots,
  normalizeArtistSnapshot,
  removeArtistSnapshotsByIds,
} from '../utils/artistSnapshots.js';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [savedArtistIdsByExternalId, setSavedArtistIdsByExternalId] = useState({});
  const [followedArtistIds, setFollowedArtistIds] = useLocalStorage('followedArtistIds', []);
  const [followedArtistSnapshots, setFollowedArtistSnapshots] = useLocalStorage('followedArtistSnapshots', []);
  const {
    artists: filteredArtists,
    error: searchError,
    hasQuery,
    isLoading: isSearching,
  } = useArtistSearch(searchQuery, { includeAllWhenEmpty: true });

  const selectedArtistIds = Array.isArray(followedArtistIds) ? followedArtistIds : [];
  const safeArtistSnapshots = getSafeArtistSnapshots(followedArtistSnapshots);

  const getArtistFollowIds = (artist) => {
    const externalId = artist?.externalId || '';
    const localSavedId = externalId ? savedArtistIdsByExternalId[externalId] : '';
    const snapshotSavedId = externalId
      ? safeArtistSnapshots.find((snapshot) => snapshot.externalId === externalId)?.id
      : '';

    return [artist?.id, externalId, localSavedId, snapshotSavedId].filter(Boolean);
  };

  const toggleFollow = async (artist) => {
    const artistIds = getArtistFollowIds(artist);
    const isAlreadyFollowed = artistIds.some((artistId) => selectedArtistIds.includes(artistId));

    if (isAlreadyFollowed) {
      setFollowedArtistIds((currentIds) => {
        const safeIds = Array.isArray(currentIds) ? currentIds : [];
        return safeIds.filter((id) => !artistIds.includes(id));
      });
      setFollowedArtistSnapshots((currentSnapshots) => removeArtistSnapshotsByIds(currentSnapshots, artistIds));
      return;
    }

    const savedArtist = await ensureArtistSaved(artist);
    const nextArtistId = savedArtist?.id || artist?.id || artist?.externalId;

    if (!nextArtistId) {
      return;
    }

    const spotifyExternalId = artist?.source === 'spotify' ? artist.externalId || artist.id : '';

    if (spotifyExternalId && savedArtist?.id) {
      setSavedArtistIdsByExternalId((currentMap) => ({
        ...currentMap,
        [spotifyExternalId]: savedArtist.id,
      }));
    }

    setFollowedArtistIds((currentIds) => {
      const safeIds = Array.isArray(currentIds) ? currentIds : [];

      if (safeIds.includes(nextArtistId)) {
        return safeIds;
      }

      return [...safeIds, nextArtistId];
    });

    const snapshot = normalizeArtistSnapshot(
      {
        ...artist,
        ...savedArtist,
        externalId: artist?.externalId || savedArtist?.externalId || '',
        imageUrl: artist?.imageUrl || savedArtist?.imageUrl || '',
        genres:
          Array.isArray(artist?.genres) && artist.genres.length > 0 ? artist.genres : savedArtist?.genres,
        source: savedArtist?.source || artist?.source || 'manual',
      },
      { id: nextArtistId },
    );

    if (snapshot) {
      setFollowedArtistSnapshots((currentSnapshots) => mergeArtistSnapshots(currentSnapshots, [snapshot]));
    }
  };

  const canStart = selectedArtistIds.length > 0;

  const handleStart = () => {
    if (!canStart) {
      return;
    }

    navigate('/preview');
  };

  return (
    <main className="page page-onboarding" aria-label="onboarding">
      <section className="onboarding-hero">
        <p className="app-kicker">GOYO</p>
        <h1>좋아하는 음악 소식을 조용히 모아볼게요.</h1>
        <p>
          관심 있는 아티스트를 팔로우하면 공연, 앨범, 티켓, 페스티벌 소식을 한곳에서
          확인할 수 있어요.
        </p>
      </section>

      <label className="artist-search" htmlFor="artist-search">
        <span>아티스트 검색</span>
        <input
          id="artist-search"
          type="search"
          value={searchQuery}
          placeholder="아티스트 이름 또는 장르"
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>

      {isSearching && <p className="artist-search-state">검색 중이에요.</p>}
      {searchError && <p className="artist-search-state is-error">{searchError}</p>}

      <section className="artist-section" aria-label="artist list">
        <div className="artist-section-header">
          <h2>아티스트</h2>
          <span>{selectedArtistIds.length}명 선택</span>
        </div>

        {!isSearching && filteredArtists.length === 0 ? (
          <div className="artist-empty-card">
            <strong>검색 결과가 없어요.</strong>
            <p>{hasQuery ? '다른 이름이나 장르로 검색해 보세요.' : '표시할 아티스트가 없어요.'}</p>
          </div>
        ) : (
          <div className="artist-list" aria-busy={isSearching}>
            {filteredArtists.map((artist) => {
              const artistIds = getArtistFollowIds(artist);
              const isFollowed = artistIds.some((artistId) => selectedArtistIds.includes(artistId));
              const genres = Array.isArray(artist.genres) ? artist.genres : [];

              return (
                <article className="artist-item" key={artist.id}>
                  <ArtistAvatar artist={artist} />

                  <div className="artist-info">
                    <h3>{artist.name}</h3>
                    <p>{genres.join(' · ')}</p>
                  </div>

                  <button
                    className={isFollowed ? 'follow-button is-followed' : 'follow-button'}
                    type="button"
                    aria-pressed={isFollowed}
                    onClick={() => toggleFollow(artist)}
                  >
                    {isFollowed ? '해제' : '팔로우'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="onboarding-action">
        <button className="start-button" type="button" disabled={!canStart} onClick={handleStart}>
          시작하기
        </button>
      </div>
    </main>
  );
}
