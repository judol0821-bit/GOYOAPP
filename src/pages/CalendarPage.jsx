import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCalendarEvents } from '../api/calendar.js';
import useLocalStorage from '../hooks/useLocalStorage.js';
import { getAnonymousUserId } from '../utils/anonymousUser.js';
import { getSafeCalendarEvents } from '../utils/calendarEvents.js';

const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

const typeLabels = {
  concert: '공연',
  album: '앨범',
  ticket: '티켓',
  festival: '페스티벌',
};

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatMonthTitle = (date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`;

const formatSelectedDate = (dateKey) => {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

const sortEvents = (a, b) => {
  const dateCompare = (a.date || '').localeCompare(b.date || '');

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return (a.time || '').localeCompare(b.time || '');
};

const getInitialDateKey = (events) => {
  const sortedEvents = [...events].sort(sortEvents);
  return sortedEvents[0]?.date || toDateKey(new Date());
};

const getFirstEventDateInMonth = (events, year, month) => {
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const event = [...events].sort(sortEvents).find((item) => item.date.startsWith(monthPrefix));

  return event?.date;
};

const getCalendarCells = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      date,
      dateKey: toDateKey(date),
      isCurrentMonth: date.getMonth() === month,
    };
  });
};

function CalendarEventCover({ event }) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUrl = event?.imageUrl || event?.newsItem?.imageUrl || event?.newsItem?.image_url || '';

  useEffect(() => {
    setHasImageError(false);
  }, [event?.id, imageUrl]);

  if (!imageUrl || hasImageError) {
    return <span className="calendar-event-cover is-placeholder" aria-hidden="true" />;
  }

  return (
    <img
      className="calendar-event-cover"
      src={imageUrl}
      alt={`${event.title} 이미지`}
      loading="lazy"
      onError={() => setHasImageError(true)}
    />
  );
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [calendarEvents] = useLocalStorage('calendarEvents', []);
  const [calendarItems, setCalendarItems] = useState(null);
  const anonymousUserId = useMemo(() => getAnonymousUserId(), []);
  const safeCalendarEvents = getSafeCalendarEvents(calendarItems ?? calendarEvents);
  const sortedEvents = useMemo(() => [...safeCalendarEvents].sort(sortEvents), [safeCalendarEvents]);
  const sortedEventsKey = sortedEvents.map((event) => `${event.id}:${event.date}:${event.time}`).join('|');
  const initialDateKey = getInitialDateKey(sortedEvents);
  const [selectedDate, setSelectedDate] = useState(initialDateKey);
  const [monthDate, setMonthDate] = useState(() => {
    const date = parseDateKey(initialDateKey);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const eventsByDate = useMemo(() => {
    return sortedEvents.reduce((acc, event) => {
      if (!acc[event.date]) {
        acc[event.date] = [];
      }

      acc[event.date].push(event);
      return acc;
    }, {});
  }, [sortedEvents]);

  const calendarCells = useMemo(() => getCalendarCells(monthDate), [monthDate]);
  const selectedEvents = eventsByDate[selectedDate] || [];

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
    if (sortedEvents.length === 0) {
      return;
    }

    const nextDateKey = getInitialDateKey(sortedEvents);

    setSelectedDate((currentDate) => {
      const hasCurrentDateEvents = sortedEvents.some((event) => event.date === currentDate);
      return hasCurrentDateEvents ? currentDate : nextDateKey;
    });

    setMonthDate((currentMonthDate) => {
      const monthHasEvents = sortedEvents.some((event) => {
        const eventDate = parseDateKey(event.date);
        return (
          eventDate.getFullYear() === currentMonthDate.getFullYear() &&
          eventDate.getMonth() === currentMonthDate.getMonth()
        );
      });

      if (monthHasEvents) {
        return currentMonthDate;
      }

      const nextDate = parseDateKey(nextDateKey);
      return new Date(nextDate.getFullYear(), nextDate.getMonth(), 1);
    });
  }, [sortedEventsKey]);

  const changeMonth = (offset) => {
    const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1);
    const year = nextMonth.getFullYear();
    const month = nextMonth.getMonth();
    const firstEventDate = getFirstEventDateInMonth(sortedEvents, year, month);

    setMonthDate(nextMonth);
    setSelectedDate(firstEventDate || toDateKey(nextMonth));
  };

  const handleEventClick = (event) => {
    if (!event.newsId) {
      return;
    }

    navigate(`/detail/${event.newsId}`);
  };

  return (
    <main className="page page-calendar" aria-label="calendar">
      <header className="calendar-header">
        <p className="app-kicker">CALENDAR</p>
        <h1>캘린더</h1>
        <p>캘린더에 담아둔 음악 소식을 날짜별로 확인해요.</p>
      </header>

      <section className="calendar-panel" aria-label="monthly calendar">
        <div className="calendar-month-header">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="previous month">
            이전
          </button>
          <h2>{formatMonthTitle(monthDate)}</h2>
          <button type="button" onClick={() => changeMonth(1)} aria-label="next month">
            다음
          </button>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {weekDays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {calendarCells.map((cell) => {
            const hasEvents = Boolean(eventsByDate[cell.dateKey]?.length);
            const isSelected = selectedDate === cell.dateKey;
            const isToday = toDateKey(new Date()) === cell.dateKey;

            return (
              <button
                className={[
                  'calendar-day',
                  cell.isCurrentMonth ? '' : 'is-muted',
                  isSelected ? 'is-selected' : '',
                  isToday ? 'is-today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={cell.dateKey}
                type="button"
                onClick={() => setSelectedDate(cell.dateKey)}
              >
                <span>{cell.date.getDate()}</span>
                {hasEvents && <i aria-label="일정 있음" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="calendar-event-section" aria-label="selected date events">
        <div className="calendar-event-heading">
          <h2>{formatSelectedDate(selectedDate)}</h2>
          <span>{selectedEvents.length > 0 ? `${selectedEvents.length}개의 일정` : '고요한 날이에요'}</span>
        </div>

        {selectedEvents.length > 0 ? (
          <div className="calendar-selected-list">
            {selectedEvents.map((event) => {
              const canOpenDetail = Boolean(event.newsId);

              return (
                <button
                  className="calendar-selected-event"
                  key={event.id}
                  type="button"
                  disabled={!canOpenDetail}
                  onClick={() => handleEventClick(event)}
                >
                  <CalendarEventCover event={event} />
                  <time>{event.time}</time>
                  <div>
                    <span>{typeLabels[event.type] || event.type}</span>
                    <strong>{event.title}</strong>
                    <p>
                      {event.artistName} · {event.location}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="calendar-empty-day">
            <strong>고요한 날이에요</strong>
            <p>이 날짜에는 저장된 음악 일정이 없어요.</p>
          </div>
        )}
      </section>
    </main>
  );
}
