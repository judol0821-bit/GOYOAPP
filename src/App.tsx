import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CircleUserRound,
  Home,
  LogOut,
  Search
} from "lucide-react";
import { searchTheAudioDbArtists } from "./api/theAudioDb";
import { ARTIST_IMAGE_PLACEHOLDER } from "./constants";
import { artists, createCalendarEvents, musicNews } from "./data/mockData";
import {
  getScheduledNotificationId,
  readSentNotificationIds,
  startNotificationScheduler
} from "./utils/notificationScheduler";
import type {
  Artist,
  CalendarEvent,
  MusicNews,
  NewsCategory,
  NotificationSetting,
  NotificationSettings,
  RemindBefore
} from "./types";

const FOLLOWED_ARTISTS_STORAGE_KEY = "followedArtists";
const LEGACY_FOLLOW_STORAGE_KEY = "followedArtistIds";
const NOTIFICATION_STORAGE_KEY = "notificationSettings";
const LEGACY_NOTIFICATION_STORAGE_KEY = "notificationCalendarEventIds";
const USER_STORAGE_KEY = "goyoUsers";
const ARTIST_SEARCH_CACHE_STORAGE_KEY = "artistSearchCache";
const MIN_REMOTE_SEARCH_LENGTH = 2;

type Screen =
  | "login"
  | "signup"
  | "home"
  | "calendar"
  | "notificationCenter"
  | "artistDetail"
  | "profile"
  | "detail"
  | "eventDetail";
type MainTab = "home" | "calendar" | "notifications";
type DetailBackScreen = "home" | "calendar" | "notificationCenter" | "artistDetail";
type CalendarFilter = "today" | "week" | "month";
type StoredUser = {
  name: string;
  email: string;
  password: string;
};

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  CONCERT: "CONCERT",
  FESTIVAL: "FESTIVAL",
  NEW_SONG: "NEW SONG",
  NEW_ALBUM: "NEW ALBUM"
};

const CALENDAR_EVENT_TYPE_LABELS: Record<CalendarEvent["type"], string> = {
  EVENT: "일정",
  TICKET_OPEN: "티켓오픈",
  RELEASE: "발매"
};

const REMINDER_OPTIONS: Array<{ value: RemindBefore; label: string }> = [
  { value: "AT_TIME", label: "정시" },
  { value: "10_MIN", label: "10분 전" },
  { value: "1_HOUR", label: "1시간 전" },
  { value: "1_DAY", label: "하루 전" }
];

const calendarEvents = createCalendarEvents(musicNews);

function getCategoryLabel(category: NewsCategory) {
  return CATEGORY_LABELS[category];
}

function getCalendarEventTypeLabel(type: CalendarEvent["type"]) {
  return CALENDAR_EVENT_TYPE_LABELS[type];
}

function getReminderLabel(remindBefore: RemindBefore) {
  return REMINDER_OPTIONS.find((option) => option.value === remindBefore)?.label ?? "정시";
}

function isRemindBefore(value: unknown): value is RemindBefore {
  return value === "AT_TIME" || value === "10_MIN" || value === "1_HOUR" || value === "1_DAY";
}

