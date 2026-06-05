import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { addCalendarEvent } from '../api/calendar.js';
import { getNewsByFollowedArtists } from '../api/news.js';
import { getHiddenNews, hideNews } from '../api/preferences.js';
import useLocalStorage from '../hooks/useLocalStorage.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { getAnonymousUserId } from '../utils/anonymousUser.js';
import { getSafeCalendarEvents, hasCalendarEvent } from '../utils/calendarEvents.js';
import {
  filterCachedNewsByArtistIds,
  PREVIEW_NEWS_CACHE_KEY,
  readCachedNewsItems,
  writeCachedNewsItems,
} from '../utils/newsCache.js';
import { dedupeNewsItems, filterPreviewNews } from '../utils/newsRanking.js';

const newsTypeLabels = {
  concert: '공연',
  album: '앨범',
  ticket: '티켓',
  festival: '페스티벌',
};

const SWIPE_THRESHOLD = 72;
const PROCESSED_PREVIEW_NEWS_IDS_KEY = 'processedPreviewNewsIds';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getLocalDateKey = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const date = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${date}`;
};

const getProcessedPreviewNewsIdsKey = (artistIds) => {
  const scope = [...new Set((Array.isArray(artistIds) ? artistIds : []).filter(Boolean))]
    .sort()
    .join('|') || 'none';

  return `${PROCESSED_PREVIEW_NEWS_IDS_KEY}:${getLocalDateKey()}:${scope}`;
};

const readProcessedPreviewNewsIds = (storageKey) => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const value = JSON.parse(window.sessionStorage.getItem(storageKey) || '[]');
    return Array.isArray(value) ? value.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const writeProcessedPreviewNewsIds = (storageKey, newsIds) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(storageKey, JSON.stringify([...new Set(newsIds.filter(Boolean))]));
};

const debugPreviewFlow = (payload) => {
  if (import.meta.env?.DEV) {
    console.log('[GOYO preview]', payload);
  }
};

const PREVIEW_DISPLAY_LIMIT = 20;

const isSpotifyAlbumNews = (news) => news?.type === 'album' && String(news?.id || '').startsWith('spotify_album_');

const getArtistIdCandidates = (news) =>
  [news?.artistId, news?.artist_id, news?.frontendArtistId, news?.spotifyArtistId, news?.externalArtistId]
    .filter(Boolean);

const isNewsForFollowedArtists = (news, artistIds) => {
  const followedIdSet = new Set(Array.isArray(artistIds) ? artistIds.filter(Boolean) : []);

  if (followedIdSet.size === 0) {
    return false;
  }

  return getArtistIdCandidates(news).some((artistId) => followedIdSet.has(artistId));
};

const getPreviewDisplayNews = (items) => {
  const safeItems = dedupeNewsItems(items);
  const previewEligibleNews = filterPreviewNews(safeItems);
  const previewEligibleIds = new Set(previewEligibleNews.map((news) => news.id));
  const spotifyAlbumFallbackNews = safeItems.filter(
    (news) => isSpotifyAlbumNews(news) && !previewEligibleIds.has(news.id),
  );

  return dedupeNewsItems([...previewEligibleNews, ...spotifyAlbumFallbackNews]).slice(0, PREVIEW_DISPLAY_LIMIT);
};

export default function PreviewPage() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [newsItems, setNewsItems] = useState([]);
  const [completedNewsIds, setCompletedNewsIds] = useState([]);
  const [hasImageError, setHasImageError] = useState(false);
  const [newsState, setNewsState] = useState({
    error: null,
    isLoading: true,
  });
  const dragRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const didSwipeRef = useRef(false);
  const [followedArtistIds] = useLocalStorage('followedArtistIds', []);
  const [hiddenNewsIds, setHiddenNewsIds] = useLocalStorage('hiddenNewsIds', []);
  const [calendarEvents, setCalendarEvents] = useLocalStorage('calendarEvents', []);

  const anonymousUserId = useMemo(() => getAnonymousUserId(), []);
  const isOnline = useOnlineStatus();
  const safeFollowedArtistIds = Array.isArray(followedArtistIds) ? followedArtistIds : [];
  const safeHiddenNewsIds = Array.isArray(hiddenNewsIds) ? hiddenNewsIds : [];
  const safeCompletedNewsIds = Array.isArray(completedNewsIds) ? completedNewsIds : [];
  const safeCalendarEvents = getSafeCalendarEvents(calendarEvents);
  const followedArtistIdsKey = safeFollowedArtistIds.join('|');
  const processedPreviewNewsIdsKey = useMemo(
    () => getProcessedPreviewNewsIdsKey(safeFollowedArtistIds),
    [followedArtistIdsKey],
  );

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
      setNewsItems([]);
      setCompletedNewsIds([]);
      setCurrentIndex(0);
      setNewsState({ error: null, isLoading: false });
      return undefined;
    }

    const cachedPreviewNews = filterCachedNewsByArtistIds(
      readCachedNewsItems(PREVIEW_NEWS_CACHE_KEY),
      safeFollowedArtistIds,
    );

    if (cachedPreviewNews.length > 0) {
      setNewsItems(cachedPreviewNews);
      setCompletedNewsIds(readProcessedPreviewNewsIds(processedPreviewNewsIdsKey));
      setCurrentIndex(0);
    }

    if (!isOnline) {
      setNewsState({
        error: cachedPreviewNews.length > 0 ? null : '네트워크 연결을 확인해주세요.',
        isLoading: false,
      });
      return undefined;
    }

    setNewsState({ error: null, isLoading: cachedPreviewNews.length === 0 });

    getNewsByFollowedArtists(safeFollowedArtistIds)
      .then((items) => {
        if (!isCancelled) {
          const nextItems = Array.isArray(items) ? items : [];

          setNewsItems(nextItems);
          writeCachedNewsItems(PREVIEW_NEWS_CACHE_KEY, nextItems);
          setCompletedNewsIds(readProcessedPreviewNewsIds(processedPreviewNewsIdsKey));
          setCurrentIndex(0);
          setNewsState({ error: null, isLoading: false });
        }
      })
      .catch((error) => {
        console.warn('Preview news sync failed.', error);

        if (!isCancelled) {
          setNewsItems(cachedPreviewNews);
          setCompletedNewsIds(readProcessedPreviewNewsIds(processedPreviewNewsIdsKey));
          setCurrentIndex(0);
          setNewsState({
            error: cachedPreviewNews.length > 0 ? null : '네트워크 연결을 확인해주세요.',
            isLoading: false,
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [followedArtistIdsKey, isOnline, processedPreviewNewsIdsKey]);

  const visibleNews = useMemo(() => {
    return getPreviewDisplayNews(newsItems)
      .filter((news) => {
        const isFollowed = isNewsForFollowedArtists(news, safeFollowedArtistIds);
        const isHidden = safeHiddenNewsIds.includes(news.id);
        const isCompleted = safeCompletedNewsIds.includes(news.id);

        return isFollowed && !isHidden && !isCompleted;
      });
  }, [newsItems, safeFollowedArtistIds, safeHiddenNewsIds, safeCompletedNewsIds]);

  const eligiblePreviewNews = useMemo(() => {
    return getPreviewDisplayNews(newsItems)
      .filter((news) => isNewsForFollowedArtists(news, safeFollowedArtistIds))
      .filter((news) => !safeHiddenNewsIds.includes(news.id));
  }, [newsItems, safeFollowedArtistIds, safeHiddenNewsIds]);

  useEffect(() => {
    const safeNewsItems = dedupeNewsItems(newsItems);
    const spotifyAlbumNews = safeNewsItems.filter((news) => news.id?.startsWith?.('spotify_album_'));
    const previewFilteredNews = filterPreviewNews(safeNewsItems);
    const previewFilteredIds = new Set(previewFilteredNews.map((news) => news.id));
    const spotifyAlbumNewsFilteredByDate = spotifyAlbumNews.filter((news) => !previewFilteredIds.has(news.id));

    if (import.meta.env?.DEV) {
      console.log('spotifyAlbumNews', spotifyAlbumNews);
    }

    debugPreviewFlow({
      followedArtistIds: safeFollowedArtistIds,
      spotifyAlbumNewsCount: spotifyAlbumNews.length,
      spotifyAlbumNewsWithImages: spotifyAlbumNews.filter((news) => news.imageUrl || news.image_url).length,
      spotifyAlbumNewsExcludedByPreviewFilterCount: spotifyAlbumNewsFilteredByDate.length,
      spotifyAlbumNewsSample: spotifyAlbumNews.slice(0, 3).map((news) => ({
        id: news.id,
        title: news.title,
        type: news.type,
        date: news.date,
        artistId: news.artistId,
        spotifyArtistId: news.spotifyArtistId,
        imageUrl: news.imageUrl || news.image_url || '',
        description: news.description,
      })),
      supabaseNewsCount: safeNewsItems.length - spotifyAlbumNews.length,
      mergedNewsCount: safeNewsItems.length,
      hiddenNewsIdsCount: safeHiddenNewsIds.length,
      savedEventIds: safeCalendarEvents.map((event) => event.newsId).filter(Boolean),
      filteredPreviewNewsCount: visibleNews.length,
      processedPreviewNewsIds: safeCompletedNewsIds,
      processedPreviewNewsIdsKey,
    });
  }, [
    newsItems,
    safeFollowedArtistIds,
    safeHiddenNewsIds,
    safeCompletedNewsIds,
    safeCalendarEvents,
    visibleNews.length,
    processedPreviewNewsIdsKey,
  ]);

  useEffect(() => {
    if (currentIndex > 0 && currentIndex >= visibleNews.length) {
      setCurrentIndex(Math.max(visibleNews.length - 1, 0));
    }
  }, [currentIndex, visibleNews.length]);

  const currentNews = visibleNews[currentIndex];
  const isAddedToCalendar = currentNews ? hasCalendarEvent(safeCalendarEvents, currentNews.id) : false;
  const currentImageUrl = currentNews?.imageUrl || currentNews?.image_url || '';
  const previewTotalCount = eligiblePreviewNews.length;
  const currentProgressIndex = currentNews
    ? Math.min(previewTotalCount, previewTotalCount - visibleNews.length + currentIndex + 1)
    : previewTotalCount;
  const indicatorDotCount = Math.min(previewTotalCount, 5);
  const activeIndicatorIndex = (() => {
    if (indicatorDotCount <= 1 || previewTotalCount <= 1) {
      return 0;
    }

    const progressRatio = (currentProgressIndex - 1) / (previewTotalCount - 1);
    return clamp(Math.round(progressRatio * (indicatorDotCount - 1)), 0, indicatorDotCount - 1);
  })();

  useEffect(() => {
    setHasImageError(false);
  }, [currentNews?.id, currentImageUrl]);

  const markNewsCompleted = (newsId) => {
    if (!newsId) {
      return;
    }

    setCompletedNewsIds((currentIds) => {
      const safeIds = Array.isArray(currentIds) ? currentIds : [];
      const nextIds = safeIds.includes(newsId) ? safeIds : [...safeIds, newsId];

      writeProcessedPreviewNewsIds(processedPreviewNewsIdsKey, nextIds);
      return nextIds;
    });
  };

  const handleAddCalendar = async () => {
    if (!currentNews) {
      return;
    }

    const newsToAdd = currentNews;

    if (hasCalendarEvent(safeCalendarEvents, newsToAdd.id)) {
      markNewsCompleted(newsToAdd.id);
      return;
    }

    let nextEvent = null;

    try {
      nextEvent = await addCalendarEvent(anonymousUserId, newsToAdd);
    } catch (error) {
      console.warn('Calendar event save failed.', error);
      return;
    }

    if (!nextEvent) {
      console.warn('Calendar event was not saved.', newsToAdd);
      return;
    }

    setCalendarEvents((currentEvents) => {
      const safeEvents = getSafeCalendarEvents(currentEvents);

      if (hasCalendarEvent(safeEvents, newsToAdd.id)) {
        return safeEvents;
      }

      return [...safeEvents, nextEvent];
    });

    markNewsCompleted(newsToAdd.id);
  };

  const handleHideNews = () => {
    if (!currentNews) {
      return;
    }

    setHiddenNewsIds((currentIds) => {
      const safeIds = Array.isArray(currentIds) ? currentIds : [];
      return safeIds.includes(currentNews.id) ? safeIds : [...safeIds, currentNews.id];
    });

    hideNews(anonymousUserId, currentNews.id)
      .then((newsIds) => {
        setHiddenNewsIds((currentIds) => {
          const safeIds = Array.isArray(currentIds) ? currentIds : [];
          return [...new Set([...safeIds, ...newsIds])];
        });
      })
      .catch((error) => {
        console.warn('Hidden news save failed.', error);
      });
  };

  const handleShowDetail = () => {
    if (!currentNews) {
      return;
    }

    navigate(`/detail/${currentNews.id}`);
  };

  const resetDrag = () => {
    dragRef.current = {
      isDragging: false,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
    };
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  };

  const startDrag = (point) => {
    if (!currentNews) {
      return;
    }

    dragRef.current = {
      isDragging: true,
      startX: point.x,
      startY: point.y,
      offsetX: 0,
      offsetY: 0,
    };
    setIsDragging(true);
    setDragOffset({ x: 0, y: 0 });
  };

  const moveDrag = (point) => {
    if (!dragRef.current.isDragging) {
      return;
    }

    const offsetX = point.x - dragRef.current.startX;
    const offsetY = point.y - dragRef.current.startY;

    dragRef.current = {
      ...dragRef.current,
      offsetX,
      offsetY,
    };
    setDragOffset({ x: offsetX, y: offsetY });
  };

  const finishDrag = () => {
    if (!dragRef.current.isDragging) {
      return;
    }

    const { offsetX, offsetY } = dragRef.current;
    const absX = Math.abs(offsetX);
    const absY = Math.abs(offsetY);

    resetDrag();

    if (Math.max(absX, absY) < SWIPE_THRESHOLD) {
      return;
    }

    didSwipeRef.current = true;
    window.setTimeout(() => {
      didSwipeRef.current = false;
    }, 350);

    if (absX >= absY) {
      if (offsetX > 0) {
        handleAddCalendar();
      } else {
        handleHideNews();
      }
      return;
    }

    if (offsetY < 0) {
      handleShowDetail();
    } else {
      navigate('/home');
    }
  };

  const getTouchPoint = (event) => {
    const touch = event.touches[0] || event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchStart = (event) => {
    const point = getTouchPoint(event);
    if (point) {
      startDrag(point);
    }
  };

  const handleTouchMove = (event) => {
    const point = getTouchPoint(event);
    if (point) {
      event.preventDefault();
      moveDrag(point);
    }
  };

  const handleMouseDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    startDrag({ x: event.clientX, y: event.clientY });
  };

  const handleMouseMove = (event) => {
    if (!dragRef.current.isDragging) {
      return;
    }

    moveDrag({ x: event.clientX, y: event.clientY });
  };

  const handleCardClickCapture = (event) => {
    if (!didSwipeRef.current) {
      return;
    }

    didSwipeRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const visualDragX = clamp(dragOffset.x * 0.45, -88, 88);
  const visualDragY = clamp(dragOffset.y * 0.35, -72, 72);
  const dragRotation = clamp(visualDragX / 18, -4, 4);
  const cardMotion = {
    x: visualDragX,
    y: visualDragY,
    rotate: dragRotation,
    opacity: 1,
    scale: isDragging ? 1.01 : 1,
  };
  const didCompletePreview = !newsState.isLoading && !currentNews && safeCompletedNewsIds.length > 0;
  const previewEmptyCopy = (() => {
    if (safeFollowedArtistIds.length === 0) {
      return {
        title: '아직 팔로우한 아티스트가 없어요.',
        description: '온보딩에서 관심 있는 아티스트를 선택해 주세요.',
      };
    }

    if (didCompletePreview) {
      return {
        title: '오늘의 소식을 모두 확인했어요.',
        description: '저장한 일정은 캘린더에서 다시 확인할 수 있어요.',
      };
    }

    if (newsState.error || !isOnline) {
      return {
        title: '네트워크 연결을 확인해주세요.',
        description: '저장된 소식이 있으면 먼저 보여드리고, 연결되면 다시 동기화할게요.',
      };
    }

    return {
      title: '새로운 소식이 아직 없어요.',
      description: '팔로우한 아티스트의 새 소식이 도착하면 보여드릴게요.',
    };
  })();

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handleWindowMouseMove = (event) => {
      if (event.buttons !== 1) {
        finishDrag();
        return;
      }

      moveDrag({ x: event.clientX, y: event.clientY });
    };

    const handleWindowMouseUp = () => {
      finishDrag();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDragging]);

  return (
    <main className="page page-preview" aria-label="preview">
      <header className="preview-header">
        <div className="mock-status-space" aria-hidden="true" />
        <h1>GOYO</h1>
        <p>오늘 도착한 소식</p>
      </header>

      {newsState.isLoading ? (
        <section className="preview-empty" aria-label="loading preview">
          <h2>소식을 불러오는 중이에요.</h2>
          <p>팔로우한 아티스트의 음악 소식을 조용히 정리하고 있어요.</p>
        </section>
      ) : currentNews ? (
        <motion.section
          className={isDragging ? 'news-preview-card is-dragging' : 'news-preview-card'}
          aria-label="news preview card"
          key={currentNews.id}
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={cardMotion}
          exit={{ opacity: 0, scale: 0.96, y: -12 }}
          transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 28 }}
          onClickCapture={handleCardClickCapture}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={finishDrag}
          onTouchCancel={resetDrag}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={finishDrag}
        >
          {currentImageUrl && !hasImageError ? (
            <img
              className="preview-image"
              src={currentImageUrl}
              alt={`${currentNews.title} 이미지`}
              onError={() => setHasImageError(true)}
            />
          ) : (
            <div className="preview-image-placeholder" aria-hidden="true" />
          )}

          <div className="news-preview-top">
            <span className="preview-artist-name">{currentNews.artistName}</span>
            <span className="news-type-chip">{newsTypeLabels[currentNews.type]}</span>
            {isAddedToCalendar && <span className="saved-chip">캘린더에 추가됨</span>}
          </div>

          <div className="news-preview-main">
            <h2>{currentNews.title}</h2>
            <p className="news-preview-description">{currentNews.description}</p>
            <dl className="news-meta-list">
              <div>
                <dt>날짜</dt>
                <dd>{currentNews.date}</dd>
              </div>
              <div>
                <dt>시간</dt>
                <dd>{currentNews.startTime}</dd>
              </div>
              <div>
                <dt>장소</dt>
                <dd>{currentNews.location}</dd>
              </div>
            </dl>
          </div>

          <div className="preview-indicator" aria-hidden="true">
            {Array.from({ length: indicatorDotCount }, (_, index) => (
              <span className={index === activeIndicatorIndex ? 'is-active' : ''} key={index} />
            ))}
          </div>
          {previewTotalCount > 0 && (
            <p className="preview-progress">
              {currentProgressIndex} / {previewTotalCount}
            </p>
          )}

          <div className="preview-swipe-hints" aria-hidden="true">
            <span>← 관심없음</span>
            <span>↑ 자세히 보기</span>
            <span>↓ 닫기</span>
            <span>캘린더 추가 →</span>
          </div>

          <div className="preview-actions" aria-label="preview actions">
            <button
              className="preview-action-button primary"
              type="button"
              onClick={handleAddCalendar}
            >
              {isAddedToCalendar ? '캘린더에 추가됨' : '캘린더 추가'}
            </button>
            <button className="preview-action-button" type="button" onClick={handleHideNews}>
              관심없음
            </button>
            <button className="preview-action-button" type="button" onClick={handleShowDetail}>
              자세히 보기
            </button>
            <button className="preview-action-button muted" type="button" onClick={() => navigate('/home')}>
              닫기
            </button>
          </div>
        </motion.section>
      ) : (
        <section className="preview-empty" aria-label="empty preview">
          <h2>{previewEmptyCopy.title}</h2>
          <p>{previewEmptyCopy.description}</p>
          <button type="button" onClick={() => navigate('/home')}>
            닫기
          </button>
        </section>
      )}
    </main>
  );
}
