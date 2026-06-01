import type { CalendarEvent, MusicNews } from "../types";

export const musicNews: MusicNews[] = [
  {
    id: "seoul-park-festival",
    artistId: "silicagel",
    category: "FESTIVAL",
    title: "2026 서울 파크 뮤직 페스티벌",
    subtitle: "티켓 예매 오픈 안내",
    venue: "올림픽공원 88잔디마당",
    eventDate: "2026-06-20T18:00:00+09:00",
    ticketOpenDate: "2026-05-30T20:00:00+09:00",
    ticketVendor: "멜론티켓",
    description:
      "실리카겔이 서울 파크 뮤직 페스티벌 라인업에 합류합니다. 조용히 음악을 따라가던 팬들도 편하게 확인할 수 있도록 예매 일정과 장소 정보를 정리했습니다.",
    source: "MANUAL"
  },
  {
    id: "dean-crush-single",
    artistId: "dean",
    category: "NEW_SONG",
    title: "앤더슨 팩 X 딘 콜라보 송 발매",
    subtitle: "콜라보 싱글 발매 소식",
    eventDate: "2026-05-26T18:00:00+09:00",
    description:
      "딘의 새 콜라보 싱글이 공개되었습니다. 부드러운 그루브와 낮게 번지는 보컬이 중심인 트랙으로, 주요 음원 플랫폼에서 감상할 수 있습니다.",
    source: "MANUAL"
  },
  {
    id: "hanroro-album",
    artistId: "hanroro",
    category: "NEW_ALBUM",
    title: "POV 첫 커플 앨범 발매",
    subtitle: "새 커플 앨범 발매 소식",
    eventDate: "2026-05-26T12:00:00+09:00",
    description:
      "한로로의 감정선이 또렷하게 담긴 새 앨범이 발매되었습니다. 앨범 소개, 트랙리스트, 발매 일정만 담백하게 확인할 수 있습니다.",
    source: "MANUAL"
  },
  {
    id: "crush-showcase",
    artistId: "crush",
    category: "CONCERT",
    title: "크러쉬 소극장 라이브 개최",
    subtitle: "서울 단독 공연 안내",
    venue: "블루스퀘어 마스터카드홀",
    eventDate: "2026-07-04T19:00:00+09:00",
    ticketOpenDate: "2026-06-01T20:00:00+09:00",
    ticketVendor: "인터파크 티켓",
    description:
      "크러쉬가 가까운 거리에서 관객과 만나는 소극장 라이브를 엽니다. 공연 일정과 예매 시작 시간을 놓치지 않도록 확인해보세요.",
    source: "MANUAL"
  },
  {
    id: "iu-encore",
    artistId: "iu",
    category: "CONCERT",
    title: "아이유 'HEREH' 앙코르",
    subtitle: "서울 월드컵 경기장",
    venue: "서울 월드컵 경기장",
    eventDate: "2026-09-21T19:00:00+09:00",
    ticketOpenDate: "2026-08-12T20:00:00+09:00",
    ticketVendor: "멜론티켓",
    description:
      "아이유의 월드 투어 대장정을 마무리하는 앙코르 공연이 서울 월드컵 경기장에서 개최됩니다. 팬 여러분의 많은 관심 부탁드립니다.",
    source: "MANUAL"
  },
  {
    id: "yerin-live-clip",
    artistId: "yerin",
    category: "NEW_SONG",
    title: "백예린 라이브 클립 공개",
    subtitle: "공식 채널 업데이트",
    eventDate: "2026-05-23T21:00:00+09:00",
    description:
      "백예린의 새 라이브 클립이 공개되었습니다. SNS를 확인하지 않아도 최근 업로드 소식을 GOYO에서 조용히 모아볼 수 있습니다.",
    source: "MANUAL"
  }
];

function isValidDateText(dateText?: string): dateText is string {
  return Boolean(dateText && !Number.isNaN(new Date(dateText).getTime()));
}

function getPrimaryCalendarEventType(category: MusicNews["category"]): CalendarEvent["type"] {
  if (category === "CONCERT" || category === "FESTIVAL") {
    return "EVENT";
  }

  return "RELEASE";
}

export function createCalendarEvents(newsItems: MusicNews[]): CalendarEvent[] {
  return newsItems.flatMap((news) => {
    const events: CalendarEvent[] = [];
    const primaryType = getPrimaryCalendarEventType(news.category);

    if (isValidDateText(news.eventDate)) {
      events.push({
        id: `${news.id}-${primaryType.toLowerCase()}`,
        musicNewsId: news.id,
        artistId: news.artistId,
        title: news.title,
        date: news.eventDate,
        type: primaryType,
        category: news.category
      });
    }

    const ticketOpenDate = news.ticketOpenDate;
    if (isValidDateText(ticketOpenDate)) {
      events.push({
        id: `${news.id}-ticket-open`,
        musicNewsId: news.id,
        artistId: news.artistId,
        title: news.title,
        date: ticketOpenDate,
        type: "TICKET_OPEN",
        category: news.category
      });
    }

    return events;
  });
}
