import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import {
  claimCurrentDevice,
  getNativeDeviceId,
  preflightSignupDevice
} from './src/lib/device';

const PRIMARY = '#1e40af';
const BG = '#f8fafc';
const BORDER = '#e5e7eb';
const MUTED = '#6b7280';

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

function dateLabel(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleDateString(); } catch { return ''; }
}

async function getOwnProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id,email,full_name,username,avatar_url,role,is_admin,admin_status,admin_role,account_status,is_verified,balance,available_balance,affiliate_earnings,preferred_currency,location,followers_count,total_sales_count,average_rating')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureOwnProfile(user) {
  let profile = await getOwnProfile(user.id);
  if (profile) return profile;

  const email = (user.email || '').trim().toLowerCase();
  const local = (email.split('@')[0] || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18) || 'user';
  const username = (local + '_' + user.id.replace(/-/g, '').slice(0, 8)).slice(0, 30);

  const { error } = await supabase.from('users').insert({
    id: user.id,
    email,
    full_name: user.user_metadata?.full_name || null,
    phone: user.phone || null,
    role: 'user',
    is_admin: false,
    admin_status: 'active',
    balance: 0,
    preferred_currency: user.user_metadata?.preferred_currency || 'USD',
    location: user.user_metadata?.location || null,
    username
  });
  if (error) throw error;
  return getOwnProfile(user.id);
}

function ConfigRequired() {
  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.brand}>DRIGHT</Text>
      <Text style={styles.title}>Mobile configuration required</Text>
      <Text style={styles.help}>
        Copy .env.example to .env and set the DRIGHT2 publishable Supabase key.
      </Text>
    </SafeAreaView>
  );
}

function AuthScreen({ notice }) {
  const [mode, setMode] = useState('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      Alert.alert('Missing name', 'Enter your full name.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password
        });
        if (error) throw error;
      } else {
        const device = await preflightSignupDevice();
        if (device?.allowed !== true) {
          const message = device?.reason === 'device_already_has_account'
            ? 'A DRIGHT account is already registered on this device. Sign in to that account instead.'
            : 'DRIGHT could not verify this device for account creation.';
          throw new Error(message);
        }

        const deviceId = await getNativeDeviceId();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              wants_admin: false,
              signup_device_id: deviceId,
              signup_device_fingerprint: 'native:' + Platform.OS + ':' + deviceId
            }
          }
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert(
            'Verify your email',
            'Your DRIGHT account was created. Verify your email, then return here to sign in.'
          );
          setMode('signin');
        }
      }
    } catch (error) {
      Alert.alert('DRIGHT', error?.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.authWrap}
    >
      <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
        <View style={styles.logoCircle}><Text style={styles.logoText}>D</Text></View>
        <Text style={styles.brand}>DRIGHT</Text>
        <Text style={styles.authSub}>
          {mode === 'signin' ? 'Sign in to your marketplace account' : 'Create your DRIGHT account'}
        </Text>

        {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}

        {mode === 'signup' ? (
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full name"
            style={styles.input}
            autoCapitalize="words"
          />
        ) : null}
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
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

        <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.primaryButtonText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} style={styles.linkButton}>
          <Text style={styles.linkText}>
            {mode === 'signin' ? 'New to DRIGHT? Create an account' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>

        <Text style={styles.separationNote}>
          DRIGHT administrators sign in through the separate DRIGHT Admin app.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Header({ profile, title }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerEyebrow}>DRIGHT</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(profile?.full_name || profile?.email || 'D').trim().charAt(0).toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

function HomeScreen({ profile }) {
  const [stats, setStats] = useState({ orders: null, unread: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [orders, unread] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false)
    ]);
    setStats({
      orders: orders.error ? null : orders.count || 0,
      unread: unread.error ? null : unread.count || 0
    });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Header profile={profile} title={'Hello, ' + (profile?.full_name?.split(' ')[0] || 'there')} />
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Available balance</Text>
        <Text style={styles.heroAmount}>{money(profile?.available_balance ?? profile?.balance, profile?.preferred_currency)}</Text>
        <Text style={styles.heroText}>Buy, sell, earn and manage your DRIGHT activity from one app.</Text>
      </View>
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.orders ?? '—'}</Text>
          <Text style={styles.statLabel}>Orders</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.unread ?? '—'}</Text>
          <Text style={styles.statLabel}>Unread alerts</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your account</Text>
        <Text style={styles.rowText}>Role: {profile?.role || 'User'}</Text>
        <Text style={styles.rowText}>Verification: {profile?.is_verified ? 'Verified' : 'Not verified'}</Text>
        <Text style={styles.rowText}>Location: {profile?.location || 'Not set'}</Text>
      </View>
    </ScrollView>
  );
}

