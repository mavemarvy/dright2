import { supabase } from '../supabase';

export interface AlgoliaSearchResult {
  hits: AlgoliaHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  processingTimeMS: number;
}

export interface AlgoliaHit {
  objectID: string;
  [key: string]: unknown;
}

export interface AlgoliaMultiSearchResult {
  results: AlgoliaSearchResult[];
}

export type AlgoliaIndexName =
  | 'products' | 'services' | 'jobs' | 'courses'
  | 'affiliates' | 'users' | 'categories'
  | 'marketplace_ads' | 'support_articles';

export async function searchAlgolia(
  indexName: AlgoliaIndexName,
  query: string,
  filters?: string,
  page = 0,
  hitsPerPage = 20,
  facets?: string[]
): Promise<AlgoliaSearchResult | null> {
  const { data, error } = await supabase.functions.invoke('algolia-sync', {
    body: { action: 'search', indexName, query, filters, page, hitsPerPage, facets },
  });
  if (error || !data?.success) return null;
  return {
    hits: data.hits || [],
    nbHits: data.nbHits || 0,
    page: data.page || 0,
    nbPages: data.nbPages || 0,
    hitsPerPage: data.hitsPerPage || hitsPerPage,
    processingTimeMS: data.processingTimeMS || 0,
  };
}

export async function multiSearchAlgolia(
  queries: Array<{ indexName: AlgoliaIndexName; query: string; filters?: string; hitsPerPage?: number }>
): Promise<AlgoliaMultiSearchResult | null> {
  const requests = queries.map((q) => ({
    indexName: q.indexName,
    query: q.query,
    params: q.filters ? `facetFilters=${encodeURIComponent(q.filters)}` : undefined,
    hitsPerPage: q.hitsPerPage || 5,
  }));

  const { data, error } = await supabase.functions.invoke('algolia-sync', {
    body: { action: 'multi-search', queries: requests },
  });
  if (error || !data?.success) return null;
  return { results: data.results || [] };
}

export async function syncRecordToAlgolia(
  tableName: string,
  recordId: string,
  record: Record<string, unknown>,
  operation: 'upsert' | 'delete' = 'upsert'
): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('algolia-sync', {
    body: { action: 'sync-record', tableName, recordId, record, operation },
  });
  return !error && data?.success;
}

export async function createAlgoliaIndex(indexName: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('algolia-sync', {
    body: { action: 'create-index', indexName },
  });
  return !error && data?.success;
}

export interface SearchSuggestion {
  text: string;
  type: string;
  indexName: AlgoliaIndexName;
}

export async function getSearchSuggestions(query: string): Promise<SearchSuggestion[]> {
  if (query.length < 2) return [];

  const result = await multiSearchAlgolia([
    { indexName: 'products', query, hitsPerPage: 3 },
    { indexName: 'services', query, hitsPerPage: 2 },
    { indexName: 'jobs', query, hitsPerPage: 2 },
    { indexName: 'categories', query, hitsPerPage: 3 },
  ]);

  if (!result) return [];

  const suggestions: SearchSuggestion[] = [];
  const indexNames: AlgoliaIndexName[] = ['products', 'services', 'jobs', 'categories'];

  result.results.forEach((searchResult, idx) => {
    const indexName = indexNames[idx];
    searchResult.hits.forEach((hit) => {
      suggestions.push({
        text: (hit.name || hit.title || hit.label || hit.objectID) as string,
        type: indexName,
        indexName,
      });
    });
  });

  return suggestions.slice(0, 10);
}
