# GOYO Backend API Specification v1

이 문서는 GOYO React PWA가 `mockArtists`, `mockNews` 대신 실제 서버 API와 연결될 수 있도록 정의한 MVP API 명세입니다. 프론트엔드는 `VITE_API_BASE_URL`이 없거나 API 호출이 실패하면 기존 mock data를 fallback으로 사용합니다.

## 1. API Base URL

```txt
https://api.goyo.app/v1
```

프론트엔드 환경변수:

```env
VITE_API_BASE_URL=https://api.goyo.app/v1
```

MVP에서는 로그인을 구현하지 않습니다. 서버가 사용자별 저장을 지원해야 하는 경우 프론트는 임시 anonymous id를 localStorage에 저장하고 요청 헤더로 전달할 수 있습니다.

```http
X-GOYO-Anonymous-Id: anon_01JABCDEF123
```

## 2. 공통 정책

- JSON 응답을 기본으로 사용합니다.
- 필드명은 camelCase를 유지합니다.
- 이미지가 없으면 `imageUrl: ""`로 내려줍니다.
- 날짜는 `YYYY-MM-DD` 형식입니다.
- 시간은 `HH:mm` 형식입니다.
- `NewsItem.type`은 `concert`, `album`, `ticket`, `festival` 중 하나입니다.
- 목록 응답은 중복 id를 포함하지 않는 것을 원칙으로 합니다.
- API 실패 시 프론트엔드는 기존 mock fallback을 사용합니다.

공통 에러 응답:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "요청 값을 확인해 주세요."
  }
}
```

권장 에러 코드:

```txt
INVALID_REQUEST
NOT_FOUND
SERVER_ERROR
UNAUTHORIZED_ANONYMOUS_USER
```

## 3. 데이터 모델

### Artist

프론트 mock fallback: `src/data/mockArtists.js`

```json
{
  "id": "iu",
  "name": "아이유",
  "imageUrl": "https://example.com/artists/iu.jpg",
  "genres": ["K-Pop", "Ballad", "Singer-songwriter"],
  "externalId": "melon:artist:261143",
  "source": "melon"
}
```

필드 매칭:

| API field | mockArtists field | 설명 |
| --- | --- | --- |
| `id` | `id` | 프론트 라우팅/팔로우 저장에 사용하는 내부 id |
| `name` | `name` | 아티스트명 |
| `imageUrl` | `imageUrl` | 프로필 이미지, 없으면 빈 문자열 |
| `genres` | `genres` | 장르 문자열 배열 |
| `externalId` | 없음 | 외부 데이터 소스 id |
| `source` | 없음 | `melon`, `spotify`, `manual` 등 |

### NewsItem

프론트 mock fallback: `src/data/mockNews.js`

```json
{
  "id": "news-iu-concert-001",
  "artistId": "iu",
  "artistName": "아이유",
  "type": "concert",
  "title": "아이유 단독 콘서트 일정 공개",
  "description": "아이유의 단독 콘서트가 서울에서 진행될 예정입니다.",
  "imageUrl": "https://example.com/news/iu-concert.jpg",
  "date": "2026-07-18",
  "startTime": "18:00",
  "location": "KSPO DOME",
  "sourceUrl": "https://example.com/source/iu-concert",
  "createdAt": "2026-06-01T09:00:00+09:00"
}
```

필드 매칭:

| API field | mockNews field | 설명 |
| --- | --- | --- |
| `id` | `id` | 뉴스 상세 라우팅에 사용 |
| `artistId` | `artistId` | 팔로우 아티스트 필터링 기준 |
| `artistName` | `artistName` | 카드/상세 표시 |
| `type` | `type` | `concert`, `album`, `ticket`, `festival` |
| `title` | `title` | 카드/상세 제목 |
| `description` | `description` | 설명 |
| `imageUrl` | `imageUrl` | 없으면 빈 문자열 |
| `date` | `date` | 일정 날짜 |
| `startTime` | `startTime` | 일정 시간 |
| `location` | `location` | 장소 또는 플랫폼 |
| `sourceUrl` | `sourceUrl` | 원문 링크 |
| `createdAt` | `createdAt` | 최신순 정렬 기준 |

### CalendarEvent

프론트 localStorage key: `calendarEvents`

```json
{
  "id": "calendar-news-iu-concert-001",
  "newsId": "news-iu-concert-001",
  "title": "아이유 단독 콘서트 일정 공개",
  "date": "2026-07-18",
  "time": "18:00",
  "location": "KSPO DOME",
  "artistName": "아이유",
  "type": "concert"
}
```

필드 매칭:

| API field | local field | 설명 |
| --- | --- | --- |
| `id` | `id` | 캘린더 이벤트 id |
| `newsId` | `newsId` | 연결된 뉴스 id, 중복 저장 방지 기준 |
| `title` | `title` | 일정 제목 |
| `date` | `date` | `YYYY-MM-DD` |
| `time` | `time` | `HH:mm`, NewsItem의 `startTime`에서 생성 |
| `location` | `location` | 장소 |
| `artistName` | `artistName` | 아티스트명 |
| `type` | `type` | 뉴스 유형 |

## 4. 아티스트 API

### GET /artists/search?q=

목적: 온보딩에서 아티스트 검색 결과를 제공합니다.

프론트 사용 위치:

- `src/hooks/useArtistSearch.js`
- `src/pages/OnboardingPage.jsx`

요청 예시:

```http
GET /artists/search?q=아이유
```

빈 검색어 정책:

- `q`가 없거나 공백이면 서버는 `200`과 빈 배열을 반환할 수 있습니다.
- 프론트의 `searchArtists(query)`는 빈 query에서 빈 배열을 기대합니다.
- 온보딩 전체 목록이 필요할 때 프론트는 `GET /artists` 또는 mock fallback을 사용할 수 있습니다.

응답 예시:

```json
{
  "artists": [
    {
      "id": "iu",
      "name": "아이유",
      "imageUrl": "https://example.com/artists/iu.jpg",
      "genres": ["K-Pop", "Ballad", "Singer-songwriter"],
      "externalId": "melon:artist:261143",
      "source": "melon"
    }
  ]
}
```

에러 예시:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "아티스트 검색에 실패했습니다."
  }
}
```

