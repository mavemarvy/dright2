import { useState, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Receipt, FileCheck, User, LogOut, Menu, X,
  Store, ShoppingBag, Shield, Megaphone, Briefcase, FileText,
  MessageCircle, Users, Bell, Activity, TrendingUp, Wallet, Target,
  Settings as SettingsGear, HelpCircle, GraduationCap, Trophy,
  ChevronLeft, ChevronRight, Search, Heart, ScrollText,
  Gift,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage, type TranslationKey } from '../contexts/LanguageContext';
import ThemeToggle from './ThemeToggle';
import UIPreferencesToggles from './UIPreferencesToggles';
import NotificationBar from './NotificationBar';
import { useUIPreferences } from '../lib/uiPreferences';
import ChatSystem from './ChatSystem';
import AbandonedPaymentBanner from './AbandonedPaymentBanner';
import LanguageSwitcher from './LanguageSwitcher';

type NavEntry = {
  path: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
};

const primaryNav: NavEntry[] = [
  { path: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { path: '/market', labelKey: 'market', icon: Store },
];

const accountNav: NavEntry[] = [
  { path: '/profile', labelKey: 'profile', icon: User },
  { path: '/wallet', labelKey: 'wallet', icon: Wallet },
  { path: '/my-orders', labelKey: 'myOrders', icon: Receipt },
  { path: '/wishlist', labelKey: 'savedItems', icon: Heart },
  { path: '/chat', labelKey: 'messages', icon: MessageCircle },
];

const sellerNav: NavEntry[] = [
  { path: '/store', labelKey: 'myStore', icon: ShoppingBag },
  { path: '/upload-product', labelKey: 'postAd', icon: Megaphone },
  { path: '/drafts', labelKey: 'myDrafts', icon: FileText },
  { path: '/sales', labelKey: 'sales', icon: FileCheck },
  { path: '/jobs', labelKey: 'jobBoard', icon: Briefcase },
];

const growthNav: NavEntry[] = [
  { path: '/refer', labelKey: 'refer', icon: Users },
  { path: '/campaigns', labelKey: 'campaigns', icon: TrendingUp },
  { path: '/creator-campaigns', labelKey: 'creatorCampaigns', icon: Target },
  { path: '/rewards', labelKey: 'rewards', icon: Gift },
];

const communityNav: NavEntry[] = [
  { path: '/notifications', labelKey: 'notifications', icon: Bell },
  { path: '/activity', labelKey: 'activityFeed', icon: Activity },
  { path: '/challenges', labelKey: 'challenges', icon: Trophy },
  { path: '/announcements', labelKey: 'announcements', icon: Megaphone },
];

const supportNav: NavEntry[] = [
  { path: '/help', labelKey: 'helpSupport', icon: HelpCircle },
  { path: '/tutorials', labelKey: 'tutorials', icon: GraduationCap },
  { path: '/legal', labelKey: 'termsPolicies', icon: ScrollText },
  { path: '/settings', labelKey: 'settings', icon: SettingsGear },
];

const allNavGroups: { title: TranslationKey; items: NavEntry[] }[] = [
  { title: 'dashboard', items: primaryNav },
  { title: 'profile', items: accountNav },
  { title: 'myStore', items: sellerNav },
  { title: 'refer', items: growthNav },
  { title: 'activityFeed', items: communityNav },
  { title: 'helpSupport', items: supportNav },
];

const mobileBottomItems: NavEntry[] = [
  { path: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { path: '/market', labelKey: 'market', icon: Store },
  { path: '/notifications', labelKey: 'notifications', icon: Bell },
];

function DrightLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <defs>
        <linearGradient id={`logoGrad-${size}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f46e5" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#logoGrad-${size})`} />
      <path d="M17 14H26.5C31.7467 14 36 18.2533 36 23.5C36 28.7467 31.7467 33 26.5 33H17V14ZM22 19V28H26.5C28.9853 28 31 25.9853 31 23.5C31 21.0147 28.9853 19 26.5 19H22Z" fill="white" />
      <circle cx="33" cy="15" r="3" fill="#60a5fa" />
    </svg>
  );
}