function parseLocalDate(dateText?: string) {
  if (!dateText) {
    return new Date(Number.NaN);
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(dateText);
}

function getDateTime(dateText?: string) {
  const date = parseLocalDate(dateText);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatKoreanDate(dateText: string) {
  const date = parseLocalDate(dateText);
  if (Number.isNaN(date.getTime())) {
    return "일정 미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function formatShortDate(dateText: string) {
  const date = parseLocalDate(dateText);
  if (Number.isNaN(date.getTime())) {
    return "--.--";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDateTime(dateText?: string) {
  const date = parseLocalDate(dateText);
  if (Number.isNaN(date.getTime())) {
    return "일정 미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getNewsDateLabel(news: MusicNews) {
  if (!news.eventDate) {
    return "일정 미정";
  }

  return formatKoreanDate(news.eventDate);
}

function getNewsSortTime(news: MusicNews) {
  return getDateTime(news.eventDate) || getDateTime(news.ticketOpenDate);
}

function getNewsHeroColor(news: MusicNews) {
  const colors: Record<NewsCategory, string> = {
    CONCERT: "#e8e8ec",
    FESTIVAL: "#e9e9ee",
    NEW_SONG: "#ececef",
    NEW_ALBUM: "#eeeeee"
  };

  return colors[news.category];
}

function getNewsInfoRows(news: MusicNews) {
  const rows: Array<{ label: string; value: string }> = [];

  if (news.eventDate) {
    rows.push({
      label: news.category === "CONCERT" || news.category === "FESTIVAL" ? "일정" : "발매",
      value: formatDateTime(news.eventDate)
    });
  }

  if (news.ticketOpenDate) {
    rows.push({ label: "티켓 오픈", value: formatDateTime(news.ticketOpenDate) });
  }

  if (news.ticketVendor) {
    rows.push({ label: "예매처", value: news.ticketVendor });
  }

  if (news.venue) {
    rows.push({ label: "장소", value: news.venue });
  }

  return rows.length > 0 ? rows : [{ label: "일정", value: "일정 미정" }];
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isThisWeek(date: Date, today = new Date()) {
  const weekStart = new Date(today);
  const day = weekStart.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return date >= weekStart && date <= weekEnd;
}

function isThisMonth(date: Date, today = new Date()) {
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

function isPastCalendarDate(dateText: string, today = new Date()) {
  const eventDate = parseLocalDate(dateText);
  if (Number.isNaN(eventDate.getTime())) {
    return false;
  }

  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  return eventDate < todayStart;
}

function isArtistSource(value: unknown): value is Artist["source"] {
  return value === "MOCK" || value === "SPOTIFY" || value === "THEAUDIODB";
}

function isStoredArtist(value: unknown): value is Artist {
  if (!value || typeof value !== "object") {
    return false;
  }

  const artist = value as Record<string, unknown>;
  return (
    typeof artist.id === "string" &&
    typeof artist.name === "string" &&
    typeof artist.imageUrl === "string" &&
    Array.isArray(artist.genres) &&
    artist.genres.every((genre) => typeof genre === "string") &&
    isArtistSource(artist.source) &&
    (artist.description === undefined || typeof artist.description === "string") &&
    (artist.externalUrl === undefined || typeof artist.externalUrl === "string") &&
    (artist.spotifyId === undefined || typeof artist.spotifyId === "string")
  );
}

function dedupeArtists(nextArtists: Artist[]) {
  return Array.from(new Map(nextArtists.map((artist) => [artist.id, artist])).values());
}

function normalizeArtistSearchKey(query: string) {
  return query.trim().toLowerCase();
}

function normalizeArtistName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeArtistsByName(nextArtists: Artist[]) {
  const seenNames = new Set<string>();

  return nextArtists.filter((artist) => {
    const normalizedName = normalizeArtistName(artist.name);
    if (!normalizedName || seenNames.has(normalizedName)) {
      return false;
    }

    seenNames.add(normalizedName);
    return true;
  });
}

function dedupeSearchArtistsByName(nextArtists: Artist[], followedArtistIds: string[]) {
  const artistsByName = new Map<string, Artist>();

  nextArtists.forEach((artist) => {
    const normalizedName = normalizeArtistName(artist.name);
    if (!normalizedName) {
      return;
    }

    const existingArtist = artistsByName.get(normalizedName);
    if (
      !existingArtist ||
      (!followedArtistIds.includes(existingArtist.id) && followedArtistIds.includes(artist.id))
    ) {
      artistsByName.set(normalizedName, artist);
    }
  });

  return Array.from(artistsByName.values());
}

function saveFollowedArtists(nextArtists: Artist[]) {
  window.localStorage.setItem(
    FOLLOWED_ARTISTS_STORAGE_KEY,
    JSON.stringify(dedupeArtists(nextArtists))
  );
  window.localStorage.removeItem(LEGACY_FOLLOW_STORAGE_KEY);
}

function readFollowedArtists() {
  try {
    const stored = window.localStorage.getItem(FOLLOWED_ARTISTS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return dedupeArtists(parsed.filter(isStoredArtist));
      }
    }

    const legacyStored = window.localStorage.getItem(LEGACY_FOLLOW_STORAGE_KEY);
    if (legacyStored) {
      const parsedLegacy = JSON.parse(legacyStored);
      if (Array.isArray(parsedLegacy) && parsedLegacy.every((item) => typeof item === "string")) {
        const migratedArtists = Array.from(new Set(parsedLegacy))
          .map((artistId) => artists.find((artist) => artist.id === artistId))
          .filter((artist): artist is Artist => Boolean(artist));

        saveFollowedArtists(migratedArtists);
        return migratedArtists;
      }
    }
  } catch {
    window.localStorage.removeItem(FOLLOWED_ARTISTS_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_FOLLOW_STORAGE_KEY);
  }

  return [];
}

function readArtistSearchCache() {
  try {
    const stored = window.localStorage.getItem(ARTIST_SEARCH_CACHE_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, Artist[]>>((cache, [key, value]) => {
      if (Array.isArray(value)) {
        cache[key] = dedupeArtistsByName(value.filter(isStoredArtist));
      }

      return cache;
    }, {});
  } catch {
    window.localStorage.removeItem(ARTIST_SEARCH_CACHE_STORAGE_KEY);
  }

  return {};
}

function saveArtistSearchCache(cache: Record<string, Artist[]>) {
  window.localStorage.setItem(ARTIST_SEARCH_CACHE_STORAGE_KEY, JSON.stringify(cache));
}

function saveNotificationSettings(settings: NotificationSettings) {
  window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(settings));
  window.localStorage.removeItem(LEGACY_NOTIFICATION_STORAGE_KEY);
}

function readNotificationSettings(): NotificationSettings {
  try {
    const stored = window.localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.entries(parsed).reduce<NotificationSettings>((settings, [eventId, value]) => {
          if (!value || typeof value !== "object") {
            return settings;
          }

          const setting = value as Record<string, unknown>;
          if (typeof setting.eventId === "string" && isRemindBefore(setting.remindBefore)) {
            settings[eventId] = {
              eventId: setting.eventId,
              remindBefore: setting.remindBefore
            };
          }

          return settings;
        }, {});
      }
    }

    const legacyStored = window.localStorage.getItem(LEGACY_NOTIFICATION_STORAGE_KEY);
    if (legacyStored) {
      const parsedLegacy = JSON.parse(legacyStored);
      if (Array.isArray(parsedLegacy) && parsedLegacy.every((item) => typeof item === "string")) {
        return Array.from(new Set(parsedLegacy)).reduce<NotificationSettings>((settings, eventId) => {
          settings[eventId] = {
            eventId,
            remindBefore: "AT_TIME"
          };

          return settings;
        }, {});
      }
    }
  } catch {
    window.localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_NOTIFICATION_STORAGE_KEY);
  }

  return {};
}

async function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) {
    alert("이 브라우저에서는 알림을 사용할 수 없어요.");
    return false;
  }

  const NotificationApi = window.Notification;

  if (NotificationApi.permission === "granted") {
    return true;
  }

  if (NotificationApi.permission === "denied") {
    alert("알림 권한이 필요해요.");
    return false;
  }

  const permission = await window.Notification.requestPermission();
  if (permission !== "granted") {
    alert("알림 권한이 필요해요.");
    return false;
  }

  return true;
}

function showNotificationSetupToast() {
  const NotificationApi = window.Notification;

  try {
    new NotificationApi("GOYO 알림이 설정되었어요");
  } catch {
    // 알림 설정 상태는 저장하되, 브라우저별 표시 제한은 조용히 넘깁니다.
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isStoredUser(value: unknown): value is StoredUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as Record<string, unknown>;
  return (
    typeof user.name === "string" &&
    typeof user.email === "string" &&
    typeof user.password === "string"
  );
}

function readStoredUsers() {
  try {
    const stored = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed.filter(isStoredUser).map((user) => ({
        ...user,
        email: normalizeEmail(user.email)
      }));
    }
  } catch {
    window.localStorage.removeItem(USER_STORAGE_KEY);
  }

  return [];
}

function saveStoredUsers(users: StoredUser[]) {
  const normalizedUsers = users.map((user) => ({
    ...user,
    email: normalizeEmail(user.email)
  }));

  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizedUsers));
}

function findStoredUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);

  return readStoredUsers().find(
    (user) => user.email === normalizedEmail && user.password === password
  );
}

function getUserInitial(user: StoredUser | null) {
  const source = user?.name.trim() || user?.email.trim() || "G";
  return source.slice(0, 1).toUpperCase();
}

function getArtistGenresLabel(artist: Artist) {
  return artist.genres.length > 0 ? artist.genres.join(" / ") : "장르 정보 없음";
}

function getArtistInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getArtistAvatarColor(artistId: string) {
  const palette = ["#d9d9d9", "#e4e4e4", "#dcdcdc", "#dedede", "#e8e8e8", "#ededed"];
  const colorIndex = [...artistId].reduce((total, char) => total + char.charCodeAt(0), 0) % palette.length;
  return palette[colorIndex];
}

function getSafeArtistImageUrl(imageUrl: string) {
  return imageUrl.trim() || ARTIST_IMAGE_PLACEHOLDER;
}

