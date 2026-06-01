import type { CalendarEvent, NotificationSettings, RemindBefore } from "../types";

const SENT_NOTIFICATION_STORAGE_KEY = "sentNotificationIds";
const CHECK_INTERVAL_MS = 60_000;

const REMINDER_OFFSETS_MS: Record<RemindBefore, number> = {
  AT_TIME: 0,
  "10_MIN": 10 * 60 * 1000,
  "1_HOUR": 60 * 60 * 1000,
  "1_DAY": 24 * 60 * 60 * 1000
};

function parseCalendarEventDate(dateText: string) {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(dateText);
}

export function getNotificationTime(event: CalendarEvent, remindBefore: RemindBefore) {
  return new Date(parseCalendarEventDate(event.date).getTime() - REMINDER_OFFSETS_MS[remindBefore]);
}

export function getScheduledNotificationId(eventId: string, remindBefore: RemindBefore) {
  return `${eventId}:${remindBefore}`;
}

export function readSentNotificationIds() {
  try {
    const stored = window.localStorage.getItem(SENT_NOTIFICATION_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return Array.from(new Set(parsed));
    }
  } catch {
    window.localStorage.removeItem(SENT_NOTIFICATION_STORAGE_KEY);
  }

  return [];
}

function saveSentNotificationIds(notificationIds: string[]) {
  window.localStorage.setItem(
    SENT_NOTIFICATION_STORAGE_KEY,
    JSON.stringify(Array.from(new Set(notificationIds)))
  );
}

function canShowBrowserNotification() {
  return "Notification" in window && window.Notification.permission === "granted";
}

export function checkScheduledNotifications(
  notificationSettings: NotificationSettings,
  calendarEvents: CalendarEvent[],
  now = new Date()
) {
  if (!canShowBrowserNotification()) {
    return false;
  }

  const sentNotificationIds = readSentNotificationIds();
  const nextSentNotificationIds = [...sentNotificationIds];

  Object.values(notificationSettings).forEach((setting) => {
    const event = calendarEvents.find((calendarEvent) => calendarEvent.id === setting.eventId);
    if (!event) {
      return;
    }

    const notificationId = getScheduledNotificationId(event.id, setting.remindBefore);
    if (nextSentNotificationIds.includes(notificationId)) {
      return;
    }

    const notificationTime = getNotificationTime(event, setting.remindBefore);
    if (Number.isNaN(notificationTime.getTime()) || now < notificationTime) {
      return;
    }

    try {
      new window.Notification("GOYO 일정 알림", {
        body: `${event.title} 일정이 곧 시작돼요`
      });
      nextSentNotificationIds.push(notificationId);
    } catch {
      return;
    }
  });

  if (nextSentNotificationIds.length !== sentNotificationIds.length) {
    saveSentNotificationIds(nextSentNotificationIds);
    return true;
  }

  return false;
}

export function startNotificationScheduler(
  notificationSettings: NotificationSettings,
  calendarEvents: CalendarEvent[],
  onNotificationsSent?: () => void
) {
  if (checkScheduledNotifications(notificationSettings, calendarEvents)) {
    onNotificationsSent?.();
  }

  const intervalId = window.setInterval(() => {
    if (checkScheduledNotifications(notificationSettings, calendarEvents)) {
      onNotificationsSent?.();
    }
  }, CHECK_INTERVAL_MS);

  return () => window.clearInterval(intervalId);
}