mock fallback 매칭:

- `mockArtists`에서 `name`, `genres`를 기준으로 검색합니다.
- 중복 `id`는 제거합니다.
- `externalId`, `source`가 없어도 프론트는 깨지지 않아야 합니다.

### GET /artists/:id

목적: 팔로우한 아티스트의 프로필 정보를 조회합니다.

프론트 사용 위치:

- `src/pages/HomePage.jsx`
- `src/pages/MyPage.jsx`

요청 예시:

```http
GET /artists/iu
```

응답 예시:

```json
{
  "artist": {
    "id": "iu",
    "name": "아이유",
    "imageUrl": "https://example.com/artists/iu.jpg",
    "genres": ["K-Pop", "Ballad", "Singer-songwriter"],
    "externalId": "melon:artist:261143",
    "source": "melon"
  }
}
```

에러 예시:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "아티스트를 찾을 수 없습니다."
  }
}
```

mock fallback 매칭:

- `mockArtists.find((artist) => artist.id === id)`

## 5. 뉴스 API

### GET /news?artistIds=

목적: 팔로우한 아티스트 id 목록을 기준으로 뉴스/공연/앨범/티켓/페스티벌 소식을 조회합니다.

프론트 사용 위치:

- `src/pages/PreviewPage.jsx`
- `src/pages/HomePage.jsx`

요청 예시:

```http
GET /news?artistIds=iu,newjeans,hyukoh
```

응답 정렬:

- `createdAt` 최신순 권장
- 같은 `id` 중복 제거

응답 예시:

```json
{
  "news": [
    {
      "id": "news-newjeans-festival-001",
      "artistId": "newjeans",
      "artistName": "뉴진스",
      "type": "festival",
      "title": "뉴진스 여름 페스티벌 출연",
      "description": "뉴진스가 대형 여름 음악 페스티벌 라인업에 이름을 올렸습니다.",
      "imageUrl": "https://example.com/news/newjeans-festival.jpg",
      "date": "2026-08-15",
      "startTime": "19:30",
      "location": "난지한강공원",
      "sourceUrl": "https://example.com/source/newjeans-festival",
      "createdAt": "2026-06-01T12:20:00+09:00"
    }
  ]
}
```

에러 예시:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "artistIds는 필수입니다."
  }
}
```