function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);
  const [selectedCalendarEventId, setSelectedCalendarEventId] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [detailBackScreen, setDetailBackScreen] = useState<DetailBackScreen>("home");
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [followedArtists, setFollowedArtists] = useState<Artist[]>(readFollowedArtists);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    readNotificationSettings
  );
  const [sentNotificationIds, setSentNotificationIds] = useState<string[]>(readSentNotificationIds);
  const followedArtistIds = useMemo(
    () => followedArtists.map((artist) => artist.id),
    [followedArtists]
  );

  useEffect(() => {
    saveFollowedArtists(followedArtists);
  }, [followedArtists]);

  useEffect(() => {
    saveNotificationSettings(notificationSettings);
  }, [notificationSettings]);

  useEffect(() => {
    return startNotificationScheduler(notificationSettings, calendarEvents, () => {
      setSentNotificationIds(readSentNotificationIds());
    });
  }, [notificationSettings]);

  useEffect(() => {
    const refreshSentNotifications = () => setSentNotificationIds(readSentNotificationIds());
    refreshSentNotifications();

    const intervalId = window.setInterval(refreshSentNotifications, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen, selectedNewsId]);

  const showScreen = (nextScreen: Screen) => {
    if (nextScreen !== "detail" && nextScreen !== "eventDetail") {
      setSelectedNewsId(null);
    }
    if (nextScreen !== "eventDetail") {
      setSelectedCalendarEventId(null);
    }
    if (nextScreen !== "artistDetail" && nextScreen !== "eventDetail") {
      setSelectedArtist(null);
    }
    setScreen(nextScreen);
  };

  const toggleFollowArtist = (artist: Artist) => {
    setFollowedArtists((currentArtists) => {
      const nextArtists = currentArtists.some((item) => item.id === artist.id)
        ? currentArtists.filter((item) => item.id !== artist.id)
        : dedupeArtists([...currentArtists, artist]);

      saveFollowedArtists(nextArtists);
      return nextArtists;
    });
  };

  const openDetail = (newsId: string, backScreen: DetailBackScreen = "home") => {
    setSelectedNewsId(newsId);
    setSelectedCalendarEventId(null);
    setDetailBackScreen(backScreen);
    setScreen(backScreen === "home" ? "detail" : "eventDetail");
  };

  const openArtistDetail = (artist: Artist) => {
    setSelectedArtist(artist);
    setSelectedNewsId(null);
    setSelectedCalendarEventId(null);
    setScreen("artistDetail");
  };

  const openCalendarEvent = (
    calendarEventId: string,
    backScreen: DetailBackScreen = "calendar"
  ) => {
    const event = calendarEvents.find((item) => item.id === calendarEventId);

    if (!event) {
      return;
    }

    setSelectedNewsId(event.musicNewsId);
    setSelectedCalendarEventId(event.id);
    setDetailBackScreen(backScreen);
    setScreen("eventDetail");
  };

  const saveCalendarEventNotification = async (
    calendarEventId: string,
    remindBefore: RemindBefore
  ) => {
    const canUseNotification = await requestBrowserNotificationPermission();
    if (!canUseNotification) {
      return false;
    }

    setNotificationSettings((currentSettings) => {
      const nextSettings = {
        ...currentSettings,
        [calendarEventId]: {
          eventId: calendarEventId,
          remindBefore
        }
      };

      saveNotificationSettings(nextSettings);
      return nextSettings;
    });
    showNotificationSetupToast();
    return true;
  };

  const removeCalendarEventNotification = (calendarEventId: string) => {
    setNotificationSettings((currentSettings) => {
      const nextSettings = { ...currentSettings };
      delete nextSettings[calendarEventId];
      saveNotificationSettings(nextSettings);
      return nextSettings;
    });
    setSentNotificationIds(readSentNotificationIds());
  };

  const handleLogin = (user: StoredUser) => {
    setCurrentUser(user);
    showScreen("home");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    showScreen("login");
  };

  if (screen === "signup") {
    return <SignupScreen onBack={() => showScreen("login")} onComplete={() => showScreen("login")} />;
  }

  if (screen === "home") {
    return (
      <HomeScreen
        followedArtists={followedArtists}
        followedArtistIds={followedArtistIds}
        onToggleFollowArtist={toggleFollowArtist}
        onOpenDetail={(newsId) => openDetail(newsId, "home")}
        onOpenArtistDetail={openArtistDetail}
        onOpenCalendar={() => showScreen("calendar")}
        onOpenNotifications={() => showScreen("notificationCenter")}
        onOpenProfile={() => showScreen("profile")}
      />
    );
  }

  if (screen === "artistDetail") {
    const artist =
      selectedArtist &&
      (followedArtists.find((followedArtist) => followedArtist.id === selectedArtist.id) ??
        selectedArtist);

    return (
      <ArtistDetailScreen
        artist={artist ?? undefined}
        followed={artist ? followedArtistIds.includes(artist.id) : false}
        onBack={() => showScreen("home")}
        onToggleFollowArtist={toggleFollowArtist}
        onOpenRelatedNews={(newsId) => openDetail(newsId, "artistDetail")}
      />
    );
  }

  if (screen === "profile") {
    return (
      <ProfileScreen
        user={currentUser}
        followedArtists={followedArtists}
        followedArtistIds={followedArtistIds}
        onBack={() => showScreen("home")}
        onLogout={handleLogout}
      />
    );
  }

  if (screen === "calendar") {
    return (
      <CalendarScreen
        followedArtistIds={followedArtistIds}
        notificationSettings={notificationSettings}
        onOpenEvent={openCalendarEvent}
        onOpenHome={() => showScreen("home")}
        onOpenNotifications={() => showScreen("notificationCenter")}
        onSaveNotification={saveCalendarEventNotification}
        onRemoveNotification={removeCalendarEventNotification}
      />
    );
  }

  if (screen === "notificationCenter") {
    return (
      <NotificationCenterScreen
        notificationSettings={notificationSettings}
        sentNotificationIds={sentNotificationIds}
        onOpenCalendar={() => showScreen("calendar")}
        onOpenHome={() => showScreen("home")}
        onOpenEvent={(calendarEventId) => openCalendarEvent(calendarEventId, "notificationCenter")}
        onRemoveNotification={removeCalendarEventNotification}
      />
    );
  }

  if (screen === "detail" || screen === "eventDetail") {
    const news = musicNews.find((item) => item.id === selectedNewsId);
    const selectedCalendarEvent = calendarEvents.find(
      (event) => event.id === selectedCalendarEventId
    );

    return (
      <DetailScreen
        news={news}
        calendarEvent={screen === "eventDetail" ? selectedCalendarEvent : undefined}
        notificationSetting={selectedCalendarEvent ? notificationSettings[selectedCalendarEvent.id] : undefined}
        mode={screen === "eventDetail" ? "event" : "news"}
        onBack={() => showScreen(detailBackScreen)}
        onSaveNotification={saveCalendarEventNotification}
        onRemoveNotification={removeCalendarEventNotification}
      />
    );
  }

  return <LoginScreen onLogin={handleLogin} onSignup={() => showScreen("signup")} />;
}

type LoginScreenProps = {
  onLogin: (user: StoredUser) => void;
  onSignup: () => void;
};