function MarketplaceScreen({ profile }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('id,name,description,price,image_url,category,average_rating,total_sales,product_type,created_at')
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) Alert.alert('Marketplace', error.message);
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.screen}>
      <Header profile={profile} title="Marketplace" />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No approved listings are available yet.</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.productCard}>
            {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productImage} /> : (
              <View style={[styles.productImage, styles.imagePlaceholder]}><Text style={styles.placeholderText}>DRIGHT</Text></View>
            )}
            <View style={styles.productBody}>
              <Text numberOfLines={1} style={styles.productName}>{item.name}</Text>
              <Text style={styles.productCategory}>{item.category || item.product_type || 'Listing'}</Text>
              <Text style={styles.productPrice}>{money(item.price, profile?.preferred_currency)}</Text>
              <Text style={styles.productMeta}>★ {Number(item.average_rating || 0).toFixed(1)} · {item.total_sales || 0} sales</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function OrdersScreen({ profile }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('id,product_id,buyer_id,seller_id,order_type,status,final_price,is_free_order,created_at,completed_at,tracking_code')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) Alert.alert('Orders', error.message);
    setOrders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.screen}>
      <Header profile={profile} title="Orders" />
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>You do not have any orders yet.</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{item.order_type || 'Order'}</Text>
              <View style={styles.pill}><Text style={styles.pillText}>{item.status}</Text></View>
            </View>
            <Text style={styles.orderAmount}>{item.is_free_order ? 'Free' : money(item.final_price, profile?.preferred_currency)}</Text>
            <Text style={styles.rowText}>Created {dateLabel(item.created_at)}</Text>
            {item.tracking_code ? <Text style={styles.rowText}>Tracking: {item.tracking_code}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}

