import { supabase } from './supabase';

export interface FilterState {
  searchQuery: string;
  categoryFilter: string;
  sortBy: string;
  locationFilter: string;
  priceMin: string;
  priceMax: string;
  dateFilter: string;
  extendedFilters?: Record<string, unknown>;
}

export interface SavedFilterConfig extends FilterState {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface SavedFilterRow {
  id: string;
  user_id: string;
  name: string;
  search_query: string | null;
  category_filter: string | null;
  sort_by: string | null;
  location_filter: string | null;
  price_min: string | null;
  price_max: string | null;
  date_filter: string | null;
  extended_filters: Record<string, unknown> | null;
  is_default: boolean | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  searchQuery: '',
  categoryFilter: 'All',
  sortBy: 'recommended',
  locationFilter: '',
  priceMin: '',
  priceMax: '',
  dateFilter: 'all',
  extendedFilters: {},
};

export const EMPTY_FILTER_STATE: FilterState = {
  searchQuery: '',
  categoryFilter: 'All',
  sortBy: 'recommended',
  locationFilter: '',
  priceMin: '',
  priceMax: '',
  dateFilter: 'all',
  extendedFilters: {},
};

function mapSavedFilter(row: SavedFilterRow): SavedFilterConfig {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    searchQuery: row.search_query || '',
    categoryFilter: row.category_filter || 'All',
    sortBy: row.sort_by || 'recommended',
    locationFilter: row.location_filter || '',
    priceMin: row.price_min || '',
    priceMax: row.price_max || '',
    dateFilter: row.date_filter || 'all',
    extendedFilters: row.extended_filters && typeof row.extended_filters === 'object'
      ? row.extended_filters
      : {},
    is_default: row.is_default === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchSavedConfigs(userId: string): Promise<SavedFilterConfig[]> {
  const { data, error } = await supabase
    .from('saved_filters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data || []) as SavedFilterRow[]).map(mapSavedFilter);
}

export async function saveConfig(
  userId: string,
  name: string,
  state: FilterState,
): Promise<SavedFilterConfig> {
  const { data, error } = await supabase
    .from('saved_filters')
    .insert({
      user_id: userId,
      name,
      search_query: state.searchQuery,
      category_filter: state.categoryFilter,
      sort_by: state.sortBy,
      location_filter: state.locationFilter,
      price_min: state.priceMin,
      price_max: state.priceMax,
      date_filter: state.dateFilter,
      extended_filters: state.extendedFilters ?? {},
    })
    .select()
    .single();

  if (error) throw error;
  return mapSavedFilter(data as SavedFilterRow);
}

export async function updateConfig(
  configId: string,
  state: FilterState,
): Promise<void> {
  const { error } = await supabase
    .from('saved_filters')
    .update({
      search_query: state.searchQuery,
      category_filter: state.categoryFilter,
      sort_by: state.sortBy,
      location_filter: state.locationFilter,
      price_min: state.priceMin,
      price_max: state.priceMax,
      date_filter: state.dateFilter,
      extended_filters: state.extendedFilters ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', configId);

  if (error) throw error;
}

export async function deleteConfig(configId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_filters')
    .delete()
    .eq('id', configId);

  if (error) throw error;
}
