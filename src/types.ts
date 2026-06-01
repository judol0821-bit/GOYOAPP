export type Artist = {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  source: "MOCK" | "SPOTIFY" | "THEAUDIODB";
  description?: string;
  externalUrl?: string;
  spotifyId?: string;
};

export type NewsCategory = "CONCERT" | "FESTIVAL" | "NEW_SONG" | "NEW_ALBUM";

export type CalendarEventType = "EVENT" | "TICKET_OPEN" | "RELEASE";

export type RemindBefore = "AT_TIME" | "10_MIN" | "1_HOUR" | "1_DAY";

export type MusicNews = {
  id: string;
  artistId: string;
  category: NewsCategory;
  title: string;
  subtitle: string;
  venue?: string;
  eventDate: string;
  ticketOpenDate?: string;
  ticketVendor?: string;
  description: string;
  imageUrl?: string;
  source?: "MANUAL" | "API";
  externalUrl?: string;
};

export type CalendarEvent = {
  id: string;
  musicNewsId: string;
  artistId: string;
  title: string;
  date: string;
  type: CalendarEventType;
  category: NewsCategory;
};

export type NotificationSetting = {
  eventId: string;
  remindBefore: RemindBefore;
};

export type NotificationSettings = Record<string, NotificationSetting>;
