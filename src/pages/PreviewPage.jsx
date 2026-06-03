import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { addCalendarEvent } from '../api/calendar.js';
import { getNewsByFollowedArtists } from '../api/news.js';
import { getHiddenNews, hideNews } from '../api/preferences.js';
import useLocalStorage from '../hooks/useLocalStorage.js';
import { getAnonymousUserId } from '../utils/anonymousUser.js';
import { getSafeCalendarEvents, hasCalendarEvent } from '../utils/calendarEvents.js';

const newsTypeLabels = {
  concert: '공연',
  album: '앨범',
  ticket: '티켓',
  festival: '페스티벌',
};

const SWIPE_THRESHOLD = 72;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const sortByCreatedAtDesc = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');

const uniqueNews = (items) => {
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

export default function PreviewPage() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [newsItems, setNewsItems] = useState([]);
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
  const safeFollowedArtistIds = Array.isArray(followedArtistIds) ? followedArtistIds : [];
  const safeHiddenNewsIds = Array.isArray(hiddenNewsIds) ? hiddenNewsIds : [];
  const safeCalendarEvents = getSafeCalendarEvents(calendarEvents);
  const followedArtistIdsKey = safeFollowedArtistIds.join('|');

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
      setNewsState({ error: null, isLoading: false });
      return undefined;
    }

    setNewsState({ error: null, isLoading: true });

    getNewsByFollowedArtists(safeFollowedArtistIds)
      .then((items) => {
        if (!isCancelled) {
          setNewsItems(items);
          setNewsState({ error: null, isLoading: false });
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setNewsItems([]);
          setNewsState({
            error: '소식을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
            isLoading: false,
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [followedArtistIdsKey]);

  const visibleNews = useMemo(() => {
    return uniqueNews(newsItems)
      .filter((news) => {
        const isFollowed = safeFollowedArtistIds.includes(news.artistId);
        const isHidden = safeHiddenNewsIds.includes(news.id);

        return isFollowed && !isHidden;
      })
      .sort(sortByCreatedAtDesc);
  }, [newsItems, safeFollowedArtistIds, safeHiddenNewsIds]);

  useEffect(() => {
    if (currentIndex > 0 && currentIndex >= visibleNews.length) {
      setCurrentIndex(Math.max(visibleNews.length - 1, 0));
    }
  }, [currentIndex, visibleNews.length]);

  const currentNews = visibleNews[currentIndex];
  const isAddedToCalendar = currentNews ? hasCalendarEvent(safeCalendarEvents, currentNews.id) : false;

  const handleAddCalendar = async () => {
    if (!currentNews || isAddedToCalendar) {
      return;
    }

    const nextEvent = await addCalendarEvent(anonymousUserId, currentNews);

    if (!nextEvent) {
      return;
    }

    setCalendarEvents((currentEvents) => {
      const safeEvents = getSafeCalendarEvents(currentEvents);

      if (hasCalendarEvent(safeEvents, currentNews.id)) {
        return safeEvents;
      }

      return [...safeEvents, nextEvent];
    });
  };

  const handleHideNews = () => {
    if (!currentNews) {
      return;
    }

    setHiddenNewsIds((currentIds) => {
      const safeIds = Array.isArray(currentIds) ? currentIds : [];
      return safeIds.includes(currentNews.id) ? safeIds : [...safeIds, currentNews.id];
    });

    hideNews(anonymousUserId, currentNews.id).then((newsIds) => {
      setHiddenNewsIds((currentIds) => {
        const safeIds = Array.isArray(currentIds) ? currentIds : [];
        return [...new Set([...safeIds, ...newsIds])];
      });
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
          <div className="preview-image-placeholder" aria-hidden="true" />

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
            {visibleNews.map((news, index) => (
              <span className={index === currentIndex ? 'is-active' : ''} key={news.id} />
            ))}
          </div>

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
              disabled={isAddedToCalendar}
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
          <h2>{newsState.error ? '소식을 불러올 수 없어요.' : '확인할 소식이 없어요.'}</h2>
          <p>{newsState.error || '팔로우한 아티스트를 추가하거나, 숨긴 소식을 초기화하면 다시 볼 수 있어요.'}</p>
          <button type="button" onClick={() => navigate('/home')}>
            닫기
          </button>
        </section>
      )}
    </main>
  );
}
