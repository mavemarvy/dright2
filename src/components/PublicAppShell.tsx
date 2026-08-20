import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppShell from './AppShell';

export default function PublicAppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Authenticated users get the full app shell with sidebar
  if (user) {
    return <AppShell />;
  }

  // Guest users get a minimal header
  return (
    <div className="min-h-screen bg-surface-muted">
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-100 safe-area-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/welcome" className="flex items-center gap-3">
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="publicLogoGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4f46e5" />
                  <stop offset="1" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
              <rect width="48" height="48" rx="12" fill="url(#publicLogoGrad)" />
              <path d="M17 14H26.5C31.7467 14 36 18.2533 36 23.5C36 28.7467 31.7467 33 26.5 33H17V14ZM22 19V28H26.5C28.9853 28 31 25.9853 31 23.5C31 21.0147 28.9853 19 26.5 19H22Z" fill="white" />
              <circle cx="33" cy="15" r="3" fill="#60a5fa" />
            </svg>
            <span className="text-lg font-bold text-gray-900">Dright</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/market"
              className="hidden sm:block text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 py-2"
            >
              Marketplace
            </Link>
            <Link
              to="/jobs"
              className="hidden sm:block text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 py-2"
            >
              Job Board
            </Link>
            <Link
              to="/sign-in"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 py-2.5 min-h-[44px] flex items-center"
            >
              Sign in
            </Link>
            <Link
              to="/sign-up"
              className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl px-4 sm:px-5 py-2.5 transition-colors min-h-[44px] flex items-center"
            >
              Sign up
            </Link>
          </div>
        </div>
      </nav>
      <main id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