function LoginScreen({ onLogin, onSignup }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const matchedUser = findStoredUser(email, password);

    if (!matchedUser) {
      setLoginError("가입한 이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }

    setLoginError("");
    onLogin(matchedUser);
  };

  return (
    <main className="app-shell auth-shell">
      <section className="login-panel">
        <h1 className="brand-logo login-logo">GOYO</h1>

        <form className="auth-form" onSubmit={handleLogin}>
          <label className="field-label" htmlFor="login-email">이메일</label>
          <input
            className="text-input"
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setLoginError("");
            }}
            aria-invalid={Boolean(loginError)}
            required
          />

          <label className="field-label" htmlFor="login-password">비밀번호</label>
          <input
            className="text-input"
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setLoginError("");
            }}
            aria-invalid={Boolean(loginError)}
            required
          />

          {loginError && (
            <p className="login-error" role="alert">
              {loginError}
            </p>
          )}

          <button className="primary-button dark-button" type="submit">로그인</button>
        </form>

        <p className="signup-copy">
          계정이 없으신가요?
          <button className="text-link" type="button" onClick={onSignup}>
            회원가입
          </button>
        </p>

        <div className="simple-login">
          <span>간편 로그인</span>
          <button className="social-button" type="button">
            <span className="kakao-badge">TALK</span>
            카카오로 시작하기
          </button>
          <button className="social-button" type="button">
            <span className="google-badge">G</span>
            구글로 시작하기
          </button>
        </div>
      </section>
    </main>
  );
}

type SignupScreenProps = {
  onBack: () => void;
  onComplete: () => void;
};

function SignupScreen({ onBack, onComplete }: SignupScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordCheck, setPasswordCheck] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signupError, setSignupError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const normalizedEmail = normalizeEmail(email);

    if (!trimmedName || !normalizedEmail || !password.trim() || !passwordCheck.trim()) {
      setSignupError("모든 정보를 입력해주세요.");
      return;
    }

    if (password !== passwordCheck) {
      setSignupError("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (!agreed) {
      setSignupError("필수 약관에 동의해주세요.");
      return;
    }

    const storedUsers = readStoredUsers();
    const isDuplicateEmail = storedUsers.some((user) => user.email === normalizedEmail);

    if (isDuplicateEmail) {
      setSignupError("이미 가입된 이메일입니다.");
      return;
    }

    saveStoredUsers([
      ...storedUsers,
      {
        name: trimmedName,
        email: normalizedEmail,
        password
      }
    ]);
    setSignupError("");
    onComplete();
  };

  return (
    <main className="app-shell page-shell signup-shell">
      <button className="round-icon-button floating-back" type="button" onClick={onBack}>
        <ArrowLeft size={24} aria-hidden="true" />
        <span className="sr-only">뒤로가기</span>
      </button>

      <section className="signup-intro">
        <h1>반가워요!</h1>
        <p>GOYO와 함께 고요한 음악 여정을 시작하세요.</p>
      </section>

      <form className="auth-form signup-form" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="signup-name">이름</label>
        <input
          className="text-input"
          id="signup-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSignupError("");
          }}
          aria-invalid={Boolean(signupError)}
          required
        />

        <label className="field-label" htmlFor="signup-email">이메일 주소</label>
        <input
          className="text-input"
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setSignupError("");
          }}
          aria-invalid={Boolean(signupError)}
          required
        />

        <label className="field-label" htmlFor="signup-password">비밀번호</label>
        <input
          className="text-input"
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setSignupError("");
          }}
          aria-invalid={Boolean(signupError)}
          required
        />

        <label className="field-label" htmlFor="signup-password-check">비밀번호 확인</label>
        <input
          className="text-input"
          id="signup-password-check"
          type="password"
          autoComplete="new-password"
          value={passwordCheck}
          onChange={(event) => {
            setPasswordCheck(event.target.value);
            setSignupError("");
          }}
          aria-invalid={Boolean(signupError)}
          required
        />

        <label className="terms-row">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => {
              setAgreed(event.target.checked);
              setSignupError("");
            }}
          />
          <span>이용약관 및 개인정보 처리방침에 동의합니다. (필수)</span>
        </label>

        {signupError && (
          <p className="login-error" role="alert">
            {signupError}
          </p>
        )}

        <button className="primary-button dark-button" type="submit" disabled={!agreed}>
          가입 완료
        </button>
      </form>
    </main>
  );
}

type ProfileScreenProps = {
  user: StoredUser | null;
  followedArtists: Artist[];
  followedArtistIds: string[];
  onBack: () => void;
  onLogout: () => void;
};

