import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { addCalendarEvent } from '../api/calendar.js';
import { getNewsById } from '../api/news.js';
import { hideNews } from '../api/preferences.js';
import useLocalStorage from '../hooks/useLocalStorage.js';
import { getAnonymousUserId } from '../utils/anonymousUser.js';
import { getSafeCalendarEvents, hasCalendarEvent } from '../utils/calendarEvents.js';

const newsTypeLabels = {
  concert: '공연',
  album: '앨범',
  ticket: '티켓',
  festival: '페스티벌',
};

export default function DetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [news, setNews] = useState(null);
  const [hasImageError, setHasImageError] = useState(false);
  const [detailState, setDetailState] = useState({
    error: null,
    isLoading: true,
  });
  const [, setHiddenNewsIds] = useLocalStorage('hiddenNewsIds', []);
  const [calendarEvents, setCalendarEvents] = useLocalStorage('calendarEvents', []);
  const anonymousUserId = useMemo(() => getAnonymousUserId(), []);

  useEffect(() => {
    let isCancelled = false;

    if (!id) {
      setNews(null);
      setDetailState({ error: null, isLoading: false });
      return undefined;
    }

    setDetailState({ error: null, isLoading: true });
    setHasImageError(false);

    getNewsById(id)
      .then((item) => {
        if (!isCancelled) {
          setNews(item);
          setDetailState({ error: null, isLoading: false });
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setNews(null);
          setDetailState({
            error: '소식을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
            isLoading: false,
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [id]);

  const safeCalendarEvents = getSafeCalendarEvents(calendarEvents);
  const isAddedToCalendar = news ? hasCalendarEvent(safeCalendarEvents, news.id) : false;
  const sourceLinkText = news?.location === 'Spotify' || news?.sourceUrl?.includes('spotify.com')
    ? 'Spotify에서 보기'
    : '원문 보기';

  const handleAddCalendar = async () => {
    if (!news || isAddedToCalendar) {
      return;
    }

    let nextEvent = null;

    try {
      nextEvent = await addCalendarEvent(anonymousUserId, news);
    } catch (error) {
      console.warn('Calendar event save failed.', error);
      return;
    }

    if (!nextEvent) {
      return;
    }

    setCalendarEvents((currentEvents) => {
      const safeEvents = getSafeCalendarEvents(currentEvents);

      if (hasCalendarEvent(safeEvents, news.id)) {
        return safeEvents;
      }

      return [...safeEvents, nextEvent];
    });
  };

  const handleHideNews = () => {
    if (!news) {
      return;
    }

    setHiddenNewsIds((currentIds) => {
      const safeIds = Array.isArray(currentIds) ? currentIds : [];
      return safeIds.includes(news.id) ? safeIds : [...safeIds, news.id];
    });

    hideNews(anonymousUserId, news.id).catch((error) => {
      console.warn('Hidden news save failed.', error);
    });
    navigate('/home');
  };

  if (detailState.isLoading) {
    return (
      <main className="page page-detail" aria-label="detail">
        <button className="detail-back-button" type="button" onClick={() => navigate(-1)}>
          뒤로가기
        </button>
        <section className="detail-empty">
          <h1>소식을 불러오는 중이에요</h1>
          <p>음악 소식을 확인하고 있어요.</p>
        </section>
      </main>
    );
  }

  if (!news) {
    return (
      <main className="page page-detail" aria-label="detail">
        <button className="detail-back-button" type="button" onClick={() => navigate(-1)}>
          뒤로가기
        </button>
        <section className="detail-empty">
          <h1>{detailState.error ? '소식을 불러올 수 없습니다' : '소식을 찾을 수 없습니다'}</h1>
          <p>{detailState.error || '삭제되었거나 존재하지 않는 소식이에요.'}</p>
          <button type="button" onClick={() => navigate('/home')}>
            홈으로 이동
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page page-detail" aria-label="detail">
      <button className="detail-back-button" type="button" onClick={() => navigate(-1)}>
        뒤로가기
      </button>

      <motion.article
        className="detail-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {news.imageUrl && !hasImageError ? (
          <img
            className="detail-image"
            src={news.imageUrl}
            alt={`${news.title} 이미지`}
            onError={() => setHasImageError(true)}
          />
        ) : (
          <div className="detail-image detail-image-placeholder" role="img" aria-label={`${news.title} 이미지 placeholder`} />
        )}

        <div className="detail-body">
          <div className="detail-kicker-row">
            <span>{news.artistName}</span>
            <span>{newsTypeLabels[news.type]}</span>
          </div>

          <h1>{news.title}</h1>
          <p className="detail-description">{news.description}</p>

          <dl className="detail-info-list">
            <div>
              <dt>날짜</dt>
              <dd>{news.date}</dd>
            </div>
            <div>
              <dt>시간</dt>
              <dd>{news.startTime}</dd>
            </div>
            <div>
              <dt>장소</dt>
              <dd>{news.location}</dd>
            </div>
            <div>
              <dt>출처</dt>
              <dd>
                {news.sourceUrl ? (
                  <a href={news.sourceUrl} target="_blank" rel="noreferrer">
                    {sourceLinkText}
                  </a>
                ) : (
                  <span>출처 없음</span>
                )}
              </dd>
            </div>
          </dl>

          {isAddedToCalendar && <p className="detail-added-state">캘린더에 추가된 소식이에요.</p>}

          <div className="detail-actions">
            <button
              className="detail-action-button primary"
              type="button"
              disabled={isAddedToCalendar}
              onClick={handleAddCalendar}
            >
              {isAddedToCalendar ? '추가됨' : '캘린더에 추가하기'}
            </button>
            <button className="detail-action-button" type="button" onClick={handleHideNews}>
              관심없음
            </button>
          </div>
        </div>
      </motion.article>
    </main>
  );
}