function AlertsScreen({ profile }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('id,title,message,category,priority,is_read,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) Alert.alert('Notifications', error.message);
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markRead = async (item) => {
    if (item.is_read) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) Alert.alert('Notifications', error.message);
    else void load();
  };

  return (
    <View style={styles.screen}>
      <Header profile={profile} title="Notifications" />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No notifications yet.</Text> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => markRead(item)} style={[styles.card, !item.is_read && styles.unreadCard]}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{item.title || item.category || 'DRIGHT'}</Text>
              {!item.is_read ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.notificationText}>{item.message}</Text>
            <Text style={styles.timeText}>{dateLabel(item.created_at)}{!item.is_read ? ' · Tap to mark read' : ''}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function ProfileScreen({ profile, onRefreshProfile }) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await onRefreshProfile();
    setRefreshing(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Header profile={profile} title="Profile" />
      <View style={styles.profileHero}>
        <View style={styles.bigAvatar}><Text style={styles.bigAvatarText}>{(profile?.full_name || 'D').charAt(0).toUpperCase()}</Text></View>
        <Text style={styles.profileName}>{profile?.full_name || 'DRIGHT User'}</Text>
        <Text style={styles.profileHandle}>@{profile?.username || 'user'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account details</Text>
        <Text style={styles.rowText}>{profile?.email}</Text>
        <Text style={styles.rowText}>Currency: {profile?.preferred_currency || 'USD'}</Text>
        <Text style={styles.rowText}>Followers: {profile?.followers_count || 0}</Text>
        <Text style={styles.rowText}>Sales: {profile?.total_sales_count || 0}</Text>
        <Text style={styles.rowText}>Affiliate earnings: {money(profile?.affiliate_earnings, profile?.preferred_currency)}</Text>
      </View>
      <Pressable style={styles.outlineButton} onPress={signOut}>
        <Text style={styles.outlineButtonText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const TABS = [
  ['home', 'Home'],
  ['market', 'Market'],
  ['orders', 'Orders'],
  ['alerts', 'Alerts'],
  ['profile', 'Profile']
];

function MainApp({ profile, refreshProfile }) {
  const [tab, setTab] = useState('home');
  let content = null;
  if (tab === 'home') content = <HomeScreen profile={profile} />;
  if (tab === 'market') content = <MarketplaceScreen profile={profile} />;
  if (tab === 'orders') content = <OrdersScreen profile={profile} />;
  if (tab === 'alerts') content = <AlertsScreen profile={profile} />;
  if (tab === 'profile') content = <ProfileScreen profile={profile} onRefreshProfile={refreshProfile} />;

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
  const [notice, setNotice] = useState('');

  const establishSession = useCallback(async (session) => {
    if (!session?.user) {
      setProfile(null);
      setBooting(false);
      return;
    }

    try {
      const device = await claimCurrentDevice();
      if (device?.allowed !== true) {
        await supabase.auth.signOut({ scope: 'local' });
        setNotice(
          device?.reason === 'device_belongs_to_another_account'
            ? 'This device is linked to another DRIGHT account.'
            : 'DRIGHT could not verify this device.'
        );
        setProfile(null);
        setBooting(false);
        return;
      }

      const ownProfile = await ensureOwnProfile(session.user);
      if (ownProfile?.is_admin === true && ownProfile?.admin_status === 'active') {
        await supabase.auth.signOut({ scope: 'local' });
        setNotice('This is an administrator account. Use the separate DRIGHT Admin app.');
        setProfile(null);
        setBooting(false);
        return;
      }

      if (ownProfile?.account_status === 'LOCKED' || ownProfile?.account_status === 'BANNED') {
        await supabase.auth.signOut({ scope: 'local' });
        setNotice('This DRIGHT account is currently ' + ownProfile.account_status.toLowerCase() + '.');
        setProfile(null);
        setBooting(false);
        return;
      }

      setNotice('');
      setProfile(ownProfile);
    } catch (error) {
      setNotice(error?.message || 'Could not start your DRIGHT session.');
      setProfile(null);
    } finally {
      setBooting(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setProfile(await getOwnProfile(user.id));
  }, []);

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
          <Text style={styles.loadingText}>Opening DRIGHT…</Text>
        </SafeAreaView>
      ) : profile ? (
        <MainApp profile={profile} refreshProfile={refreshProfile} />
      ) : (
        <AuthScreen notice={notice} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: BG },
  loadingText: { marginTop: 12, color: MUTED },
  brand: { fontSize: 28, fontWeight: '900', color: PRIMARY, letterSpacing: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 12, textAlign: 'center' },
  help: { color: MUTED, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  authWrap: { flex: 1, backgroundColor: BG },
  authContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoCircle: { width: 64, height: 64, borderRadius: 18, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '900' },
  authSub: { color: MUTED, marginTop: 5, marginBottom: 24, fontSize: 15 },
  notice: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, padding: 12, marginBottom: 14 },
  noticeText: { color: '#1e3a8a', lineHeight: 19 },
  input: { height: 52, backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 15, marginBottom: 12, color: '#111827' },
  primaryButton: { height: 52, borderRadius: 12, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.65 },
  linkButton: { paddingVertical: 16, alignItems: 'center' },
  linkText: { color: PRIMARY, fontWeight: '700' },
  separationNote: { textAlign: 'center', color: '#94a3b8', fontSize: 12, lineHeight: 18, marginTop: 10 },
  screen: { flex: 1, backgroundColor: BG },
  screenContent: { padding: 18, paddingBottom: 100 },
  listContent: { paddingHorizontal: 18, paddingBottom: 110 },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerEyebrow: { color: PRIMARY, fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#111827', marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: PRIMARY, fontWeight: '900', fontSize: 17 },
  hero: { marginTop: 2, backgroundColor: PRIMARY, borderRadius: 20, padding: 22 },
  heroLabel: { color: '#bfdbfe', fontSize: 13, fontWeight: '700' },
  heroAmount: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 5 },
  heroText: { color: '#dbeafe', lineHeight: 20, marginTop: 12 },
  statRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  statCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 18 },
  statValue: { fontSize: 26, fontWeight: '900', color: '#111827' },
  statLabel: { color: MUTED, marginTop: 3 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTitle: { color: '#111827', fontWeight: '800', fontSize: 16 },
  rowText: { color: MUTED, marginTop: 8, lineHeight: 20 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  productCard: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 10, marginBottom: 12 },
  productImage: { width: 94, height: 94, borderRadius: 12, backgroundColor: '#e5e7eb' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#94a3b8', fontWeight: '800', fontSize: 11 },
  productBody: { flex: 1, paddingLeft: 13, justifyContent: 'center' },
  productName: { color: '#111827', fontWeight: '800', fontSize: 16 },
  productCategory: { color: MUTED, marginTop: 3, fontSize: 12 },
  productPrice: { color: PRIMARY, fontWeight: '900', fontSize: 17, marginTop: 7 },
  productMeta: { color: MUTED, fontSize: 12, marginTop: 4 },
  pill: { backgroundColor: '#eff6ff', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  pillText: { color: PRIMARY, fontSize: 11, fontWeight: '800' },
  orderAmount: { fontSize: 22, fontWeight: '900', color: '#111827', marginTop: 12 },
  empty: { color: MUTED, textAlign: 'center', paddingVertical: 40 },
  unreadCard: { borderColor: '#93c5fd', backgroundColor: '#f8fbff' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: PRIMARY },
  notificationText: { color: '#374151', lineHeight: 20, marginTop: 8 },
  timeText: { color: '#9ca3af', marginTop: 10, fontSize: 12 },
  profileHero: { alignItems: 'center', paddingVertical: 24 },
  bigAvatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  bigAvatarText: { color: PRIMARY, fontSize: 32, fontWeight: '900' },
  profileName: { fontSize: 22, fontWeight: '900', color: '#111827', marginTop: 12 },
  profileHandle: { color: MUTED, marginTop: 3 },
  outlineButton: { height: 50, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  outlineButtonText: { color: '#dc2626', fontWeight: '800' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#fff', paddingBottom: Platform.OS === 'ios' ? 18 : 8, paddingTop: 8 },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: PRIMARY, fontWeight: '900' }
});