mock fallback 매칭:

- `mockNews.filter((news) => artistIds.includes(news.artistId))`
- 프론트에서 `hiddenNewsIds` 제외 처리는 유지합니다.
- 프론트에서 최신순 정렬을 한 번 더 수행합니다.

### GET /news/:id

목적: 뉴스 상세 페이지에서 단건 상세 정보를 조회합니다.

프론트 사용 위치:

- `src/pages/DetailPage.jsx`
- 캘린더 이벤트 클릭 후 `/detail/:newsId`

요청 예시:

```http
GET /news/news-iu-concert-001
```

응답 예시:

```json
{
  "news": {
    "id": "news-iu-concert-001",
    "artistId": "iu",
    "artistName": "아이유",
    "type": "concert",
    "title": "아이유 단독 콘서트 일정 공개",
    "description": "아이유의 단독 콘서트가 서울에서 진행될 예정입니다.",
    "imageUrl": "https://example.com/news/iu-concert.jpg",
    "date": "2026-07-18",
    "startTime": "18:00",
    "location": "KSPO DOME",
    "sourceUrl": "https://example.com/source/iu-concert",
    "createdAt": "2026-06-01T09:00:00+09:00"
  }
}
```

에러 예시:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "소식을 찾을 수 없습니다."
  }
}
```

mock fallback 매칭:

- `mockNews.find((news) => news.id === id)`

### GET /news/today?artistIds=

목적: 홈의 "오늘의 고요" 또는 Preview 진입용 핵심 소식을 빠르게 구성합니다.

프론트 사용 위치:

- 현재 MVP 프론트는 `/news?artistIds=` 결과에서 직접 핵심 소식을 고릅니다.
- 이후 최적화 시 `HomePage`, `PreviewPage`에서 사용할 수 있습니다.

요청 예시:

```http
GET /news/today?artistIds=iu,newjeans
```

응답 예시:

```json
{
  "news": [
    {
      "id": "news-iu-concert-001",
      "artistId": "iu",
      "artistName": "아이유",
      "type": "concert",
      "title": "아이유 단독 콘서트 일정 공개",
      "description": "아이유의 단독 콘서트가 서울에서 진행될 예정입니다.",
      "imageUrl": "https://example.com/news/iu-concert.jpg",
      "date": "2026-07-18",
      "startTime": "18:00",
      "location": "KSPO DOME",
      "sourceUrl": "https://example.com/source/iu-concert",
      "createdAt": "2026-06-01T09:00:00+09:00"
    }
  ]
}
```

에러 예시:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "오늘의 소식을 불러오지 못했습니다."
  }
}
```

mock fallback 매칭:

- MVP에서는 `/news?artistIds=` fallback과 동일하게 `mockNews`를 사용합니다.
- 백엔드는 `date`, `type`, `createdAt`을 기준으로 중요도 정렬을 적용할 수 있습니다.

## 6. 캘린더 API

MVP 프론트는 현재 `calendarEvents`를 localStorage에 저장합니다. 서버 캘린더 API가 구현되면 localStorage는 offline fallback 또는 anonymous cache로 유지할 수 있습니다.

### GET /calendar/events

목적: anonymous user의 저장된 캘린더 일정을 조회합니다.

프론트 사용 위치:

- `src/pages/HomePage.jsx`의 다가오는 일정
- `src/pages/CalendarPage.jsx`
- `src/pages/MyPage.jsx`의 저장한 일정 수