function ProfileScreen({ user, followedArtists, followedArtistIds, onBack, onLogout }: ProfileScreenProps) {
  const followedNewsCount = useMemo(
    () => musicNews.filter((news) => followedArtistIds.includes(news.artistId)).length,
    [followedArtistIds]
  );

  return (
    <main className="app-shell page-shell profile-shell">
      <button className="round-icon-button floating-back" type="button" onClick={onBack}>
        <ArrowLeft size={24} aria-hidden="true" />
        <span className="sr-only">홈으로 돌아가기</span>
      </button>

      <section className="profile-hero" aria-label="내 정보">
        <div className="profile-avatar" aria-hidden="true">
          {getUserInitial(user)}
        </div>
        <span>MY GOYO</span>
        <h1>{user?.name ?? "로그인 정보 없음"}</h1>
        <p>{user?.email ?? "다시 로그인하면 내 정보를 확인할 수 있어요."}</p>
      </section>

      <section className="profile-stat-grid" aria-label="내 활동 요약">
        <div>
          <strong>{followedArtists.length}</strong>
          <span>팔로우 아티스트</span>
        </div>
        <div>
          <strong>{followedNewsCount}</strong>
          <span>받는 음악 소식</span>
        </div>
      </section>

      <section className="profile-section">
        <h2>팔로우 중</h2>
        {followedArtists.length > 0 ? (
          <div className="profile-artist-list">
            {followedArtists.map((artist) => (
              <div className="profile-artist-item" key={artist.id}>
                <Avatar artist={artist} size="small" />
                <div>
                  <strong>{artist.name}</strong>
                  <span>{getArtistGenresLabel(artist)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            title="팔로우한 아티스트가 없어요"
            description="홈에서 아티스트를 검색하고 팔로우하면 이곳에 보여요."
          />
        )}
      </section>

      <button className="profile-logout-button" type="button" onClick={onLogout}>
        <LogOut size={20} aria-hidden="true" />
        로그아웃
      </button>
    </main>
  );
}

type HomeScreenProps = {
  followedArtists: Artist[];
  followedArtistIds: string[];
  onToggleFollowArtist: (artist: Artist) => void;
  onOpenDetail: (newsId: string) => void;
  onOpenArtistDetail: (artist: Artist) => void;
  onOpenCalendar: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
};

function HomeScreen({
  followedArtists,
  followedArtistIds,
  onToggleFollowArtist,
  onOpenDetail,
  onOpenArtistDetail,
  onOpenCalendar,
  onOpenNotifications,
  onOpenProfile
}: HomeScreenProps) {
  const [query, setQuery] = useState("");
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [audioDbArtists, setAudioDbArtists] = useState<Artist[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "done">("idle");
  const searchCacheRef = useRef<Record<string, Artist[]>>(readArtistSearchCache());

  const selectedArtist = useMemo(
    () => followedArtists.find((artist) => artist.id === selectedArtistId),
    [followedArtists, selectedArtistId]
  );

  const followedNews = useMemo(
    () =>
      musicNews
        .filter((news) => followedArtistIds.includes(news.artistId))
        .sort((a, b) => getNewsSortTime(b) - getNewsSortTime(a)),
    [followedArtistIds]
  );

  const visibleNews = useMemo(
    () =>
      selectedArtist
        ? followedNews.filter((news) => news.artistId === selectedArtist.id)
        : followedNews,
    [followedNews, selectedArtist]
  );

  useEffect(() => {
    if (selectedArtistId && !followedArtistIds.includes(selectedArtistId)) {
      setSelectedArtistId(null);
    }
  }, [followedArtistIds, selectedArtistId]);

  const mockSearchedArtists = useMemo(() => {
    const keyword = normalizeArtistSearchKey(query);
    if (!keyword) {
      return [];
    }

    return artists.filter((artist) =>
      `${artist.name} ${getArtistGenresLabel(artist)}`.toLowerCase().includes(keyword)
    );
  }, [query]);

  useEffect(() => {
    const keyword = query.trim();
    const cacheKey = normalizeArtistSearchKey(keyword);

    if (!keyword) {
      setAudioDbArtists([]);
      setSearchStatus("idle");
      return undefined;
    }

    if (cacheKey.length < MIN_REMOTE_SEARCH_LENGTH) {
      setAudioDbArtists([]);
      setSearchStatus("done");
      return undefined;
    }

    const cachedArtists = searchCacheRef.current[cacheKey];
    if (cachedArtists) {
      setAudioDbArtists(cachedArtists);
      setSearchStatus("done");
      return undefined;
    }

    let cancelled = false;
    setSearchStatus("loading");

    const timeoutId = window.setTimeout(() => {
      searchTheAudioDbArtists(keyword)
        .then((remoteArtists) => {
          if (cancelled) {
            return;
          }

          const cachedRemoteArtists = dedupeArtistsByName(remoteArtists);
          searchCacheRef.current = {
            ...searchCacheRef.current,
            [cacheKey]: cachedRemoteArtists
          };
          saveArtistSearchCache(searchCacheRef.current);
          setAudioDbArtists(cachedRemoteArtists);
          setSearchStatus("done");
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setAudioDbArtists([]);
          setSearchStatus("done");
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const searchedArtists = useMemo(() => {
    if (searchStatus !== "done") {
      return [];
    }

    return dedupeSearchArtistsByName(
      [...audioDbArtists, ...mockSearchedArtists],
      followedArtistIds
    );
  }, [audioDbArtists, followedArtistIds, mockSearchedArtists, searchStatus]);

  const handleSearchResultSelect = (
    artist: Artist,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    setQuery("");
    onOpenArtistDetail(artist);
  };

  const handleSearchFollowButtonClick = (
    artist: Artist,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    const isAlreadyFollowed = followedArtistIds.includes(artist.id);

    onToggleFollowArtist(artist);
    setSelectedArtistId((currentArtistId) => {
      if (isAlreadyFollowed && currentArtistId === artist.id) {
        return null;
      }

      return currentArtistId;
    });
  };

  const handleFollowedArtistClick = (
    artist: Artist,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    onOpenArtistDetail(artist);
  };

  return (
    <main className="app-shell page-shell home-shell">
      <header className="home-header">
        <h1 className="brand-logo">GOYO</h1>
        <button className="icon-button" type="button" onClick={onOpenProfile}>
          <CircleUserRound size={33} aria-hidden="true" />
          <span className="sr-only">내 정보</span>
        </button>
      </header>

      <div className="search-box">
        <Search size={22} aria-hidden="true" />
        <input
          aria-label="아티스트 검색"
          type="search"
          placeholder="아티스트 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {query.trim() && (
        <section className="search-results" aria-label="검색 결과">
          {searchStatus === "loading" ? (
            <SearchLoadingState />
          ) : searchedArtists.length > 0 ? (
            searchedArtists.map((artist) => (
              <ArtistSearchRow
                key={artist.id}
                artist={artist}
                followed={followedArtistIds.includes(artist.id)}
                onSelect={handleSearchResultSelect}
                onToggleFollow={handleSearchFollowButtonClick}
              />
            ))
          ) : (
            <EmptyState
              compact
              title="검색 결과가 없어요"
              description="다른 이름이나 장르로 다시 검색해보세요."
            />
          )}
        </section>
      )}

      <section className="content-section">
        <h2>팔로우 중인 아티스트</h2>
        {followedArtists.length > 0 ? (
          <div className="artist-strip">
            {followedArtists.map((artist) => (
              <button
                className={`artist-chip ${selectedArtistId === artist.id ? "is-selected" : ""}`}
                key={artist.id}
                type="button"
                onClick={(event) => handleFollowedArtistClick(artist, event)}
              >
                <Avatar artist={artist} size="large" />
                <span>{artist.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="아직 팔로우한 아티스트가 없어요"
            description="검색 결과의 팔로우 버튼을 누르면 이곳에 저장됩니다."
          />
        )}
      </section>

      {selectedArtist && (
        <SelectedArtistPanel
          artist={selectedArtist}
          newsItems={followedNews.filter((news) => news.artistId === selectedArtist.id)}
          onClear={() => setSelectedArtistId(null)}
          onOpenDetail={onOpenDetail}
        />
      )}

      <section className="content-section news-section">
        <div className="section-heading-row">
          <h2>{selectedArtist ? `${selectedArtist.name} 소식` : "최근 소식"}</h2>
          {selectedArtist && (
            <button type="button" onClick={() => setSelectedArtistId(null)}>
              전체
            </button>
          )}
        </div>
        {visibleNews.length > 0 ? (
          <div className="timeline">
            {visibleNews.map((news) => (
              <NewsCard key={news.id} news={news} onOpenDetail={onOpenDetail} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={selectedArtist ? "아직 등록된 소식이 없어요" : "표시할 소식이 없어요"}
            description={
              selectedArtist
                ? `${selectedArtist.name}의 새 소식이 올라오면 이곳에 보여드려요.`
                : "팔로우한 아티스트의 공연, 앨범, 신곡 소식만 조용히 모아 보여드려요."
            }
          />
        )}
      </section>

      <BottomNav
        activeTab="home"
        onHome={() => undefined}
        onCalendar={onOpenCalendar}
        onNotifications={onOpenNotifications}
      />
    </main>
  );
}

type ArtistSearchRowProps = {
  artist: Artist;
  followed: boolean;
  onSelect: (artist: Artist, event: MouseEvent<HTMLButtonElement>) => void;
  onToggleFollow: (artist: Artist, event: MouseEvent<HTMLButtonElement>) => void;
};

function ArtistSearchRow({
  artist,
  followed,
  onSelect,
  onToggleFollow
}: ArtistSearchRowProps) {
  return (
    <article className="artist-row">
      <div
        className="artist-row-profile"
      >
        <Avatar artist={artist} size="small" />
        <span className="artist-row-copy">
          <strong>{artist.name}</strong>
          <span>{getArtistGenresLabel(artist)}</span>
          <em>{artist.source === "THEAUDIODB" ? "TheAudioDB" : artist.source}</em>
        </span>
      </div>

      <div className="artist-row-actions">
        <button
          className={`follow-action-button ${followed ? "is-followed" : ""}`}
          type="button"
          onClick={(event) => onToggleFollow(artist, event)}
        >
          {followed ? "팔로잉" : "팔로우"}
        </button>
        <button
          className="detail-action-button"
          type="button"
          onClick={(event) => onSelect(artist, event)}
        >
          상세 보기
        </button>
      </div>
    </article>
  );
}

function SearchLoadingState() {
  return (
    <div className="search-loading" role="status" aria-label="아티스트 검색 중">
      <span className="loading-line loading-line-wide" />
      <span className="loading-line" />
      <span>TheAudioDB에서 아티스트를 찾고 있어요</span>
    </div>
  );
}

function Avatar({ artist, size }: { artist: Artist; size: "small" | "large" }) {
  const initials = getArtistInitials(artist.name);
  const imageUrl = getSafeArtistImageUrl(artist.imageUrl);

  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ backgroundColor: getArtistAvatarColor(artist.id) }}
      aria-hidden="true"
    >
      <span className="avatar-initials">{initials}</span>
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = ARTIST_IMAGE_PLACEHOLDER;
        }}
      />
    </span>
  );
}

function ArtistImage({ artist, className }: { artist: Artist; className: string }) {
  return (
    <img
      className={className}
      src={getSafeArtistImageUrl(artist.imageUrl)}
      alt={`${artist.name} 이미지`}
      draggable={false}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = ARTIST_IMAGE_PLACEHOLDER;
      }}
    />
  );
}

type SelectedArtistPanelProps = {
  artist: Artist;
  newsItems: MusicNews[];
  onClear: () => void;
  onOpenDetail: (newsId: string) => void;
};

function SelectedArtistPanel({
  artist,
  newsItems,
  onClear,
  onOpenDetail
}: SelectedArtistPanelProps) {
  const latestNews = newsItems[0];

  return (
    <section className="selected-artist-panel" aria-label={`${artist.name} 정보`}>
      <div className="selected-artist-main">
        <Avatar artist={artist} size="small" />
        <div>
          <span>팔로우 중</span>
          <h3>{artist.name}</h3>
          <p>{getArtistGenresLabel(artist)}</p>
        </div>
      </div>

      <div className="artist-meta-grid">
        <div>
          <strong>{newsItems.length}</strong>
          <span>등록된 소식</span>
        </div>
        <div>
          <strong>{latestNews ? getCategoryLabel(latestNews.category) : "-"}</strong>
          <span>최근 업데이트</span>
        </div>
      </div>

      {artist.description && (
        <p className="selected-artist-description">{artist.description}</p>
      )}

      {latestNews && (
        <button
          className="artist-latest-news"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail(latestNews.id);
          }}
        >
          <span>{getNewsDateLabel(latestNews)}</span>
          <strong>{latestNews.title}</strong>
        </button>
      )}

      <button className="panel-text-button" type="button" onClick={onClear}>
        전체 소식 보기
      </button>
    </section>
  );
}

type ArtistDetailScreenProps = {
  artist?: Artist;
  followed: boolean;
  onBack: () => void;
  onToggleFollowArtist: (artist: Artist) => void;
  onOpenRelatedNews: (newsId: string) => void;
};

function ArtistDetailScreen({
  artist,
  followed,
  onBack,
  onToggleFollowArtist,
  onOpenRelatedNews
}: ArtistDetailScreenProps) {
  const relatedNews = useMemo(
    () =>
      artist
        ? musicNews
            .filter((news) => news.artistId === artist.id)
            .sort((a, b) => getNewsSortTime(b) - getNewsSortTime(a))
        : [],
    [artist]
  );

  if (!artist) {
    return (
      <main className="app-shell page-shell detail-shell">
        <button className="round-icon-button floating-back" type="button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          <span className="sr-only">홈으로</span>
        </button>
        <section className="not-found">
          <h1>아티스트 정보를 찾을 수 없습니다.</h1>
          <button className="primary-button blue-button" type="button" onClick={onBack}>
            홈으로 돌아가기
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell artist-detail-shell">
      <section className="artist-detail-hero">
        <button className="round-icon-button floating-back" type="button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          <span className="sr-only">뒤로가기</span>
        </button>
        <ArtistImage artist={artist} className="artist-detail-image" />
      </section>

      <section className="artist-detail-body">
        <span className="artist-source-label">
          {artist.source === "THEAUDIODB" ? "TheAudioDB" : artist.source}
        </span>
        <h1>{artist.name}</h1>
        <p className="artist-detail-genres">{getArtistGenresLabel(artist)}</p>
        <p className="artist-detail-description">
          {artist.description ?? "아티스트 설명이 아직 준비되지 않았어요."}
        </p>

        {artist.externalUrl && (
          <a
            className="artist-external-link"
            href={artist.externalUrl}
            target="_blank"
            rel="noreferrer"
          >
            공식 사이트 보기
          </a>
        )}

        <button
          className={`artist-follow-button ${followed ? "is-followed" : ""}`}
          type="button"
          onClick={() => onToggleFollowArtist(artist)}
        >
          {followed ? "언팔로우" : "팔로우"}
        </button>
      </section>

      <section className="artist-related-section">
        <h2>관련 소식</h2>
        {relatedNews.length > 0 ? (
          <div className="timeline">
            {relatedNews.map((news) => (
              <NewsCard key={news.id} news={news} onOpenDetail={onOpenRelatedNews} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="아직 등록된 소식이 없어요"
            description="새로운 공연, 발매, 티켓 소식이 생기면 이곳에 보여드려요."
          />
        )}
      </section>
    </main>
  );
}

type CalendarScreenProps = {
  followedArtistIds: string[];
  notificationSettings: NotificationSettings;
  onOpenEvent: (calendarEventId: string) => void;
  onOpenHome: () => void;
  onOpenNotifications: () => void;
  onSaveNotification: (calendarEventId: string, remindBefore: RemindBefore) => Promise<boolean>;
  onRemoveNotification: (calendarEventId: string) => void;
};

function CalendarScreen({
  followedArtistIds,
  notificationSettings,
  onOpenEvent,
  onOpenHome,
  onOpenNotifications,
  onSaveNotification,
  onRemoveNotification
}: CalendarScreenProps) {
  const [filter, setFilter] = useState<CalendarFilter>("month");

  const followedEvents = useMemo(
    () =>
      calendarEvents
        .filter((event) => followedArtistIds.includes(event.artistId))
        .sort((a, b) => getDateTime(a.date) - getDateTime(b.date)),
    [followedArtistIds]
  );

  const filteredEvents = useMemo(() => {
    const today = new Date();

    return followedEvents.filter((event) => {
      const eventDate = parseLocalDate(event.date);

      if (filter === "today") {
        return isSameDate(eventDate, today);
      }

      if (filter === "week") {
        return isThisWeek(eventDate, today);
      }

      return isThisMonth(eventDate, today);
    });
  }, [filter, followedEvents]);

  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce<Array<{ date: string; events: CalendarEvent[] }>>((groups, event) => {
      const existingGroup = groups.find((group) => group.date === event.date);

      if (existingGroup) {
        existingGroup.events.push(event);
        return groups;
      }

      return [...groups, { date: event.date, events: [event] }];
    }, []);
  }, [filteredEvents]);

  return (
    <main className="app-shell page-shell calendar-shell">
      <header className="calendar-header">
        <div>
          <span>GOYO Calendar</span>
          <h1>음악 일정</h1>
          <p>팔로우한 아티스트의 공연, 앨범, 신곡 일정을 모아봤어요.</p>
        </div>
      </header>

      <div className="calendar-filter-tabs" aria-label="캘린더 필터">
        <button
          className={filter === "today" ? "is-active" : ""}
          type="button"
          onClick={() => setFilter("today")}
        >
          오늘
        </button>
        <button
          className={filter === "week" ? "is-active" : ""}
          type="button"
          onClick={() => setFilter("week")}
        >
          이번 주
        </button>
        <button
          className={filter === "month" ? "is-active" : ""}
          type="button"
          onClick={() => setFilter("month")}
        >
          이번 달
        </button>
      </div>

      {groupedEvents.length > 0 ? (
        <section className="calendar-event-list" aria-label="음악 일정 목록">
          {groupedEvents.map((group) => (
            <div className="calendar-date-group" key={group.date}>
              <div className="calendar-date-heading">
                <strong>{formatKoreanDate(group.date)}</strong>
                <span>{group.events.length}개 일정</span>
              </div>

              <div className="calendar-date-events">
                {group.events.map((event) => (
                  <CalendarEventCard
                    key={event.id}
                    event={event}
                    notificationSetting={notificationSettings[event.id]}
                    onOpenEvent={onOpenEvent}
                    onSaveNotification={onSaveNotification}
                    onRemoveNotification={onRemoveNotification}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <EmptyState
          title="예정된 음악 일정이 없어요"
          description="팔로우한 아티스트의 일정이 생기면 이곳에 날짜별로 정리됩니다."
        />
      )}

      <BottomNav
        activeTab="calendar"
        onHome={onOpenHome}
        onCalendar={() => undefined}
        onNotifications={onOpenNotifications}
      />
    </main>
  );
}

type CalendarEventCardProps = {
  event: CalendarEvent;
  notificationSetting?: NotificationSetting;
  onOpenEvent: (calendarEventId: string) => void;
  onSaveNotification: (calendarEventId: string, remindBefore: RemindBefore) => Promise<boolean>;
  onRemoveNotification: (calendarEventId: string) => void;
};

function CalendarEventCard({
  event,
  notificationSetting,
  onOpenEvent,
  onSaveNotification,
  onRemoveNotification
}: CalendarEventCardProps) {
  const artist = artists.find((item) => item.id === event.artistId);
  const sourceNews = musicNews.find((item) => item.id === event.musicNewsId);
  const notificationEnabled = Boolean(notificationSetting);

  return (
    <article className={`calendar-event-card ${notificationEnabled ? "is-notified" : ""}`}>
      <button
        className="calendar-event-main"
        type="button"
        onClick={() => onOpenEvent(event.id)}
      >
        <div className="calendar-event-date">
          <strong>{formatShortDate(event.date)}</strong>
          <span>{getCalendarEventTypeLabel(event.type)}</span>
        </div>
        <div className="calendar-event-copy">
          <span>{artist?.name ?? "아티스트"} · {getCategoryLabel(event.category)}</span>
          <h3>{event.title}</h3>
          <p>{sourceNews?.venue ?? sourceNews?.subtitle ?? "일정 상세"}</p>
        </div>
      </button>

      <NotificationControls
        setting={notificationSetting}
        variant="calendar"
        onSave={(remindBefore) => onSaveNotification(event.id, remindBefore)}
        onRemove={() => onRemoveNotification(event.id)}
      />
    </article>
  );
}

type NotificationCenterScreenProps = {
  notificationSettings: NotificationSettings;
  sentNotificationIds: string[];
  onOpenCalendar: () => void;
  onOpenHome: () => void;
  onOpenEvent: (calendarEventId: string) => void;
  onRemoveNotification: (calendarEventId: string) => void;
};

function NotificationCenterScreen({
  notificationSettings,
  sentNotificationIds,
  onOpenCalendar,
  onOpenHome,
  onOpenEvent,
  onRemoveNotification
}: NotificationCenterScreenProps) {
  const notificationItems = useMemo(() => {
    return Object.values(notificationSettings)
      .map((setting) => {
        const event = calendarEvents.find((calendarEvent) => calendarEvent.id === setting.eventId);
        return event ? { event, setting } : null;
      })
      .filter((item): item is { event: CalendarEvent; setting: NotificationSetting } => Boolean(item))
      .sort((a, b) => {
        const aPast = isPastCalendarDate(a.event.date);
        const bPast = isPastCalendarDate(b.event.date);

        if (aPast !== bPast) {
          return aPast ? 1 : -1;
        }

        const aTime = getDateTime(a.event.date);
        const bTime = getDateTime(b.event.date);
        return aPast ? bTime - aTime : aTime - bTime;
      });
  }, [notificationSettings]);

  return (
    <main className="app-shell page-shell notification-center-shell">
      <header className="calendar-header">
        <div>
          <span>GOYO Notification</span>
          <h1>알림센터</h1>
          <p>설정한 음악 일정 알림과 발송 상태를 모아볼 수 있어요.</p>
        </div>
      </header>

      {notificationItems.length > 0 ? (
        <section className="notification-list" aria-label="알림 설정 목록">
          {notificationItems.map(({ event, setting }) => {
            const artist = artists.find((item) => item.id === event.artistId);
            const sent = sentNotificationIds.includes(
              getScheduledNotificationId(event.id, setting.remindBefore)
            );
            const past = isPastCalendarDate(event.date);

            return (
              <article className={`notification-list-item ${past ? "is-past" : ""}`} key={event.id}>
                <button
                  className="notification-list-main"
                  type="button"
                  onClick={() => onOpenEvent(event.id)}
                >
                  <div className="notification-list-date">
                    <strong>{formatShortDate(event.date)}</strong>
                    <span>{getCalendarEventTypeLabel(event.type)}</span>
                  </div>

                  <div className="notification-list-copy">
                    <div className="notification-list-badges">
                      <span>{getReminderLabel(setting.remindBefore)}</span>
                      {sent && <span className="is-sent">발송됨</span>}
                      {past && <span className="is-past-label">지난 일정</span>}
                    </div>
                    <h2>{event.title}</h2>
                    <p>{artist?.name ?? "아티스트"} · {getCategoryLabel(event.category)}</p>
                  </div>
                </button>

                <button
                  className="notification-remove-button"
                  type="button"
                  onClick={() => onRemoveNotification(event.id)}
                >
                  알림 해제
                </button>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          title="설정된 알림이 없어요"
          description="캘린더에서 음악 일정별 알림 시간을 선택하면 이곳에 표시됩니다."
        />
      )}

      <BottomNav
        activeTab="notifications"
        onHome={onOpenHome}
        onCalendar={onOpenCalendar}
        onNotifications={() => undefined}
      />
    </main>
  );
}

type NotificationControlsProps = {
  setting?: NotificationSetting;
  variant: "calendar" | "detail";
  onSave: (remindBefore: RemindBefore) => Promise<boolean>;
  onRemove: () => void;
};

function NotificationControls({
  setting,
  variant,
  onSave,
  onRemove
}: NotificationControlsProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const enabled = Boolean(setting);
  const buttonClassName =
    variant === "calendar"
      ? `calendar-notification-button ${enabled ? "is-enabled" : ""}`
      : `notification-button ${enabled ? "is-enabled" : ""}`;

  const handleOptionSelect = async (remindBefore: RemindBefore) => {
    const saved = await onSave(remindBefore);
    if (saved) {
      setOptionsOpen(false);
    }
  };

  return (
    <div className={`notification-control notification-control-${variant}`}>
      <button
        className={buttonClassName}
        type="button"
        aria-expanded={optionsOpen}
        aria-pressed={enabled}
        onClick={(event) => {
          event.stopPropagation();
          setOptionsOpen((currentOpen) => !currentOpen);
        }}
      >
        {enabled ? "알림 설정됨" : "알림 받기"}
      </button>

      {optionsOpen && (
        <div className="notification-options" aria-label="알림 시간 선택">
          {REMINDER_OPTIONS.map((option) => (
            <button
              className={setting?.remindBefore === option.value ? "is-selected" : ""}
              key={option.value}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleOptionSelect(option.value);
              }}
            >
              {option.label}
            </button>
          ))}

          {enabled && (
            <button
              className="notification-clear-option"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
                setOptionsOpen(false);
              }}
            >
              알림 해제
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type NewsCardProps = {
  news: MusicNews;
  onOpenDetail: (newsId: string) => void;
};

function NewsCard({ news, onOpenDetail }: NewsCardProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenDetail(news.id);
  };

  return (
    <article className="timeline-item">
      <div className="timeline-date">{getNewsDateLabel(news)}</div>
      <button className="news-card" type="button" onClick={handleClick}>
        <span>{getCategoryLabel(news.category)}</span>
        <h3>{news.title}</h3>
        <p>{news.subtitle}</p>
      </button>
    </article>
  );
}

type DetailScreenProps = {
  news?: MusicNews;
  calendarEvent?: CalendarEvent;
  notificationSetting?: NotificationSetting;
  mode?: "news" | "event";
  onBack: () => void;
  onSaveNotification?: (calendarEventId: string, remindBefore: RemindBefore) => Promise<boolean>;
  onRemoveNotification?: (calendarEventId: string) => void;
};

function DetailScreen({
  news,
  calendarEvent,
  notificationSetting,
  mode = "news",
  onBack,
  onSaveNotification,
  onRemoveNotification
}: DetailScreenProps) {
  if (!news) {
    return (
      <main className="app-shell page-shell detail-shell">
        <button className="round-icon-button floating-back" type="button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          <span className="sr-only">홈으로</span>
        </button>
        <section className="not-found">
          <h1>소식을 찾을 수 없습니다.</h1>
          <button className="primary-button blue-button" type="button" onClick={onBack}>
            홈으로 돌아가기
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell detail-shell">
      <section className="detail-hero" style={{ backgroundColor: getNewsHeroColor(news) }}>
        <button className="round-icon-button floating-back" type="button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          <span className="sr-only">뒤로가기</span>
        </button>
        {news.imageUrl && (
          <img
            className="detail-hero-image"
            src={news.imageUrl}
            alt=""
            draggable={false}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        )}
      </section>

      <section className="detail-body">
        <span className="detail-category">
          {mode === "event" ? `EVENT · ${getCategoryLabel(news.category)}` : getCategoryLabel(news.category)}
        </span>
        <h1>{news.title}</h1>
        <p className="detail-location">{news.venue ?? news.subtitle}</p>

        <dl className="info-list">
          {getNewsInfoRows(news).map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="detail-copy">{news.description}</p>

        {mode === "event" && calendarEvent && onSaveNotification && onRemoveNotification && (
          <NotificationControls
            setting={notificationSetting}
            variant="detail"
            onSave={(remindBefore) => onSaveNotification(calendarEvent.id, remindBefore)}
            onRemove={() => onRemoveNotification(calendarEvent.id)}
          />
        )}

        <button
          className="primary-button blue-button"
          type="button"
          onClick={() => alert("캘린더에 추가되었습니다.")}
        >
          캘린더에 추가하기
        </button>
      </section>
    </main>
  );
}

type BottomNavProps = {
  activeTab: MainTab;
  onHome: () => void;
  onCalendar: () => void;
  onNotifications: () => void;
};

function BottomNav({ activeTab, onHome, onCalendar, onNotifications }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="하단 메뉴">
      <button
        className={activeTab === "notifications" ? "active" : ""}
        type="button"
        aria-label="알림센터"
        onClick={onNotifications}
      >
        <Bell size={31} aria-hidden="true" />
        <span>알림</span>
      </button>
      <button
        className={activeTab === "home" ? "active" : ""}
        type="button"
        aria-label="홈"
        onClick={onHome}
      >
        <Home size={31} aria-hidden="true" />
        <span>홈</span>
      </button>
      <button
        className={activeTab === "calendar" ? "active" : ""}
        type="button"
        aria-label="캘린더"
        onClick={onCalendar}
      >
        <CalendarDays size={32} aria-hidden="true" />
        <span>캘린더</span>
      </button>
    </nav>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
  compact?: boolean;
};

function EmptyState({ title, description, compact = false }: EmptyStateProps) {
  return (
    <div className={`empty-state ${compact ? "empty-state-compact" : ""}`}>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export default App;
