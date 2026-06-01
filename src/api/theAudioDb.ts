import type { Artist } from "../types";
import { ARTIST_IMAGE_PLACEHOLDER } from "../constants";

type TheAudioDbArtist = {
  idArtist?: string | null;
  strArtist?: string | null;
  strArtistThumb?: string | null;
  strArtistFanart?: string | null;
  strArtistLogo?: string | null;
  strGenre?: string | null;
  strBiographyEN?: string | null;
  strWebsite?: string | null;
};

type TheAudioDbSearchResponse = {
  artists?: TheAudioDbArtist[] | null;
};

function normalizeExternalUrl(url?: string | null) {
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  return `https://${trimmedUrl}`;
}

function toGenres(genre?: string | null) {
  const trimmedGenre = genre?.trim();
  return trimmedGenre ? [trimmedGenre] : [];
}

function getPreferredImageUrl(artist: TheAudioDbArtist) {
  return (
    artist.strArtistThumb?.trim() ||
    artist.strArtistFanart?.trim() ||
    artist.strArtistLogo?.trim() ||
    ARTIST_IMAGE_PLACEHOLDER
  );
}

function toArtist(artist: TheAudioDbArtist): Artist | null {
  if (!artist.idArtist || !artist.strArtist) {
    return null;
  }

  return {
    id: `theaudiodb-${artist.idArtist}`,
    name: artist.strArtist,
    imageUrl: getPreferredImageUrl(artist),
    genres: toGenres(artist.strGenre),
    source: "THEAUDIODB",
    description: artist.strBiographyEN?.trim() || undefined,
    externalUrl: normalizeExternalUrl(artist.strWebsite)
  };
}

export async function searchTheAudioDbArtists(query: string): Promise<Artist[]> {
  const keyword = query.trim();
  if (!keyword) {
    return [];
  }

  const response = await fetch(
    `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(keyword)}`
  );

  if (!response.ok) {
    throw new Error("Failed to search TheAudioDB artists.");
  }

  const data = (await response.json()) as TheAudioDbSearchResponse;

  if (import.meta.env.DEV) {
    console.log("[TheAudioDB] artist search response", data);
    console.log(
      "[TheAudioDB] artist image fields",
      (data.artists ?? []).map((artist) => ({
        idArtist: artist.idArtist,
        strArtist: artist.strArtist,
        strArtistThumb: artist.strArtistThumb,
        strArtistFanart: artist.strArtistFanart,
        strArtistLogo: artist.strArtistLogo
      }))
    );
  }

  return (data.artists ?? []).map(toArtist).filter((artist): artist is Artist => Boolean(artist));
}
