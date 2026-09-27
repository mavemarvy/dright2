import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { supabase, supabaseConfigured } from './src/lib/supabase';
import { claimCurrentDevice } from './src/lib/device';
import { canAccessModule } from './src/lib/permissions';

const PRIMARY = '#1e40af';
const NAVY = '#0f172a';
const BG = '#f8fafc';
const BORDER = '#e5e7eb';
const MUTED = '#64748b';

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return (currency || 'USD') + ' ' + amount.toFixed(2);
  }
}

function dateTime(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString(); } catch { return ''; }
}

function maskAccount(value) {
  const raw = String(value || '');
  if (raw.length <= 4) return raw || '—';
  return '••••••' + raw.slice(-4);
}

async function getAdminProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id,email,full_name,username,avatar_url,is_admin,admin_status,admin_role,account_status,is_verified,preferred_currency,rbac_role_id,agreement_accepted,admin_verification_status')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function ConfigRequired() {
  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.brand}>DRIGHT ADMIN</Text>
      <Text style={styles.title}>Mobile configuration required</Text>
      <Text style={styles.help}>
        Copy .env.example to .env and set the DRIGHT2 publishable Supabase key.
      </Text>
    </SafeAreaView>
  );
}

function LoginScreen({ notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter the administrator email and password.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      if (error) throw error;
    } catch (error) {
      Alert.alert('DRIGHT Admin', error?.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.loginWrap}>
      <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled">
        <View style={styles.adminMark}><Text style={styles.adminMarkText}>DA</Text></View>
        <Text style={styles.brand}>DRIGHT ADMIN</Text>
        <Text style={styles.loginSub}>Authorized DRIGHT staff only</Text>

        {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Admin email"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
        />

        <Pressable onPress={signIn} disabled={busy} style={[styles.primaryButton, busy && styles.disabled]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Sign in to Admin</Text>}
        </Pressable>

        <Text style={styles.securityText}>
          There is no public admin signup in this application. Admin access is verified from DRIGHT2 after authentication.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Header({ profile, title }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerEyebrow}>DRIGHT ADMIN</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(profile?.full_name || profile?.email || 'A').charAt(0).toUpperCase()}</Text>
      </View>
    </View>
  );
}

async function safeCount(queryPromise) {
  try {
    const result = await queryPromise;
    if (result.error) return null;
    return result.count || 0;
  } catch {
    return null;
  }
}

