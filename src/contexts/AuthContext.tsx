import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getAffiliateCookie, resolveReferrer } from '../lib/affiliate';
import { emitEvent } from '../lib/notificationEvents';
import type { StoreTheme } from '../lib/storeThemes';
import { logger, ErrorCategory } from '../lib/logger';
import { getDeviceFingerprint, getBrowserName, getRedirectPath } from '../lib/authSecurity';

export type AdminRole =
  | 'super_admin' | 'platform_admin' | 'user_management_admin' | 'marketplace_admin' | 'marketplace_moderator'
  | 'finance_admin' | 'finance_manager' | 'payment_admin' | 'affiliate_admin' | 'affiliate_manager'
  | 'referral_admin' | 'sales_marketing_admin' | 'marketing_manager' | 'advertising_admin' | 'customer_support'
  | 'customer_success' | 'trust_safety_admin' | 'fraud_risk_admin' | 'security_admin' | 'security_manager'
  | 'content_cms_admin' | 'content_manager' | 'badge_trust_admin' | 'ai_admin' | 'ai_support_manager'
  | 'analytics_admin' | 'analytics_manager' | 'sales_team_manager' | 'campaign_manager' | 'campaign_moderator'
  | 'notification_admin' | 'localization_admin' | 'technical_admin' | 'system_config_admin' | 'support_admin'
  | 'qa_admin' | 'marketplace_manager' | 'vendor_manager' | 'product_moderator' | 'service_moderator'
  | 'job_moderator' | 'promotions_manager' | 'legal_manager';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin', platform_admin: 'Platform Admin', user_management_admin: 'User Management',
  marketplace_admin: 'Marketplace Admin', marketplace_moderator: 'Marketplace Moderator', finance_admin: 'Finance Admin',
  finance_manager: 'Finance Manager', payment_admin: 'Payment Admin', affiliate_admin: 'Affiliate Admin',
  affiliate_manager: 'Affiliate Manager', referral_admin: 'Referral Admin', sales_marketing_admin: 'Sales & Marketing',
  marketing_manager: 'Marketing Manager', advertising_admin: 'Advertising Admin', customer_support: 'Customer Support',
  customer_success: 'Customer Success', trust_safety_admin: 'Trust & Safety', fraud_risk_admin: 'Fraud & Risk',
  security_admin: 'Security Admin', security_manager: 'Security Manager', content_cms_admin: 'Content & CMS',
  content_manager: 'Content Manager', badge_trust_admin: 'Badge & Trust', ai_admin: 'AI Admin',
  ai_support_manager: 'AI Support Manager', analytics_admin: 'Analytics Admin', analytics_manager: 'Analytics Manager',
  sales_team_manager: 'Sales Team Manager', campaign_manager: 'Campaign Manager', campaign_moderator: 'Campaign Moderator',
  notification_admin: 'Notification Admin', localization_admin: 'Localization Admin', technical_admin: 'Technical Admin',
  system_config_admin: 'System Config', support_admin: 'Support Admin', qa_admin: 'Quality Assurance',
  marketplace_manager: 'Marketplace Manager', vendor_manager: 'Vendor Manager', product_moderator: 'Product Moderator',
  service_moderator: 'Service Moderator', job_moderator: 'Job Moderator', promotions_manager: 'Promotions Manager',
  legal_manager: 'Legal Manager',
};

interface AuthContextType {
  user: User | null; session: Session | null; loading: boolean; profile: Profile | null;
  isAdmin: boolean; adminRole: AdminRole | null; isAccountLocked: boolean; isAccountBanned: boolean;
  isEmailVerified: boolean; sessionExpired: boolean; clearSessionExpired: () => void;
  signUp: (email: string, password: string, fullName: string, phone?: string, asAdmin?: boolean, location?: string, preferredCurrency?: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null; locked?: boolean; lockoutRemaining?: number }>;
  signInWithPhone: (phone: string) => Promise<{ error: AuthError | null; mockOtp?: string }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>; signOutAllDevices: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>;
  refreshProfile: () => Promise<void>; resendVerificationEmail: () => Promise<{ error: AuthError | null }>;
}

