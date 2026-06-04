import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getArtistById } from '../api/artists.js';
import { clearCalendarEvents as clearRemoteCalendarEvents, getCalendarEvents } from '../api/calendar.js';
import { clearHiddenNews as clearRemoteHiddenNews, getHiddenNews } from '../api/preferences.js';
import { testSpotifyConnection } from '../api/spotify.js';
import ArtistAvatar from '../components/ArtistAvatar.jsx';
import useLocalStorage from '../hooks/useLocalStorage.js';
import { testSupabaseConnection } from '../lib/supabase.js';
import { getAnonymousUserId } from '../utils/anonymousUser.js';
import { getSafeCalendarEvents } from '../utils/calendarEvents.js';

export default function MyPage() {
  const navigate = useNavigate();
  const [artistItems, setArtistItems] = useState([]);
  const [calendarItems, setCalendarItems] = useState(null);
  const [hiddenNewsItems, setHiddenNewsItems] = useState(null);
  const [isLoadingArtists, setIsLoadingArtists] = useState(true);
  const [supabaseStatus, setSupabaseStatus] = useState({
    message: 'Supabase 상태 확인 중',
    status: 'checking',
  });
  const [spotifyStatus, setSpotifyStatus] = useState({
    message: 'Spotify 상태 확인 중',
    status: 'checking',
  });
  const [followedArtistIds, , clearFollowedArtistIds] = useLocalStorage('followedArtistIds', []);
  const [hiddenNewsIds, , clearHiddenNewsIds] = useLocalStorage('hiddenNewsIds', []);
  const [calendarEvents, , clearCalendarEvents] = useLocalStorage('calendarEvents', []);

  const anonymousUserId = useMemo(() => getAnonymousUserId(), []);
  const safeFollowedArtistIds = Array.isArray(followedArtistIds) ? followedArtistIds : [];
  const safeHiddenNewsIds = Array.isArray(hiddenNewsItems ?? hiddenNewsIds) ? hiddenNewsItems ?? hiddenNewsIds : [];
  const safeCalendarEvents = getSafeCalendarEvents(calendarItems ?? calendarEvents);
  const followedArtistIdsKey = safeFollowedArtistIds.join('|');

  useEffect(() => {
    let isCancelled = false;

    testSupabaseConnection().then((status) => {
      if (!isCancelled) {
        setSupabaseStatus(status);
      }
    });

    testSpotifyConnection().then((status) => {
      if (!isCancelled) {
        setSpotifyStatus(status);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    getCalendarEvents(anonymousUserId).then((events) => {
      if (!isCancelled) {
        setCalendarItems(events);
      }
    });

    getHiddenNews(anonymousUserId).then((newsIds) => {
      if (!isCancelled) {
        setHiddenNewsItems(newsIds);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [anonymousUserId, calendarEvents, hiddenNewsIds]);

  useEffect(() => {
    let isCancelled = false;

    if (safeFollowedArtistIds.length === 0) {
      setArtistItems([]);
      setIsLoadingArtists(false);
      return undefined;
    }

    setIsLoadingArtists(true);

    Promise.all(safeFollowedArtistIds.map((artistId) => getArtistById(artistId)))
      .then((artists) => {
        if (!isCancelled) {
          setArtistItems(artists.filter(Boolean));
          setIsLoadingArtists(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setArtistItems([]);
          setIsLoadingArtists(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [followedArtistIdsKey]);

  const followedArtists = useMemo(() => {
    const seenIds = new Set();

    return artistItems.filter((artist) => {
      if (!artist?.id || seenIds.has(artist.id) || !safeFollowedArtistIds.includes(artist.id)) {
        return false;
      }

      seenIds.add(artist.id);
      return true;
    });
  }, [artistItems, safeFollowedArtistIds]);

  const handleReset = async () => {
    const confirmed = window.confirm('팔로우, 관심없음, 캘린더 데이터를 모두 초기화할까요?');

    if (!confirmed) {
      return;
    }

    await Promise.all([clearRemoteCalendarEvents(anonymousUserId), clearRemoteHiddenNews(anonymousUserId)]);

    clearFollowedArtistIds();
    clearHiddenNewsIds();
    clearCalendarEvents();
    setArtistItems([]);
    setCalendarItems([]);
    setHiddenNewsItems([]);
  };

  return (
    <main className="page page-my" aria-label="my">
      <header className="my-header">
        <p className="app-kicker">MY</p>
        <h1>마이</h1>
        <p>관심 아티스트와 저장한 음악 일정을 한눈에 확인해요.</p>
      </header>

      <section className="my-stat-grid" aria-label="my summary">
        <article>
          <strong>{followedArtists.length}</strong>
          <span>팔로우</span>
        </article>
        <article>
          <strong>{safeCalendarEvents.length}</strong>
          <span>캘린더 일정</span>
        </article>
        <article>
          <strong>{safeHiddenNewsIds.length}</strong>
          <span>관심없음</span>
        </article>
      </section>

      <section className="my-section" aria-label="followed artists">
        <div className="my-section-header">
          <h2>팔로우 중인 아티스트</h2>
          <span>{followedArtists.length}명</span>
        </div>

        {isLoadingArtists ? (
          <div className="my-empty-card">
            <strong>아티스트를 불러오는 중이에요.</strong>
            <p>팔로우 중인 아티스트를 확인하고 있어요.</p>
          </div>
        ) : followedArtists.length > 0 ? (
          <div className="my-artist-list">
            {followedArtists.map((artist) => (
              <article className="my-artist-item" key={artist.id}>
                <ArtistAvatar artist={artist} />
                <div>
                  <strong>{artist.name}</strong>
                  <p>{(Array.isArray(artist.genres) ? artist.genres : []).join(' · ')}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="my-empty-card">
            <strong>아직 팔로우한 아티스트가 없어요.</strong>
            <p>관심 아티스트를 선택하면 홈과 캘린더가 더 조용히 정리돼요.</p>
          </div>
        )}
      </section>

      <section className="my-action-panel" aria-label="my actions">
        <button className="my-primary-button" type="button" onClick={() => navigate('/onboarding')}>
          관심 아티스트 수정
        </button>
        <button className="my-danger-button" type="button" onClick={handleReset}>
          전체 데이터 초기화
        </button>
      </section>

      <p className={`my-supabase-status is-${supabaseStatus.status}`}>
        {supabaseStatus.message} / {spotifyStatus.message}
      </p>
    </main>
  );
}