요청 예시:

```http
GET /calendar/events
X-GOYO-Anonymous-Id: anon_01JABCDEF123
```

응답 예시:

```json
{
  "events": [
    {
      "id": "calendar-news-iu-concert-001",
      "newsId": "news-iu-concert-001",
      "title": "아이유 단독 콘서트 일정 공개",
      "date": "2026-07-18",
      "time": "18:00",
      "location": "KSPO DOME",
      "artistName": "아이유",
      "type": "concert"
    }
  ]
}
```

에러 예시:

```json
{
  "error": {
    "code": "UNAUTHORIZED_ANONYMOUS_USER",
    "message": "anonymous user id가 필요합니다."
  }
}
```

mock/local fallback 매칭:

- localStorage `calendarEvents`

### POST /calendar/events

목적: 뉴스 소식을 내부 캘린더 일정으로 저장합니다.

프론트 사용 위치:

- `src/pages/PreviewPage.jsx`
- `src/pages/DetailPage.jsx`

요청 예시:

```http
POST /calendar/events
Content-Type: application/json
X-GOYO-Anonymous-Id: anon_01JABCDEF123

{
  "newsId": "news-iu-concert-001",
  "title": "아이유 단독 콘서트 일정 공개",
  "date": "2026-07-18",
  "time": "18:00",
  "location": "KSPO DOME",
  "artistName": "아이유",
  "type": "concert"
}
```

응답 예시:

```json
{
  "event": {
    "id": "calendar-news-iu-concert-001",
    "newsId": "news-iu-concert-001",
    "title": "아이유 단독 콘서트 일정 공개",
    "date": "2026-07-18",
    "time": "18:00",
    "location": "KSPO DOME",
    "artistName": "아이유",
    "type": "concert"
  }
}
```

중복 정책:

- 같은 anonymous user 안에서 동일 `newsId`는 중복 생성하지 않습니다.
- 이미 존재하면 `200` 또는 `409` 중 하나로 정책을 정합니다.
- 프론트 MVP는 이미 `newsId` 기준 중복 방지 로직을 갖고 있습니다.

중복 에러 예시:

```json
{
  "error": {
    "code": "DUPLICATE_CALENDAR_EVENT",
    "message": "이미 캘린더에 추가된 소식입니다."
  }
}
```

mock/local fallback 매칭:

- 프론트 `createCalendarEvent(news)` 결과와 동일한 필드 구조입니다.

### DELETE /calendar/events/:id

목적: 저장된 캘린더 일정을 삭제합니다.

프론트 사용 위치:

- MVP 화면에는 삭제 UI가 아직 없습니다.
- 이후 Calendar Page 또는 My Page에서 연결할 수 있습니다.

요청 예시:

```http
DELETE /calendar/events/calendar-news-iu-concert-001
X-GOYO-Anonymous-Id: anon_01JABCDEF123
```

응답 예시:

```json
{
  "success": true
}
```

에러 예시:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "삭제할 일정을 찾을 수 없습니다."
  }
}
```

mock/local fallback 매칭:

- localStorage `calendarEvents.filter((event) => event.id !== id)`

## 7. 사용자 설정 API

MVP 프론트는 현재 아래 localStorage key를 사용합니다.

```txt
followedArtistIds
hiddenNewsIds
calendarEvents
```

서버 구현 시 `followedArtistIds`, `hiddenNewsIds`는 preferences API로 동기화합니다. `calendarEvents`는 캘린더 API로 분리합니다.

### GET /me/preferences

목적: anonymous user의 관심 아티스트와 관심없음 처리 목록을 조회합니다.

프론트 사용 위치:

- 앱 초기화 시 추후 연결
- `OnboardingPage`, `PreviewPage`, `HomePage`, `MyPage`

요청 예시:

```http
GET /me/preferences
X-GOYO-Anonymous-Id: anon_01JABCDEF123
```

응답 예시:

```json
{
  "preferences": {
    "followedArtistIds": ["iu", "newjeans"],
    "hiddenNewsIds": ["news-iu-album-001"]
  }
}
```

에러 예시:

```json
{
  "error": {
    "code": "UNAUTHORIZED_ANONYMOUS_USER",
    "message": "anonymous user id가 필요합니다."
  }
}
```

mock/local fallback 매칭:

- localStorage `followedArtistIds`
- localStorage `hiddenNewsIds`

### PATCH /me/preferences

목적: 팔로우 아티스트와 관심없음 처리 목록을 갱신합니다.

프론트 사용 위치:

- `OnboardingPage`: 아티스트 팔로우/해제
- `PreviewPage`: 관심없음
- `DetailPage`: 관심없음
- `MyPage`: 전체 데이터 초기화 시 추후 연결

요청 예시:

```http
PATCH /me/preferences
Content-Type: application/json
X-GOYO-Anonymous-Id: anon_01JABCDEF123

