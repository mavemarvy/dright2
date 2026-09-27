import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const DEVICE_KEY = 'dright.native.device-id.v2';

function createFallbackId() {
  return [
    'dright-native-fallback',
    Platform.OS,
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2)
  ].join('-');
}

async function getOsIdentifier() {
  try {
    if (Platform.OS === 'android') {
      const id = Application.getAndroidId();
      return id ? 'dright-native-android-' + id : null;
    }
    if (Platform.OS === 'ios') {
      const id = await Application.getIosIdForVendorAsync();
      return id ? 'dright-native-ios-' + id : null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getNativeDeviceId() {
  const osId = await getOsIdentifier();
  if (osId) {
    await AsyncStorage.setItem(DEVICE_KEY, osId);
    return osId;
  }

  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = createFallbackId();
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function preflightSignupDevice() {
  const id = await getNativeDeviceId();
  const { data, error } = await supabase.rpc('preflight_signup_device', {
    p_device_id: id,
    p_fingerprint: 'native:' + Platform.OS + ':' + id
  });
  if (error) throw error;
  return data || { allowed: false, reason: 'device_check_failed' };
}

export async function claimCurrentDevice() {
  const id = await getNativeDeviceId();
  const { data, error } = await supabase.rpc('claim_current_device', {
    p_device_id: id,
    p_fingerprint: 'native:' + Platform.OS + ':' + id
  });
  if (error) throw error;
  return data || { allowed: false, reason: 'device_check_failed' };
}
