const newsTypeLabels = {
  concert: 'CONCERT',
  album: 'ALBUM',
  ticket: 'TICKET',
  festival: 'FESTIVAL',
};

const newsReasonText = {
  ticket: '예매를 놓치지 마세요',
  album: '새 음악이 도착했어요',
  concert: '공연 일정이 열렸어요',
  festival: '함께 즐길 무대가 있어요',
};

const newsActionText = {
  ticket: '예매 확인',
  album: '앨범 보기',
  concert: '공연 보기',
  festival: '페스티벌 보기',
};

export function getNewsTypeLabel(type) {
  return newsTypeLabels[type] || String(type || '').toUpperCase();
}

export function getNewsReasonText(news) {
  return newsReasonText[news?.type] || '새로운 소식이 도착했어요';
}

export function getNewsActionText(type) {
  return newsActionText[type] || '자세히 보기';
}
