import { supabase } from './supabase';

export type DirectGuestSaleSetting = {
  enabled: boolean;
  guest_access_days: number;
};

export async function getDirectGuestSaleSetting(
  entityType: 'product' | 'job',
  entityId: string,
): Promise<DirectGuestSaleSetting> {
  const { data, error } = await supabase.rpc('get_listing_direct_sale_setting', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) {
    console.warn('[direct-guest-sale] unable to load setting', error.message);
    return { enabled: false, guest_access_days: 10 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    enabled: Boolean(row?.enabled),
    guest_access_days: Math.max(1, Math.min(30, Number(row?.guest_access_days || 10))),
  };
}

export async function setDirectGuestSaleSetting(
  entityType: 'product' | 'job',
  entityId: string,
  enabled: boolean,
  guestAccessDays = 10,
) {
  const { data, error } = await supabase.rpc('set_listing_direct_sale_setting', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_enabled: enabled,
    p_guest_access_days: guestAccessDays,
  });
  if (error) throw error;
  return data;
}
