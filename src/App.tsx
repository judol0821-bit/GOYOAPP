import { useEffect, useMemo, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CircleUserRound,
  Home,
  LogOut,
  Menu,
  Search
} from "lucide-react";
import { artists, musicNews } from "./data/mockData";
import type { Artist, MusicNews } from "./types";

const FOLLOW_STORAGE_KEY = "followedArtistIds";
const USER_STORAGE_KEY = "goyoUsers";

type Screen = "login" | "signup" | "home" | "calendar" | "profile" | "detail" | "eventDetail";
type MainTab = "home" | "calendar";
type CalendarFilter = "today" | "week" | "month";
type StoredUser = {
  name: string;
  email: string;
  password: string;
};

function parseLocalDate(dateText: string) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatKoreanDate(dateText: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(parseLocalDate(dateText));
}

function formatShortDate(dateText: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit"
  }).format(parseLocalDate(dateText));
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

function saveFollowedArtistIds(nextIds: string[]) {
  window.localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify(nextIds));
}

function readFollowedArtistIds() {
  try {
    const stored = window.localStorage.getItem(FOLLOW_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return Array.from(new Set(parsed));
    }
  } catch {
    window.localStorage.removeItem(FOLLOW_STORAGE_KEY);
  }

  return [];
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

function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);
  const [detailBackScreen, setDetailBackScreen] = useState<MainTab>("home");
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [followedArtistIds, setFollowedArtistIds] = useState<string[]>(readFollowedArtistIds);

  useEffect(() => {
    saveFollowedArtistIds(followedArtistIds);
  }, [followedArtistIds]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen, selectedNewsId]);

  const showScreen = (nextScreen: Screen) => {
    if (nextScreen !== "detail" && nextScreen !== "eventDetail") {
      setSelectedNewsId(null);
    }
    setScreen(nextScreen);
  };

  const toggleFollowArtist = (artistId: string) => {
    const nextFollowedArtistIds = followedArtistIds.includes(artistId)
      ? followedArtistIds.filter((id) => id !== artistId)
      : Array.from(new Set([...followedArtistIds, artistId]));

    setFollowedArtistIds(nextFollowedArtistIds);
    saveFollowedArtistIds(nextFollowedArtistIds);
  };

  const openDetail = (newsId: string, backScreen: MainTab = "home") => {
    setSelectedNewsId(newsId);
    setDetailBackScreen(backScreen);
    setScreen(backScreen === "calendar" ? "eventDetail" : "detail");
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
        followedArtistIds={followedArtistIds}
        onToggleFollowArtist={toggleFollowArtist}
        onOpenDetail={(newsId) => openDetail(newsId, "home")}
        onOpenCalendar={() => showScreen("calendar")}
        onOpenProfile={() => showScreen("profile")}
      />
    );
  }

  if (screen === "profile") {
    return (
      <ProfileScreen
        user={currentUser}
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
        onOpenEvent={(newsId) => openDetail(newsId, "calendar")}
        onOpenHome={() => showScreen("home")}
      />
    );
  }

  if (screen === "detail" || screen === "eventDetail") {
    const news = musicNews.find((item) => item.id === selectedNewsId);
    return (
      <DetailScreen
        news={news}
        mode={screen === "eventDetail" ? "event" : "news"}
        onBack={() => showScreen(detailBackScreen)}
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
  followedArtistIds: string[];
  onBack: () => void;
  onLogout: () => void;
};

function ProfileScreen({ user, followedArtistIds, onBack, onLogout }: ProfileScreenProps) {
  const followedArtists = useMemo(
    () => artists.filter((artist) => followedArtistIds.includes(artist.id)),
    [followedArtistIds]
  );

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
                  <span>{artist.genre}</span>
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
  followedArtistIds: string[];
  onToggleFollowArtist: (artistId: string) => void;
  onOpenDetail: (newsId: string) => void;
  onOpenCalendar: () => void;
  onOpenProfile: () => void;
};

function HomeScreen({
  followedArtistIds,
  onToggleFollowArtist,
  onOpenDetail,
  onOpenCalendar,
  onOpenProfile
}: HomeScreenProps) {
  const [query, setQuery] = useState("");
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);

  const followedArtists = useMemo(
    () => artists.filter((artist) => followedArtistIds.includes(artist.id)),
    [followedArtistIds]
  );

  const selectedArtist = useMemo(
    () => followedArtists.find((artist) => artist.id === selectedArtistId),
    [followedArtists, selectedArtistId]
  );

  const followedNews = useMemo(
    () =>
      musicNews
        .filter((news) => followedArtistIds.includes(news.artistId))
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
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

  const searchedArtists = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return [];
    }

    return artists.filter((artist) =>
      `${artist.name} ${artist.genre}`.toLowerCase().includes(keyword)
    );
  }, [query]);

  const handleSearchResultSelect = (
    artistId: string,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    if (!followedArtistIds.includes(artistId)) {
      onToggleFollowArtist(artistId);
    }
    setSelectedArtistId(artistId);
    setQuery("");
  };

  const handleSearchFollowButtonClick = (
    artistId: string,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    const isAlreadyFollowed = followedArtistIds.includes(artistId);

    onToggleFollowArtist(artistId);
    setSelectedArtistId((currentArtistId) => {
      if (isAlreadyFollowed && currentArtistId === artistId) {
        return null;
      }

      if (!isAlreadyFollowed) {
        return artistId;
      }

      return currentArtistId;
    });
  };

  const handleFollowedArtistClick = (
    artistId: string,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    setSelectedArtistId((currentArtistId) =>
      currentArtistId === artistId ? null : artistId
    );
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
          {searchedArtists.length > 0 ? (
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
                onClick={(event) => handleFollowedArtistClick(artist.id, event)}
              >
                <Avatar artist={artist} size="large" />
                <span>{artist.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="아직 팔로우한 아티스트가 없어요"
            description="검색 결과에서 아티스트를 누르면 이곳에 저장됩니다."
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

      <BottomNav activeTab="home" onHome={() => undefined} onCalendar={onOpenCalendar} />
    </main>
  );
}

type ArtistSearchRowProps = {
  artist: Artist;
  followed: boolean;
  onSelect: (artistId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onToggleFollow: (artistId: string, event: MouseEvent<HTMLButtonElement>) => void;
};

function ArtistSearchRow({
  artist,
  followed,
  onSelect,
  onToggleFollow
}: ArtistSearchRowProps) {
  return (
    <article className="artist-row">
      <button
        className="artist-row-profile"
        type="button"
        onClick={(event) => onSelect(artist.id, event)}
      >
        <Avatar artist={artist} size="small" />
        <span className="artist-row-copy">
          <strong>{artist.name}</strong>
          <span>{artist.genre}</span>
        </span>
      </button>
      <button
        className={`follow-action-button ${followed ? "is-followed" : ""}`}
        type="button"
        onClick={(event) => onToggleFollow(artist.id, event)}
      >
        {followed ? "팔로잉" : "팔로우"}
      </button>
    </article>
  );
}

function Avatar({ artist, size }: { artist: Artist; size: "small" | "large" }) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ backgroundColor: artist.color }}
      aria-hidden="true"
    >
      {artist.initials}
    </span>
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
          <p>{artist.genre}</p>
        </div>
      </div>

      <div className="artist-meta-grid">
        <div>
          <strong>{newsItems.length}</strong>
          <span>등록된 소식</span>
        </div>
        <div>
          <strong>{latestNews?.category ?? "-"}</strong>
          <span>최근 업데이트</span>
        </div>
      </div>

      {latestNews && (
        <button
          className="artist-latest-news"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail(latestNews.id);
          }}
        >
          <span>{latestNews.dateLabel}</span>
          <strong>{latestNews.title}</strong>
        </button>
      )}

      <button className="panel-text-button" type="button" onClick={onClear}>
        전체 소식 보기
      </button>
    </section>
  );
}