function NavItem({ item, collapsed, onClick, t }: {
  item: NavEntry;
  collapsed: boolean;
  onClick?: () => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
        }`
      }
      title={collapsed ? t(item.labelKey) : undefined}
    >
      <item.icon className="w-5 h-5 shrink-0" />
      {!collapsed && <span className="text-sm truncate">{t(item.labelKey)}</span>}
    </NavLink>
  );
}

function NavGroup({ group, collapsed, sidebarOpen, t, query }: {
  group: { title: TranslationKey; items: NavEntry[] };
  collapsed: boolean;
  sidebarOpen: boolean;
  t: (key: TranslationKey) => string;
  query: string;
}) {
  const filtered = query
    ? group.items.filter(item => t(item.labelKey).toLowerCase().includes(query.toLowerCase()))
    : group.items;
  if (filtered.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {!collapsed && !query && (
        <p className="px-3 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {t(group.title)}
        </p>
      )}
      {filtered.map(item => (
        <NavItem
          key={item.path}
          item={item}
          collapsed={collapsed}
          onClick={sidebarOpen ? () => {} : undefined}
          t={t}
        />
      ))}
    </div>
  );
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { profile, signOut, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { prefs: uiPrefs } = useUIPreferences();
  const location = useLocation();

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return profile?.email?.[0]?.toUpperCase() || 'P';
  };

  const sidebarWidth = collapsed ? 'md:w-16' : 'md:w-64';
  const mainPadding = collapsed ? 'md:pl-16' : 'md:pl-64';

  const filteredGroups = useMemo(() => allNavGroups, []);

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex md:flex-col ${sidebarWidth} md:fixed md:inset-y-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-300`}
      >
        {/* Logo + Collapse Toggle */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-4 py-5 border-b border-gray-100 dark:border-gray-700`}>
          <div className="flex items-center gap-3">
            <DrightLogo size={collapsed ? 36 : 40} />
            {!collapsed && <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Dright</span>}
          </div>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="p-2 mx-auto mt-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Search within menu */}
        {!collapsed && (
          <div className="px-3 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('searchMenu')}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-900 focus:border-primary-400 outline-none transition-colors text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {filteredGroups.map(group => (
            <NavGroup
              key={group.title}
              group={group}
              collapsed={collapsed}
              sidebarOpen={false}
              t={t}
              query={searchQuery}
            />
          ))}

          {/* Admin Link */}
          {isAdmin && (
            <div className="pt-2 mt-2 border-t border-gray-100">
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-warning-muted text-warning'
                      : 'text-warning hover:bg-warning-muted/50'
                  }`
                }
                title={collapsed ? t('adminPanel') : undefined}
              >
                <Shield className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="text-sm">{t('adminPanel')}</span>}
              </NavLink>
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-100 p-3">
          {!collapsed && (
            <div className="flex items-center gap-3 px-1 py-2 mb-2">
              <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden bg-primary-100 shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile?.full_name || 'User'} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary-700 font-semibold text-sm">{getInitials()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {profile?.full_name || 'Promoter'}
                  </p>
                  {isAdmin && (
                    <span className="px-1.5 py-0.5 text-xs font-semibold bg-warning-muted text-warning rounded">ADMIN</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
              </div>
            </div>
          )}
          <div className={`flex ${collapsed ? 'flex-col' : 'items-center'} gap-2`}>
            {collapsed ? (
              <>
                <LanguageSwitcher variant="compact" />
                {uiPrefs.showNotificationButton && <NotificationBar />}
                <ThemeToggle variant="default" />
                <button
                  onClick={signOut}
                  className="p-2 text-gray-600 hover:text-error hover:bg-error-muted rounded-xl transition-colors"
                  aria-label={t('signOut')}
                  title={t('signOut')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <>
                <LanguageSwitcher variant="compact" />
                {uiPrefs.showNotificationButton && <NotificationBar />}
                <ThemeToggle variant="default" />
                <button
                  onClick={signOut}
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 text-sm text-gray-600 hover:text-error hover:bg-error-muted rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  {t('signOut')}
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm safe-area-top">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 min-h-[56px]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2.5 -ml-1 text-gray-600 hover:text-gray-900 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <DrightLogo size={28} />
            <span className="text-lg font-bold text-gray-900">Dright</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher variant="compact" />
            {uiPrefs.showNotificationButton && <NotificationBar />}
            <ThemeToggle variant="default" />
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden bg-primary-100 shrink-0">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile?.full_name || 'User'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-primary-700 font-semibold text-sm">{getInitials()}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/50 z-50 md:hidden"
            />
            <motion.aside
              className="fixed left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white dark:bg-gray-800 z-50 md:hidden shadow-2xl flex flex-col safe-area-top-bottom overscroll-contain"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="shrink-0 flex items-center justify-between px-4 py-5 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <DrightLogo size={40} />
                  <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Dright</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" aria-label="Close menu">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Mobile search */}
              <div className="px-3 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('searchMenu')}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-900 focus:border-primary-400 outline-none transition-colors text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              <nav className="flex-1 overflow-y-auto py-3 px-2">
                {filteredGroups.map(group => (
                  <NavGroup
                    key={group.title}
                    group={group}
                    collapsed={false}
                    sidebarOpen={true}
                    t={t}
                    query={searchQuery}
                  />
                ))}
                {isAdmin && (
                  <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-700">
                    <NavLink
                      to="/admin"
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${
                          isActive ? 'bg-warning-muted text-warning' : 'text-warning hover:bg-warning-muted/50'
                        }`
                      }
                    >
                      <Shield className="w-5 h-5 shrink-0" />
                      <span className="text-sm">{t('adminPanel')}</span>
                    </NavLink>
                  </div>
                )}
              </nav>

              <div className="shrink-0 border-t border-gray-100 dark:border-gray-700 p-3 space-y-3">
                <div><LanguageSwitcher variant="sidebar" /></div>
                <UIPreferencesToggles />
                <button
                  onClick={() => { setSidebarOpen(false); signOut(); }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-error hover:bg-error-muted rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  {t('signOut')}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main id="main-content" className={`${mainPadding} pb-20 md:pb-0 transition-all duration-300`}>
        <AbandonedPaymentBanner />
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Chat System */}
      <ChatSystem />

      {/* Mobile Bottom Navigation — simplified to 3 items */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40 shadow-lg safe-area-bottom" aria-label="Main navigation">
        <div className="flex justify-around items-center py-2">
          {mobileBottomItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="flex flex-col items-center py-2 px-6 min-w-[64px] min-h-[56px]"
                aria-label={t(item.labelKey)}
              >
                <div className={`relative flex items-center justify-center ${isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  <item.icon className="w-6 h-6" />
                  {isActive && (
                    <motion.div
                      layoutId="bottomNavIndicator"
                      className="absolute -bottom-1 w-1 h-1 bg-primary-600 rounded-full"
                    />
                  )}
                </div>
                <span className={`text-xs mt-1 font-medium ${isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {t(item.labelKey)}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
