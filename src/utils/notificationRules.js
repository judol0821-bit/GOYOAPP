export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: false,
  album: true,
  concert: true,
  ticket: true,
  festival: true,
};

const notificationCopyByType = {
  album: {
    title: '새 음악이 도착했어요',
    body: (news) => `${news.artistName} - ${news.title}`,
  },
  ticket: {
    title: '예매를 놓치지 마세요',
    body: (news) => `${news.artistName}의 티켓 소식을 확인해 보세요.`,
  },
  concert: {
    title: '공연 일정이 열렸어요',
    body: (news) => `${news.artistName} - ${news.title}`,
  },
  festival: {
    title: '함께 즐길 무대가 있어요',
    body: (news) => `${news.artistName} - ${news.title}`,
  },
};

export const getSafeNotificationSettings = (settings) => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  ...(settings && typeof settings === 'object' ? settings : {}),
});

export const getNotificationTitle = (newsItem) => {
  return notificationCopyByType[newsItem?.type]?.title || '새로운 소식이 도착했어요';
};

export const getNotificationBody = (newsItem) => {
  const body = notificationCopyByType[newsItem?.type]?.body;

  if (body) {
    return body(newsItem);
  }

  return `${newsItem?.artistName || 'GOYO'} - ${newsItem?.title || '음악 소식을 확인해 보세요.'}`;
};

export const shouldNotifyNews = (newsItem, notificationSettings) => {
  const settings = getSafeNotificationSettings(notificationSettings);

  if (!settings.enabled || !newsItem?.id) {
    return false;
  }

  if (!['album', 'ticket', 'concert', 'festival'].includes(newsItem.type)) {
    return false;
  }

  return Boolean(settings[newsItem.type]);
};

// MVP note:
// Current notifications are local-only and fire while GOYO is open.
// Later this can expand into Web Push subscriptions stored in Supabase,
// with an Edge Function and scheduled job deciding which users receive each news event.