type CalendarScreenProps = {
  followedArtistIds: string[];
  onOpenEvent: (newsId: string) => void;
  onOpenHome: () => void;
};

function CalendarScreen({ followedArtistIds, onOpenEvent, onOpenHome }: CalendarScreenProps) {
  const [filter, setFilter] = useState<CalendarFilter>("month");

  const followedEvents = useMemo(
    () =>
      musicNews
        .filter((news) => followedArtistIds.includes(news.artistId))
        .sort((a, b) => parseLocalDate(a.eventDate).getTime() - parseLocalDate(b.eventDate).getTime()),
    [followedArtistIds]
  );

  const filteredEvents = useMemo(() => {
    const today = new Date();

    return followedEvents.filter((news) => {
      const eventDate = parseLocalDate(news.eventDate);

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
    return filteredEvents.reduce<Array<{ date: string; events: MusicNews[] }>>((groups, event) => {
      const existingGroup = groups.find((group) => group.date === event.eventDate);

      if (existingGroup) {
        existingGroup.events.push(event);
        return groups;
      }

      return [...groups, { date: event.eventDate, events: [event] }];
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
                  <CalendarEventCard key={event.id} event={event} onOpenEvent={onOpenEvent} />
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

      <BottomNav activeTab="calendar" onHome={onOpenHome} onCalendar={() => undefined} />
    </main>
  );
}

type CalendarEventCardProps = {
  event: MusicNews;
  onOpenEvent: (newsId: string) => void;
};

function CalendarEventCard({ event, onOpenEvent }: CalendarEventCardProps) {
  const artist = artists.find((item) => item.id === event.artistId);

  return (
    <button className="calendar-event-card" type="button" onClick={() => onOpenEvent(event.id)}>
      <div className="calendar-event-date">
        <strong>{formatShortDate(event.eventDate)}</strong>
        <span>{event.category}</span>
      </div>
      <div className="calendar-event-copy">
        <span>{artist?.name ?? "아티스트"}</span>
        <h3>{event.title}</h3>
        <p>{event.location ?? event.subtitle}</p>
      </div>
    </button>
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
      <div className="timeline-date">{news.dateLabel}</div>
      <button className="news-card" type="button" onClick={handleClick}>
        <span>{news.category}</span>
        <h3>{news.title}</h3>
        <p>{news.subtitle}</p>
      </button>
    </article>
  );
}

type DetailScreenProps = {
  news?: MusicNews;
  mode?: "news" | "event";
  onBack: () => void;
};

function DetailScreen({ news, mode = "news", onBack }: DetailScreenProps) {
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
      <section className="detail-hero" style={{ backgroundColor: news.heroColor }}>
        <button className="round-icon-button floating-back" type="button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          <span className="sr-only">뒤로가기</span>
        </button>
      </section>

      <section className="detail-body">
        <span className="detail-category">{mode === "event" ? `EVENT · ${news.category}` : news.category}</span>
        <h1>{news.title}</h1>
        <p className="detail-location">{news.location ?? news.subtitle}</p>

        <dl className="info-list">
          {news.infoRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="detail-copy">{news.body}</p>

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
};

function BottomNav({ activeTab, onHome, onCalendar }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="하단 메뉴">
      <button type="button" aria-label="메뉴" onClick={() => alert("메뉴 기능은 준비 중입니다.")}>
        <Menu size={32} aria-hidden="true" />
        <span>메뉴</span>
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
