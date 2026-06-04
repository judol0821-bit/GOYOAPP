import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getArtistById } from '../api/artists.js';
import { getCalendarEvents } from '../api/calendar.js';
import { getNewsByFollowedArtists } from '../api/news.js';
import { getHiddenNews } from '../api/preferences.js';
import ArtistAvatar from '../components/ArtistAvatar.jsx';
import useLocalStorage from '../hooks/useLocalStorage.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { getAnonymousUserId } from '../utils/anonymousUser.js';
import { getSafeArtistSnapshots } from '../utils/artistSnapshots.js';
import { getSafeCalendarEvents } from '../utils/calendarEvents.js';
import {
  filterCachedNewsByArtistIds,
  HOME_NEWS_CACHE_KEY,
  readCachedNewsItems,
  writeCachedNewsItems,
} from '../utils/newsCache.js';

const typeLabels = {
  concert: '공연',
  album: '앨범',
  ticket: '티켓',
  festival: '페스티벌',
};

const typeMessages = {
  ticket: '예매를 놓치지 마세요',
  album: '새 음악이 도착했어요',
  concert: '공연 일정이 열렸어요',
};

const getTodayString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const date = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${date}`;
};

const toDateValue = (date) => new Date(`${date || '9999-12-31'}T00:00:00`).getTime();

const getDaysUntil = (date) => {
  const todayValue = toDateValue(getTodayString());
  const targetValue = toDateValue(date);

  return Math.round((targetValue - todayValue) / 86400000);
};

const formatDate = (date) => {
  if (typeof date !== 'string' || !date.includes('-')) {
    return '';
  }

  const [, month, day] = date.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
};

const getNewsMessage = (news) => {
  const daysUntil = getDaysUntil(news.date);

  if (daysUntil === 0) {
    return '오늘 확인할 소식이에요';
  }

  if (typeMessages[news.type]) {
    return typeMessages[news.type];
  }

  if (daysUntil > 0 && daysUntil <= 45) {
    return '곧 다가오는 일정이에요';
  }

  return '새로운 소식이 도착했어요';
};

const sortByDate = (a, b) => {
  const dateCompare = (a.date || '').localeCompare(b.date || '');

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return (a.startTime || a.time || '').localeCompare(b.startTime || b.time || '');
};

const sortByCreatedAtDesc = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');

const uniqueById = (items) => {
  const seenIds = new Set();
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems.filter((item) => {
    if (!item?.id || seenIds.has(item.id)) {
      return false;
    }

    seenIds.add(item.id);
    return true;
  });
};

const normalizeSearchText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const matchesArtistSearch = (artist, query) => {
  if (!query) {
    return true;
  }

  const genres = Array.isArray(artist.genres) ? artist.genres : [];
  const searchableText = `${artist.name || ''} ${genres.join(' ')}`.toLowerCase();

  return searchableText.includes(query);
};

const matchesNewsSearch = (news, query) => {
  if (!query) {
    return true;
  }

  const searchableText = [
    news.artistName,
    news.type,
    typeLabels[news.type],
    news.title,
    news.description,
    news.location,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(query);
};

const matchesEventSearch = (event, query) => {
  if (!query) {
    return true;
  }

  const searchableText = [event.artistName, event.type, typeLabels[event.type], event.title, event.location]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(query);
};

export default function HomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [artistItems, setArtistItems] = useState([]);
  const [calendarItems, setCalendarItems] = useState(null);
  const [newsItems, setNewsItems] = useState([]);
  const [homeState, setHomeState] = useState({
    error: null,
    isLoading: true,
  });
  const [followedArtistIds] = useLocalStorage('followedArtistIds', []);
  const [followedArtistSnapshots] = useLocalStorage('followedArtistSnapshots', []);
  const [hiddenNewsIds, setHiddenNewsIds] = useLocalStorage('hiddenNewsIds', []);
  const [calendarEvents] = useLocalStorage('calendarEvents', []);

  const anonymousUserId = useMemo(() => getAnonymousUserId(), []);
  const isOnline = useOnlineStatus();
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const safeFollowedArtistIds = Array.isArray(followedArtistIds) ? followedArtistIds : [];
  const safeArtistSnapshots = getSafeArtistSnapshots(followedArtistSnapshots);
  const safeHiddenNewsIds = Array.isArray(hiddenNewsIds) ? hiddenNewsIds : [];
  const safeCalendarEvents = getSafeCalendarEvents(calendarItems ?? calendarEvents);
  const followedArtistIdsKey = safeFollowedArtistIds.join('|');
  const followedArtistSnapshotsKey = safeArtistSnapshots
    .map((artist) => `${artist.id}:${artist.externalId}`)
    .join('|');

  useEffect(() => {
    let isCancelled = false;

    getCalendarEvents(anonymousUserId).then((events) => {
      if (!isCancelled) {
        setCalendarItems(events);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [anonymousUserId, calendarEvents]);

  useEffect(() => {
    let isCancelled = false;

    getHiddenNews(anonymousUserId).then((newsIds) => {
      if (!isCancelled && newsIds.length > 0) {
        setHiddenNewsIds((currentIds) => {
          const safeIds = Array.isArray(currentIds) ? currentIds : [];
          return [...new Set([...safeIds, ...newsIds])];
        });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [anonymousUserId]);

  useEffect(() => {
    let isCancelled = false;

    if (safeFollowedArtistIds.length === 0) {
      setArtistItems([]);
      setNewsItems([]);
      setHomeState({ error: null, isLoading: false });
      return undefined;
    }

    const cachedArtists = safeArtistSnapshots.filter(
      (artist) => safeFollowedArtistIds.includes(artist.id) || safeFollowedArtistIds.includes(artist.externalId),
    );
    const cachedNews = filterCachedNewsByArtistIds(
      readCachedNewsItems(HOME_NEWS_CACHE_KEY),
      safeFollowedArtistIds,
    );

    if (cachedArtists.length > 0) {
      setArtistItems(cachedArtists);
    }

    if (cachedNews.length > 0) {
      setNewsItems(cachedNews);
    }

    if (!isOnline) {
      setHomeState({
        error: cachedNews.length > 0 ? null : '네트워크 연결을 확인해주세요.',
        isLoading: false,
      });
      return undefined;
    }

    setHomeState({ error: null, isLoading: cachedArtists.length === 0 && cachedNews.length === 0 });

    Promise.all([
      Promise.all(safeFollowedArtistIds.map((artistId) => getArtistById(artistId))),
      getNewsByFollowedArtists(safeFollowedArtistIds),
    ])
      .then(([artists, news]) => {
        if (!isCancelled) {
          const nextArtists = artists.filter(Boolean);
          const nextNews = Array.isArray(news) ? news : [];

          setArtistItems(nextArtists.length > 0 ? nextArtists : cachedArtists);
          setNewsItems(nextNews);
          writeCachedNewsItems(HOME_NEWS_CACHE_KEY, nextNews);
          setHomeState({ error: null, isLoading: false });
        }
      })
      .catch((error) => {
        console.warn('Home data sync failed.', error);

        if (!isCancelled) {
          setArtistItems(cachedArtists);
          setNewsItems(cachedNews);
          setHomeState({
            error: cachedNews.length > 0 ? null : '네트워크 연결을 확인해주세요.',
            isLoading: false,
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [followedArtistIdsKey, followedArtistSnapshotsKey, isOnline]);

  const followedArtists = useMemo(() => {
    return uniqueById(artistItems).filter(
      (artist) => safeFollowedArtistIds.includes(artist.id) || safeFollowedArtistIds.includes(artist.externalId),
    );
  }, [artistItems, safeFollowedArtistIds]);

  const followedNews = useMemo(() => {
    return uniqueById(newsItems)
      .filter((news) => safeFollowedArtistIds.includes(news.artistId))
      .filter((news) => !safeHiddenNewsIds.includes(news.id));
  }, [newsItems, safeFollowedArtistIds, safeHiddenNewsIds]);

  const visibleArtists = useMemo(() => {
    return followedArtists.filter((artist) => matchesArtistSearch(artist, normalizedSearchQuery));
  }, [followedArtists, normalizedSearchQuery]);

  const visibleNews = useMemo(() => {
    return followedNews.filter((news) => matchesNewsSearch(news, normalizedSearchQuery));
  }, [followedNews, normalizedSearchQuery]);

  const importantNews = useMemo(() => {
    return [...visibleNews].sort(sortByDate)[0];
  }, [visibleNews]);

  const upcomingEvents = useMemo(() => {
    return [...safeCalendarEvents]
      .filter((event) => matchesEventSearch(event, normalizedSearchQuery))
      .sort(sortByDate)
      .slice(0, 3);
  }, [safeCalendarEvents, normalizedSearchQuery]);

  const latestNews = useMemo(() => {
    return [...visibleNews].sort(sortByCreatedAtDesc).slice(0, 4);
  }, [visibleNews]);

  const artistEmptyCopy = (() => {
    if (normalizedSearchQuery) {
      return {
        title: '검색된 아티스트가 없어요.',
        description: '다른 이름이나 장르로 검색해 보세요.',
      };
    }

    if (safeFollowedArtistIds.length > 0 && !isOnline) {
      return {
        title: '팔로우 정보를 불러올 수 없어요.',
        description: '네트워크 연결을 확인해주세요. 저장된 정보가 있으면 먼저 보여드릴게요.',
      };
    }

    return {
      title: '팔로우한 아티스트가 없어요.',
      description: '좋아하는 아티스트를 선택하면 홈이 채워져요.',
    };
  })();

  const newsEmptyCopy = (() => {
    if (normalizedSearchQuery) {
      return {
        title: '검색된 소식이 없어요.',
        description: '다른 아티스트나 키워드로 검색해 보세요.',
      };
    }

    if (safeFollowedArtistIds.length === 0) {
      return {
        title: '아직 팔로우한 아티스트가 없어요.',
        description: '온보딩에서 관심 있는 아티스트를 선택해 주세요.',
      };
    }

    if (!isOnline || homeState.error) {
      return {
        title: '네트워크 연결을 확인해주세요.',
        description: '저장된 소식이 있으면 먼저 보여드리고, 연결되면 다시 동기화할게요.',
      };
    }

    return {
      title: '새로운 소식이 아직 없어요.',
      description: '팔로우한 아티스트의 소식이 도착하면 보여드릴게요.',
    };
  })();

  return (
    <main className="page page-home" aria-label="home">
      <header className="home-header">
        <h1>GOYO</h1>
        <p>오늘의 고요</p>
      </header>

      <label className="home-searchbar" htmlFor="home-search">
        <span className="home-search-icon" aria-hidden="true" />
        <input
          id="home-search"
          type="search"
          value={searchQuery}
          placeholder="아티스트 검색"
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>

      <section className="home-section home-artist-section" aria-label="followed artists">
        <div className="home-section-header">
          <h2>팔로우 중인 아티스트</h2>
          <span>{visibleArtists.length}명</span>
        </div>

        {homeState.isLoading ? (
          <div className="home-empty-card compact">
            <strong>아티스트를 불러오는 중이에요.</strong>
            <p>팔로우한 아티스트를 정리하고 있어요.</p>
          </div>
        ) : visibleArtists.length > 0 ? (
          <div className="home-artist-list">
            {visibleArtists.map((artist) => (
              <article className="home-artist-item" key={artist.id}>
                <ArtistAvatar artist={artist} />
                <div>
                  <strong>{artist.name}</strong>
                  <p>{(Array.isArray(artist.genres) ? artist.genres : []).join(' · ')}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="home-empty-card compact">
            <strong>{artistEmptyCopy.title}</strong>
            <p>{homeState.error || artistEmptyCopy.description}</p>
          </div>
        )}
      </section>

      <section className="home-section" aria-label="important news">
        <div className="home-section-header">
          <h2>오늘 가장 중요한 소식</h2>
        </div>

        {homeState.isLoading ? (
          <div className="home-empty-card">
            <strong>소식을 불러오는 중이에요.</strong>
            <p>팔로우한 아티스트의 새 소식을 확인하고 있어요.</p>
          </div>
        ) : importantNews ? (
          <motion.button
            className="home-feature-card"
            type="button"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => navigate(`/detail/${importantNews.id}`)}
          >
            <span>{getNewsMessage(importantNews)}</span>
            <strong>{importantNews.title}</strong>
            <p>
              {importantNews.artistName} · {typeLabels[importantNews.type]} ·{' '}
              {formatDate(importantNews.date)} {importantNews.startTime}
            </p>
          </motion.button>
        ) : (
          <div className="home-empty-card">
            <strong>{newsEmptyCopy.title}</strong>
            <p>{newsEmptyCopy.description}</p>
          </div>
        )}
      </section>

      <section className="home-section" aria-label="upcoming events">
        <div className="home-section-header">
          <h2>다가오는 일정</h2>
          <span>곧 다가오는 일정이에요</span>
        </div>

        {upcomingEvents.length > 0 ? (
          <div className="home-event-list">
            {upcomingEvents.map((event) => (
              <article className="home-event-item" key={event.id}>
                <time dateTime={event.date}>{formatDate(event.date)}</time>
                <div>
                  <strong>{event.title}</strong>
                  <p>
                    {event.artistName} · {event.time} · {event.location}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="home-empty-card compact">
            <strong>저장된 일정이 없어요.</strong>
            <p>Preview에서 캘린더에 추가하면 여기에 표시돼요.</p>
          </div>
        )}
      </section>

      <section className="home-section" aria-label="new arrivals">
        <div className="home-section-header">
          <h2>최신 소식</h2>
        </div>

        {latestNews.length > 0 ? (
          <div className="home-news-list home-timeline">
            {latestNews.map((news) => (
              <div className="timeline-item" key={news.id}>
                <time className="timeline-date" dateTime={news.date}>
                  {formatDate(news.date)}
                </time>
                <motion.button
                  className="home-news-item timeline-card"
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-24px' }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => navigate(`/detail/${news.id}`)}
                >
                  <span>{typeLabels[news.type]}</span>
                  <strong>{news.title}</strong>
                  <p>{news.description}</p>
                </motion.button>
              </div>
            ))}
          </div>
        ) : (
          <div className="home-empty-card compact">
            <strong>{newsEmptyCopy.title}</strong>
            <p>{newsEmptyCopy.description}</p>
          </div>
        )}
      </section>
    </main>
  );
}
