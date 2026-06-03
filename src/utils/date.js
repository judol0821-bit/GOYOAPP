const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseDate(date) {
  if (date instanceof Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  const [year, month, day] = String(date).split('-').map(Number);

  if (!year || !month || !day) {
    return new Date(NaN);
  }

  return new Date(year, month - 1, day);
}

function getToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function isToday(date) {
  return parseDate(date).getTime() === getToday().getTime();
}

export function isUpcoming(date) {
  return parseDate(date).getTime() > getToday().getTime();
}

export function getDDay(date) {
  const diffDays = Math.round((parseDate(date).getTime() - getToday().getTime()) / DAY_IN_MS);

  if (diffDays === 0) {
    return '오늘';
  }

  if (diffDays === 1) {
    return '내일';
  }

  if (diffDays > 1) {
    return `D-${diffDays}`;
  }

  return `D+${Math.abs(diffDays)}`;
}

export function formatKoreanDate(date) {
  const parsedDate = parseDate(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  if (isToday(parsedDate)) {
    return '오늘';
  }

  const diffDays = Math.round((parsedDate.getTime() - getToday().getTime()) / DAY_IN_MS);

  if (diffDays === 1) {
    return '내일';
  }

  return `${parsedDate.getMonth() + 1}월 ${parsedDate.getDate()}일`;
}
