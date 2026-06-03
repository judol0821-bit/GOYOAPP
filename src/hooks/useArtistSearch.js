import { useEffect, useState } from 'react';
import { searchArtists } from '../api/artists.js';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

export default function useArtistSearch(query, options = {}) {
  const normalizedQuery = normalizeText(query);
  const includeAllWhenEmpty = Boolean(options.includeAllWhenEmpty);
  const [searchState, setSearchState] = useState({
    error: null,
    results: [],
    status: 'idle',
  });

  useEffect(() => {
    let isCancelled = false;

    if (!normalizedQuery && !includeAllWhenEmpty) {
      setSearchState({
        error: null,
        results: [],
        status: 'idle',
      });
      return undefined;
    }

    setSearchState((currentState) => ({
      ...currentState,
      error: null,
      status: 'loading',
    }));

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchArtists(normalizedQuery, { includeAllWhenEmpty });

        if (!isCancelled) {
          setSearchState({
            error: null,
            results,
            status: 'success',
          });
        }
      } catch {
        if (!isCancelled) {
          setSearchState({
            error: '검색 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
            results: [],
            status: 'error',
          });
        }
      }
    }, 120);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [includeAllWhenEmpty, normalizedQuery]);

  return {
    artists: searchState.results,
    error: searchState.error,
    hasQuery: Boolean(normalizedQuery),
    isLoading: searchState.status === 'loading',
  };
}
