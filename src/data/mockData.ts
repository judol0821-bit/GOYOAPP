import type { Artist, MusicNews } from "../types";

export const artists: Artist[] = [
  { id: "dean", name: "딘", genre: "R&B / Soul", initials: "D", color: "#d9d9d9" },
  { id: "crush", name: "크러쉬", genre: "R&B", initials: "C", color: "#e4e4e4" },
  { id: "hanroro", name: "한로로", genre: "Indie Rock", initials: "H", color: "#dcdcdc" },
  { id: "silicagel", name: "실리카겔", genre: "Band", initials: "S", color: "#dedede" },
  { id: "iu", name: "아이유", genre: "Pop", initials: "IU", color: "#e8e8e8" },
  { id: "blackskirts", name: "검정치마", genre: "Indie Pop", initials: "B", color: "#ededed" },
  { id: "wave", name: "wave to earth", genre: "Alternative", initials: "W", color: "#e1e1e1" },
  { id: "yerin", name: "백예린", genre: "Pop / R&B", initials: "Y", color: "#e6e6e6" }
];

export const musicNews: MusicNews[] = [
  {
    id: "seoul-park-festival",
    artistId: "silicagel",
    category: "FESTIVAL",
    title: "2026 서울 파크 뮤직 페스티벌",
    subtitle: "티켓 예매 오픈 안내",
    dateLabel: "오늘",
    publishedAt: "2026-05-27T09:00:00+09:00",
    eventDate: "2026-06-20",
    heroColor: "#e9e9ee",
    location: "올림픽공원 88잔디마당",
    infoRows: [
      { label: "공연 일시", value: "2026.06.20 - 06.21" },
      { label: "예매 시작", value: "2026.05.30 20:00" },
      { label: "예매처", value: "멜론티켓" }
    ],
    body: "실리카겔이 서울 파크 뮤직 페스티벌 라인업에 합류합니다. 조용히 음악을 따라가던 팬들도 편하게 확인할 수 있도록 예매 일정과 장소 정보를 정리했습니다."
  },
  {
    id: "dean-crush-single",
    artistId: "dean",
    category: "NEW SONG",
    title: "앤더슨 팩 X 딘 콜라보 송 발매",
    subtitle: "콜라보 싱글 발매 소식",
    dateLabel: "어제",
    publishedAt: "2026-05-26T18:00:00+09:00",
    eventDate: "2026-05-26",
    heroColor: "#ececef",
    infoRows: [
      { label: "발매 일시", value: "2026.05.26 18:00" },
      { label: "트랙", value: "Blue Hour" },
      { label: "형식", value: "Digital Single" }
    ],
    body: "딘의 새 콜라보 싱글이 공개되었습니다. 부드러운 그루브와 낮게 번지는 보컬이 중심인 트랙으로, 주요 음원 플랫폼에서 감상할 수 있습니다."
  },
  {
    id: "hanroro-album",
    artistId: "hanroro",
    category: "NEW ALBUM",
    title: "POV 첫 커플 앨범 발매",
    subtitle: "새 커플 앨범 발매 소식",
    dateLabel: "어제",
    publishedAt: "2026-05-26T10:30:00+09:00",
    eventDate: "2026-05-26",
    heroColor: "#eeeeee",
    infoRows: [
      { label: "발매 일시", value: "2026.05.26 12:00" },
      { label: "수록곡", value: "총 7곡" },
      { label: "타이틀", value: "느린 편지" }
    ],
    body: "한로로의 감정선이 또렷하게 담긴 새 앨범이 발매되었습니다. 앨범 소개, 트랙리스트, 발매 일정만 담백하게 확인할 수 있습니다."
  },
  {
    id: "crush-showcase",
    artistId: "crush",
    category: "CONCERT",
    title: "크러쉬 소극장 라이브 개최",
    subtitle: "서울 단독 공연 안내",
    dateLabel: "2일 전",
    publishedAt: "2026-05-25T15:00:00+09:00",
    eventDate: "2026-07-04",
    heroColor: "#e8e8ec",
    location: "블루스퀘어 마스터카드홀",
    infoRows: [
      { label: "공연 일시", value: "2026.07.04 19:00" },
      { label: "예매 시작", value: "2026.06.01 20:00" },
      { label: "예매처", value: "인터파크 티켓" }
    ],
    body: "크러쉬가 가까운 거리에서 관객과 만나는 소극장 라이브를 엽니다. 공연 일정과 예매 시작 시간을 놓치지 않도록 확인해보세요."
  },
  {
    id: "iu-encore",
    artistId: "iu",
    category: "CONCERT",
    title: "아이유 'HEREH' 앙코르",
    subtitle: "서울 월드컵 경기장",
    dateLabel: "3일 전",
    publishedAt: "2026-05-24T12:00:00+09:00",
    eventDate: "2026-09-21",
    heroColor: "#e6e6eb",
    location: "서울 월드컵 경기장",
    infoRows: [
      { label: "공연 일시", value: "2026.09.21 - 09.22" },
      { label: "예매 시작", value: "2026.08.12 20:00" },
      { label: "예매처", value: "멜론티켓" }
    ],
    body: "아이유의 월드 투어 대장정을 마무리하는 앙코르 공연이 서울 월드컵 경기장에서 개최됩니다. 팬 여러분의 많은 관심 부탁드립니다."
  },
  {
    id: "yerin-notice",
    artistId: "yerin",
    category: "NOTICE",
    title: "백예린 라이브 클립 공개",
    subtitle: "공식 채널 업데이트",
    dateLabel: "4일 전",
    publishedAt: "2026-05-23T21:00:00+09:00",
    eventDate: "2026-05-23",
    heroColor: "#ededf2",
    infoRows: [
      { label: "공개 일시", value: "2026.05.23 21:00" },
      { label: "콘텐츠", value: "Live Clip" },
      { label: "채널", value: "공식 채널" }
    ],
    body: "백예린의 새 라이브 클립이 공개되었습니다. SNS를 확인하지 않아도 최근 업로드 소식을 GOYO에서 조용히 모아볼 수 있습니다."
  }
];
