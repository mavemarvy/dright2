import { supabase } from './supabase';

export interface FilterState {
  searchQuery: string;
  categoryFilter: string;
  sortBy: string;
  locationFilter: string;
  priceMin: string;
  priceMax: string;
  dateFilter: string;
}

export interface SavedFilterConfig extends FilterState {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  searchQuery: '',
  categoryFilter: 'All',
  sortBy: 'newest',
  locationFilter: '',
  priceMin: '',
  priceMax: '',
  dateFilter: 'all',
};

export const EMPTY_FILTER_STATE: FilterState = {
  searchQuery: '',
  categoryFilter: '',
  sortBy: '',
  locationFilter: '',
  priceMin: '',
  priceMax: '',
  dateFilter: '',
};

export async function fetchSavedConfigs(userId: string): Promise<SavedFilterConfig[]> {
  const { data, error } = await supabase
    .from('saved_filters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as SavedFilterConfig[];
}

export async function saveConfig(
  userId: string,
  name: string,
  state: FilterState
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
    })
    .select()
    .single();

  if (error) throw error;
  return data as SavedFilterConfig;
}

export async function updateConfig(
  configId: string,
  state: FilterState
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
