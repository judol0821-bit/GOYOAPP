export type Artist = {
  id: string;
  name: string;
  genre: string;
  initials: string;
  color: string;
};

export type NewsCategory = "CONCERT" | "FESTIVAL" | "NEW SONG" | "NEW ALBUM" | "NOTICE";

export type MusicNews = {
  id: string;
  artistId: string;
  category: NewsCategory;
  title: string;
  subtitle: string;
  dateLabel: string;
  publishedAt: string;
  eventDate: string;
  heroColor: string;
  location?: string;
  infoRows: Array<{
    label: string;
    value: string;
  }>;
  body: string;
};