function DashboardScreen({ profile }) {
  const [stats, setStats] = useState({ users: null, listings: null, withdrawals: null, tickets: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const role = profile?.admin_role;
    const usersPromise = safeCount(supabase.from('users').select('*', { count: 'exact', head: true }));

    const listingsPromise = canAccessModule(role, 'listings')
      ? safeCount(
          supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .neq('approval_status', 'approved')
            .neq('approval_status', 'removed')
        )
      : Promise.resolve(null);

    const withdrawalsPromise = canAccessModule(role, 'withdrawals')
      ? safeCount(
          supabase
            .from('withdrawal_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'queued')
        )
      : Promise.resolve(null);

    const ticketsPromise = canAccessModule(role, 'support')
      ? safeCount(
          supabase
            .from('support_tickets')
            .select('*', { count: 'exact', head: true })
            .neq('status', 'closed')
        )
      : Promise.resolve(null);

    const [users, listings, withdrawals, tickets] = await Promise.all([
      usersPromise, listingsPromise, withdrawalsPromise, ticketsPromise
    ]);

    setStats({ users, listings, withdrawals, tickets });
    setLoading(false);
  }, [profile?.admin_role]);

  useEffect(() => { void load(); }, [load]);

  const cards = [
    ['Users', stats.users],
    ['Listing review', stats.listings],
    ['Queued withdrawals', stats.withdrawals],
    ['Open support', stats.tickets]
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Header profile={profile} title="Dashboard" />
      <View style={styles.adminHero}>
        <Text style={styles.adminHeroLabel}>Signed in as</Text>
        <Text style={styles.adminHeroName}>{profile?.full_name || profile?.email}</Text>
        <Text style={styles.adminHeroRole}>{String(profile?.admin_role || 'admin').replaceAll('_', ' ')}</Text>
      </View>
      <View style={styles.grid}>
        {cards.map(([label, value]) => (
          <View key={label} style={styles.statCard}>
            <Text style={styles.statValue}>{value === null ? '—' : value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
            {value === null ? <Text style={styles.restrictedMini}>Restricted/not assigned</Text> : null}
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Security boundary</Text>
        <Text style={styles.bodyText}>
          This app uses the same DRIGHT2 database as the customer app, but every query still passes through Supabase RLS and existing DRIGHT RBAC.
        </Text>
      </View>
    </ScrollView>
  );
}

function Restricted({ label }) {
  return (
    <View style={styles.restricted}>
      <Text style={styles.restrictedTitle}>Not assigned to your admin role</Text>
      <Text style={styles.bodyText}>{label} is hidden in this admin app for your current role.</Text>
    </View>
  );
}

function ListingsScreen({ profile }) {
  const allowed = canAccessModule(profile?.admin_role, 'listings');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('id,name,category,product_type,price,approval_status,rejection_reason,created_at,uploaded_by')
      .neq('approval_status', 'approved')
      .neq('approval_status', 'removed')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) Alert.alert('Listing review', error.message);
    setItems(data || []);
    setLoading(false);
  }, [allowed]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.screen}>
      <Header profile={profile} title="Listing review" />
      {!allowed ? <Restricted label="Listing moderation" /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={!loading ? <Text style={styles.empty}>No listings currently require review.</Text> : null}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <View style={styles.pill}><Text style={styles.pillText}>{item.approval_status || 'pending'}</Text></View>
              </View>
              <Text style={styles.bodyText}>{item.category || item.product_type || 'Listing'} · {dateTime(item.created_at)}</Text>
              <Text style={styles.amount}>{money(item.price, profile?.preferred_currency)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function WithdrawalsScreen({ profile }) {
  const allowed = canAccessModule(profile?.admin_role, 'withdrawals');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('withdrawal_queue')
      .select('id,user_id,amount,currency,account_number,account_name,status,gateway_response,retry_count,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) Alert.alert('Withdrawals', error.message);
    setItems(data || []);
    setLoading(false);
  }, [allowed]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.screen}>
      <Header profile={profile} title="Withdrawals" />
      {!allowed ? <Restricted label="Withdrawal management" /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={!loading ? <Text style={styles.empty}>No withdrawal records are available.</Text> : null}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.amount}>{money(item.amount, item.currency)}</Text>
                <View style={styles.pill}><Text style={styles.pillText}>{item.status}</Text></View>
              </View>
              <Text style={styles.bodyText}>{item.account_name || 'Account holder'}</Text>
              <Text style={styles.bodyText}>Account {maskAccount(item.account_number)}</Text>
              <Text style={styles.metaText}>Requested {dateTime(item.created_at)}</Text>
              {item.gateway_response ? <Text style={styles.warningText}>{item.gateway_response}</Text> : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

function SupportScreen({ profile }) {
  const allowed = canAccessModule(profile?.admin_role, 'support');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id,ticket_number,user_id,subject,message,status,priority,category,channel,assigned_admin_id,created_at,last_activity_at')
      .neq('status', 'closed')
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .limit(80);
    if (error) Alert.alert('Customer care', error.message);
    setItems(data || []);
    setLoading(false);
  }, [allowed]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.screen}>
      <Header profile={profile} title="Customer care" />
      {!allowed ? <Restricted label="Support tickets" /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={!loading ? <Text style={styles.empty}>No open support tickets.</Text> : null}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{item.ticket_number || 'Support ticket'}</Text>
                <View style={styles.pill}><Text style={styles.pillText}>{item.priority || 'normal'}</Text></View>
              </View>
              <Text style={styles.ticketSubject}>{item.subject}</Text>
              <Text numberOfLines={3} style={styles.bodyText}>{item.message}</Text>
              <Text style={styles.metaText}>{item.category || item.channel || 'Support'} · {dateTime(item.created_at)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function AccountScreen({ profile, refreshProfile }) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Header profile={profile} title="Admin account" />
      <View style={styles.profileCard}>
        <View style={styles.bigAvatar}><Text style={styles.bigAvatarText}>{(profile?.full_name || 'A').charAt(0).toUpperCase()}</Text></View>
        <Text style={styles.profileName}>{profile?.full_name || 'DRIGHT Administrator'}</Text>
        <Text style={styles.profileEmail}>{profile?.email}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Authorization</Text>
        <Text style={styles.bodyText}>Role: {String(profile?.admin_role || 'admin').replaceAll('_', ' ')}</Text>
        <Text style={styles.bodyText}>Admin status: {profile?.admin_status}</Text>
        <Text style={styles.bodyText}>Account status: {profile?.account_status || 'ACTIVE'}</Text>
        <Text style={styles.bodyText}>Agreement: {profile?.agreement_accepted ? 'Accepted' : 'Not recorded'}</Text>
        <Text style={styles.bodyText}>Admin verification: {profile?.admin_verification_status || 'Not recorded'}</Text>
      </View>
      <Pressable style={styles.dangerButton} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.dangerText}>Sign out of Admin</Text>
      </Pressable>
    </ScrollView>
  );
}

const TABS = [
  ['dashboard', 'Dashboard'],
  ['listings', 'Listings'],
  ['withdrawals', 'Payouts'],
  ['support', 'Support'],
  ['account', 'Account']
];

function AdminShell({ profile, userId, refreshProfile }) {
  const [tab, setTab] = useState('dashboard');
  let content = null;
  if (tab === 'dashboard') content = <DashboardScreen profile={profile} />;
  if (tab === 'listings') content = <ListingsScreen profile={profile} />;
  if (tab === 'withdrawals') content = <WithdrawalsScreen profile={profile} />;
  if (tab === 'support') content = <SupportScreen profile={profile} />;
  if (tab === 'account') content = <AccountScreen profile={profile} refreshProfile={refreshProfile} />;

  return (
    <SafeAreaView style={styles.app}>
      {content}
      <View style={styles.tabBar}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={styles.tabButton}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [notice, setNotice] = useState('');

  const establishSession = useCallback(async (session) => {
    if (!session?.user) {
      setProfile(null);
      setUserId(null);
      setBooting(false);
      return;
    }

    try {
      const device = await claimCurrentDevice();
      if (device?.allowed !== true) {
        await supabase.auth.signOut({ scope: 'local' });
        setNotice(
          device?.reason === 'device_belongs_to_another_account'
            ? 'This device is already linked to another DRIGHT account.'
            : 'DRIGHT could not verify this device.'
        );
        setBooting(false);
        return;
      }

      const admin = await getAdminProfile(session.user.id);
      const active = admin?.is_admin === true && admin?.admin_status === 'active';
      const accountAllowed = admin?.account_status !== 'LOCKED' && admin?.account_status !== 'BANNED';

      if (!active || !accountAllowed) {
        await supabase.auth.signOut({ scope: 'local' });
        setNotice(
          !active
            ? 'This account is not an active DRIGHT administrator. Use the regular DRIGHT app.'
            : 'This administrator account is currently ' + String(admin.account_status).toLowerCase() + '.'
        );
        setProfile(null);
        setUserId(null);
        setBooting(false);
        return;
      }

      setNotice('');
      setProfile(admin);
      setUserId(session.user.id);
    } catch (error) {
      await supabase.auth.signOut({ scope: 'local' });
      setNotice(error?.message || 'Administrator authorization failed.');
      setProfile(null);
      setUserId(null);
    } finally {
      setBooting(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const admin = await getAdminProfile(userId);
    setProfile(admin);
  }, [userId]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setBooting(false);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) void establishSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setUserId(null);
        setBooting(false);
      } else if (event === 'SIGNED_IN') {
        setBooting(true);
        setTimeout(() => { if (mounted) void establishSession(session); }, 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [establishSession]);

  if (!supabaseConfigured) return <ConfigRequired />;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      {booting ? (
        <SafeAreaView style={styles.center}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>Verifying administrator…</Text>
        </SafeAreaView>
      ) : profile && userId ? (
        <AdminShell profile={profile} userId={userId} refreshProfile={refreshProfile} />
      ) : (
        <LoginScreen notice={notice} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: BG },
  loadingText: { color: MUTED, marginTop: 12 },
  brand: { color: NAVY, fontWeight: '900', fontSize: 25, letterSpacing: 1.2 },
  title: { color: NAVY, fontWeight: '900', fontSize: 20, marginTop: 14, textAlign: 'center' },
  help: { color: MUTED, textAlign: 'center', lineHeight: 21, marginTop: 8 },
  loginWrap: { flex: 1, backgroundColor: BG },
  loginContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  adminMark: { width: 66, height: 66, borderRadius: 18, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  adminMarkText: { color: '#fff', fontWeight: '900', fontSize: 24 },
  loginSub: { color: MUTED, marginTop: 5, marginBottom: 24 },
  notice: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  noticeText: { color: '#9a3412', lineHeight: 19 },
  input: { height: 52, backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 15, marginBottom: 12, color: NAVY },
  primaryButton: { height: 52, borderRadius: 12, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.65 },
  securityText: { color: '#94a3b8', textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 18 },
  screen: { flex: 1, backgroundColor: BG },
  screenContent: { padding: 18, paddingBottom: 110 },
  listContent: { paddingHorizontal: 18, paddingBottom: 110 },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerEyebrow: { color: PRIMARY, fontWeight: '900', fontSize: 11, letterSpacing: 1.3 },
  headerTitle: { color: NAVY, fontWeight: '900', fontSize: 24, marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: PRIMARY, fontWeight: '900', fontSize: 17 },
  adminHero: { backgroundColor: NAVY, borderRadius: 20, padding: 22, marginTop: 2, marginBottom: 14 },
  adminHeroLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  adminHeroName: { color: '#fff', fontSize: 23, fontWeight: '900', marginTop: 5 },
  adminHeroRole: { color: '#bfdbfe', marginTop: 6, textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  statCard: { width: '48%', minHeight: 112, backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 16 },
  statValue: { color: NAVY, fontSize: 28, fontWeight: '900' },
  statLabel: { color: MUTED, fontSize: 12, marginTop: 5 },
  restrictedMini: { color: '#c2410c', fontSize: 10, marginTop: 7 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTitle: { color: NAVY, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  bodyText: { color: MUTED, lineHeight: 20, marginTop: 7 },
  metaText: { color: '#94a3b8', fontSize: 12, marginTop: 9 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pill: { backgroundColor: '#eff6ff', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9 },
  pillText: { color: PRIMARY, fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  amount: { color: NAVY, fontSize: 20, fontWeight: '900', marginTop: 10 },
  warningText: { color: '#b45309', marginTop: 9, fontSize: 12 },
  ticketSubject: { color: NAVY, fontWeight: '800', marginTop: 10 },
  empty: { textAlign: 'center', color: MUTED, paddingVertical: 42 },
  restricted: { margin: 18, padding: 18, backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 16 },
  restrictedTitle: { color: '#9a3412', fontSize: 16, fontWeight: '900' },
  profileCard: { alignItems: 'center', paddingVertical: 24 },
  bigAvatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  bigAvatarText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  profileName: { color: NAVY, fontWeight: '900', fontSize: 22, marginTop: 12 },
  profileEmail: { color: MUTED, marginTop: 4 },
  dangerButton: { height: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: '#dc2626', fontWeight: '900' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#fff', paddingBottom: Platform.OS === 'ios' ? 18 : 8, paddingTop: 8 },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: NAVY, fontWeight: '900' }
});