{
  "followedArtistIds": ["iu", "newjeans"],
  "hiddenNewsIds": ["news-iu-album-001"]
}
```

부분 갱신 예시:

```json
{
  "hiddenNewsIds": ["news-iu-album-001", "news-newjeans-ticket-001"]
}
```

응답 예시:

```json
{
  "preferences": {
    "followedArtistIds": ["iu", "newjeans"],
    "hiddenNewsIds": ["news-iu-album-001", "news-newjeans-ticket-001"]
  }
}
```

에러 예시:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "followedArtistIds는 문자열 배열이어야 합니다."
  }
}
```

mock/local fallback 매칭:

- localStorage setter로 기존 key를 유지합니다.

## 8. 홈 타임라인 구성 기준

홈 화면은 별도 aggregate API 없이 MVP에서 아래 데이터로 구성할 수 있습니다.

1. 팔로우 중인 아티스트: `GET /artists/:id` 여러 번 또는 추후 batch API
2. 오늘 가장 중요한 소식: `GET /news?artistIds=` 결과 중 날짜/타입/createdAt 기준 선택
3. 다가오는 일정: localStorage 또는 `GET /calendar/events`
4. 최신 소식: `GET /news?artistIds=` 결과를 `createdAt` 최신순 정렬

추후 추가할 수 있는 aggregate API:

```http
GET /home?artistIds=iu,newjeans
```

응답 예시:

```json
{
  "featuredNews": {},
  "upcomingEvents": [],
  "latestNews": [],
  "followedArtists": []
}
```

## 9. 프론트엔드 연결 우선순위

1. `VITE_API_BASE_URL` 연결 및 `GET /artists/search?q=` 검증
2. `GET /news?artistIds=` 연결로 Preview/Home 소식 교체
3. `GET /news/:id` 연결로 Detail Page 교체
4. `GET /artists/:id` 연결로 Home/My 팔로우 아티스트 정보 교체
5. preferences API로 `followedArtistIds`, `hiddenNewsIds` 서버 동기화
6. calendar API로 `calendarEvents` 서버 동기화

## 10. 백엔드 구현 우선순위

1. `GET /artists/search?q=`
2. `GET /artists/:id`
3. `GET /news?artistIds=`
4. `GET /news/:id`
5. `GET /news/today?artistIds=`
6. `GET /me/preferences`, `PATCH /me/preferences`
7. `GET /calendar/events`, `POST /calendar/events`, `DELETE /calendar/events/:id`

## 11. 나중에 추가할 기능

- 로그인 기반 사용자 계정 전환
- anonymous user를 실제 계정으로 migration
- 아티스트 batch 조회: `GET /artists?ids=iu,newjeans`
- 홈 aggregate API: `GET /home?artistIds=`
- 외부 캘린더 연동: Google Calendar, Apple Calendar ICS
- push notification: 티켓 오픈/공연 당일 알림
- 뉴스 출처 신뢰도/중복 뉴스 병합
- 서버 기반 관심없음 추천 품질 개선