interface Profile {
  id: string; email: string; phone: string | null; full_name: string | null; account_number: string | null; role: string;
  is_admin: boolean; admin_status: string; admin_role: AdminRole | null; account_status: 'ACTIVE' | 'LOCKED' | 'BANNED';
  is_verified: boolean; balance: number; marketer_level: number; advertiser_grade: string | null; weekly_sales_count: number;
  total_sales_count: number; consecutive_weeks_streak: number; social_media_links: string[] | null; marketer_status: string;
  advertiser_status: string; locked_balance: number; available_balance: number; downgraded_at: string | null;
  last_weekly_reset_at: string | null; referral_code: string | null; referred_by: string | null; affiliate_earnings: number;
  total_reviews: number; average_rating: number; one_star_count: number; account_locks_count: number; avatar_url: string | null;
  location: string | null; preferred_currency: string; location_verified: boolean; store_title: string | null;
  store_banner_url: string | null; store_description: string | null; store_theme: StoreTheme | null; store_location: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateUsername(email: string, userId: string): string {
  const local = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 18) || 'user';
  return `${local}_${userId.replace(/-/g, '').slice(0, 8)}`.slice(0, 30);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true); const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const isAdmin = profile?.is_admin === true && profile?.admin_status === 'active';
  const adminRole = (profile?.admin_role as AdminRole | null) ?? (isAdmin ? 'super_admin' : null);
  const isAccountLocked = profile?.account_status === 'LOCKED'; const isAccountBanned = profile?.account_status === 'BANNED';
  const isEmailVerified = !!user?.email_confirmed_at || !!user?.user_metadata?.email_verified;
  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const logAuthActivity = useCallback(async (eventType: string, success = true, reason?: string) => {
    try {
      await supabase.rpc('log_auth_activity', { p_event_type: eventType, p_success: success, p_reason: reason ?? null,
        p_user_agent: navigator.userAgent, p_device_fingerprint: getDeviceFingerprint() });
    } catch { /* non-critical */ }
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (!error && data) setProfile({ ...data, is_admin: data.is_admin ?? false, admin_status: data.admin_status ?? 'active', balance: data.balance ?? 0 } as Profile);
    setLoading(false);
  };

  const createMissingProfile = async (authUser: User) => {
    if (!authUser.email) return;
    const { data: existing } = await supabase.from('users').select('id').eq('id', authUser.id).maybeSingle();
    if (existing) return;

    const email = authUser.email.trim().toLowerCase();
    const fullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || null;
    const { error } = await supabase.from('users').insert({
      id: authUser.id,
      email,
      full_name: fullName,
      phone: authUser.phone || null,
      role: 'user',
      is_admin: false,
      admin_status: 'active',
      balance: 0,
      referral_code: generateReferralCode(),
      preferred_currency: 'USD',
      username: generateUsername(email, authUser.id),
    });
    if (error) {
      console.error('Error repairing missing profile:', error);
      return;
    }
    await fetchProfile(authUser.id);
  };

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession(); setSession(session); setUser(session?.user ?? null);
      if (session?.user) { await fetchProfile(session.user.id); } else setLoading(false);
    };
    getSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        setSession(session); setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
          if (event === 'SIGNED_IN') {
            await createMissingProfile(session.user);
            await logAuthActivity('login', true);
            await supabase.rpc('reset_login_attempts', { p_email: session.user.email || '' });
            try { await emitEvent({ module: 'security', eventType: 'new_login', recipientIds: session.user.id, metadata: { device: getBrowserName(), location: 'unknown' } }); } catch { /* non-critical */ }
          } else if (event === 'TOKEN_REFRESHED') await logAuthActivity('session_refresh', true);
        } else {
          if (event === 'SIGNED_OUT') await logAuthActivity('logout', true); setProfile(null); setLoading(false);
        }
      })();
    });
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sb-access-token' || e.key === 'sb-refresh-token') supabase.auth.getSession().then(({ data: { session: newSession } }) => {
        setSession(newSession); setUser(newSession?.user ?? null); if (!newSession) { setProfile(null); setSessionExpired(true); }
      });
    };
    window.addEventListener('storage', handleStorageChange);
    const sessionCheck = setInterval(async () => { const { data: { session: currentSession } } = await supabase.auth.getSession(); if (!currentSession && user) setSessionExpired(true); }, 60000);
    return () => { subscription.unsubscribe(); window.removeEventListener('storage', handleStorageChange); clearInterval(sessionCheck); };
  }, []);

  const createProfileAndReferralLink = async (userId: string, email: string, fullName?: string, phone?: string, asAdmin?: boolean,
    referredBy?: string | null, location?: string, preferredCurrency?: string) => {
    let shouldBeAdmin = false; let adminStatus = 'active'; let adminRoleValue: AdminRole | null = null;
    if (asAdmin) {
      const { data: existingAdmins } = await supabase.from('users').select('id').eq('is_admin', true).limit(1);
      if (!existingAdmins || existingAdmins.length === 0) { shouldBeAdmin = true; adminStatus = 'active'; adminRoleValue = 'super_admin'; }
      else { shouldBeAdmin = true; adminStatus = 'pending'; adminRoleValue = null; }
    }
    const normalizedEmail = email.trim().toLowerCase();
    const { error: profileError } = await supabase.from('users').insert({
      id: userId, email: normalizedEmail, full_name: fullName || null, phone: phone || null,
      role: shouldBeAdmin ? 'admin' : 'affiliate', is_admin: shouldBeAdmin, admin_status: adminStatus,
      admin_role: adminRoleValue, balance: 0, referral_code: generateReferralCode(), referred_by: referredBy || null,
      location: location || null, preferred_currency: preferredCurrency || 'USD', username: generateUsername(normalizedEmail, userId),
    });
    if (profileError) { console.error('Error creating profile:', profileError); return { error: profileError }; }
    if (!shouldBeAdmin || adminStatus === 'pending') {
      const refCode = generateReferralCode(); const { error: referralError } = await supabase.from('referral_links').insert({ user_id: userId, unique_code: refCode });
      if (referralError) console.error('Error creating referral link:', referralError);
    }
    if (referredBy) {
      await supabase.rpc('increment_referral_conversions', { p_referrer_id: referredBy });
      const refCode = getAffiliateCookie();
      if (refCode) await supabase.from('referrals').insert({ referrer_id: referredBy, referred_user_id: userId, referral_code: refCode, is_successful: true });
      const { data: newUserData } = await supabase.from('users').select('full_name, email').eq('id', userId).maybeSingle();
      const referrerName = newUserData?.full_name || newUserData?.email || 'Someone';
      await emitEvent({ module: 'referral', eventType: 'referral_joined', recipientIds: referredBy, actorId: userId, metadata: { referralName: referrerName } });
    }
    return { error: null, isAdminPending: adminStatus === 'pending', isFirstAdmin: shouldBeAdmin && adminStatus === 'active' };
  };

  const signUp = async (email: string, password: string, fullName: string, phone?: string, asAdmin?: boolean, location?: string, preferredCurrency?: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password, options: { data: { full_name: fullName, wants_admin: asAdmin || false } } });
    if (!error && data.user) {
      const refCode = getAffiliateCookie(); let referredBy: string | null = null;
      if (refCode) { const referrer = await resolveReferrer(refCode); if (referrer) referredBy = referrer.id; }
      const result = await createProfileAndReferralLink(data.user.id, normalizedEmail, fullName, phone, asAdmin, referredBy, location, preferredCurrency);
      if (result.error) return { error: result.error as unknown as AuthError };
    }
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const { data: lockData } = await supabase.from('login_attempts').select('attempt_count, locked_until').eq('email', normalizedEmail).maybeSingle();
      if (lockData?.locked_until) { const lockDate = new Date(lockData.locked_until); if (lockDate > new Date()) { const remaining = Math.ceil((lockDate.getTime() - Date.now()) / 1000); return { error: { message: `Account temporarily locked. Try again in ${Math.ceil(remaining / 60)} minute(s).`, name: 'LockedOut' } as AuthError, locked: true, lockoutRemaining: remaining }; } }
    } catch { /* non-critical */ }
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) {
      try { await supabase.rpc('record_login_attempt', { p_email: normalizedEmail, p_success: false, p_user_agent: navigator.userAgent }); } catch { /* non-critical */ }
      await logAuthActivity('failed_login', false, error.message);
      logger.warn(ErrorCategory.AUTH, 'Failed login attempt', { email: normalizedEmail, error: error.message });
      return { error };
    }
    if (data.user) await createMissingProfile(data.user);
    try { await supabase.rpc('record_login_attempt', { p_email: normalizedEmail, p_success: true, p_user_agent: navigator.userAgent }); } catch { /* non-critical */ }
    const redirect = getRedirectPath(); if (redirect) { /* consumed by sign-in page */ }
    return { error: null };
  };

  const signInWithPhone = async (phone: string) => {
    const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[MOCK SMS] OTP for ${phone}: ${mockOtp}`); console.log(`[MOCK SMS] Use this code to verify: ${mockOtp}`);
    sessionStorage.setItem(`mock_otp_${phone}`, mockOtp); return { error: null, mockOtp };
  };

  const verifyOtp = async (phone: string, token: string) => {
    const storedOtp = sessionStorage.getItem(`mock_otp_${phone}`); if (storedOtp !== token) return { error: { message: 'Invalid OTP', name: 'AuthError' } as AuthError };
    sessionStorage.removeItem(`mock_otp_${phone}`); return { error: null };
  };

  const signOut = async () => { await supabase.auth.signOut(); setUser(null); setSession(null); setProfile(null); };
  const signOutAllDevices = async () => { const { error } = await supabase.auth.signOut({ scope: 'global' }); return { error }; };
  const resetPassword = async (email: string) => { const normalizedEmail = email.trim().toLowerCase(); const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${window.location.origin}/reset-password` }); return { error }; };
  const updatePassword = async (newPassword: string) => { const { error } = await supabase.auth.updateUser({ password: newPassword }); return { error }; };
  const refreshProfile = async () => { if (user) await fetchProfile(user.id); };
  const resendVerificationEmail = async () => { if (!user?.email) return { error: null }; const { error } = await supabase.auth.resend({ type: 'signup', email: user.email }); return { error }; };

  return <AuthContext.Provider value={{ user, session, loading, profile, isAdmin, adminRole, isAccountLocked, isAccountBanned, isEmailVerified, sessionExpired, clearSessionExpired, signUp, signIn, signInWithPhone, verifyOtp, signOut, signOutAllDevices, resetPassword, updatePassword, refreshProfile, resendVerificationEmail }}>{children}</AuthContext.Provider>;
}

export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; }
