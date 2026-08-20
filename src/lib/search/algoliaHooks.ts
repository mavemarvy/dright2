import { useState, useCallback, useEffect } from 'react';
import { searchAlgolia, multiSearchAlgolia, getSearchSuggestions, syncRecordToAlgolia, type AlgoliaSearchResult, type AlgoliaIndexName, type SearchSuggestion } from './algoliaService';

export function useAlgoliaSearch(indexName: AlgoliaIndexName, initialQuery = '', debounceMs = 300) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<AlgoliaSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(0);

  const search = useCallback(async (q: string, f?: string, p?: number) => {
    if (q.length < 2) { setResults(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await searchAlgolia(indexName, q, f, p || 0, 20);
      if (!res) { setError('Search failed'); return; }
      setResults(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search error');
    } finally {
      setLoading(false);
    }
  }, [indexName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) search(query, filters, page);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, filters, page, debounceMs, search]);

  return { query, setQuery, results, loading, error, filters, setFilters, page, setPage, search };
}

export function useAlgoliaSuggestions(query: string, debounceMs = 300) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const data = await getSearchSuggestions(query);
      setSuggestions(data);
      setLoading(false);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  return { suggestions, loading };
}

export function useAlgoliaSync() {
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async (tableName: string, recordId: string, record: Record<string, unknown>, operation: 'upsert' | 'delete' = 'upsert') => {
    setSyncing(true);
    const ok = await syncRecordToAlgolia(tableName, recordId, record, operation);
    setSyncing(false);
    return ok;
  }, []);

  return { syncing, sync };
}

export function useAlgoliaMultiSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (queries: Array<{ indexName: AlgoliaIndexName; query: string; filters?: string; hitsPerPage?: number }>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await multiSearchAlgolia(queries);
      if (!result) setError('Search failed');
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, search, setError };
}
