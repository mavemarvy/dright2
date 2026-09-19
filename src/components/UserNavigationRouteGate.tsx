import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNavigationVisibility } from '../contexts/NavigationVisibilityContext';
import { getUserNavigationFeatureForPath } from '../lib/userNavigation';

export default function UserNavigationRouteGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { ready, isVisible } = useNavigationVisibility();
  const featureKey = getUserNavigationFeatureForPath(location.pathname);

  if (!featureKey || isAdmin) return <>{children}</>;

  if (!ready || authLoading) {
    return (
      <div className="min-h-[45vh] flex items-center justify-center bg-surface-muted">
        <div className="w-9 h-9 rounded-full border-4 border-gray-200 border-t-primary-600 animate-spin" />
      </div>
    );
  }

  if (isVisible(featureKey)) return <>{children}</>;

  if (!user || featureKey === 'dashboard') {
    return <Navigate to="/welcome" replace state={{ hiddenFeature: featureKey }} />;
  }

  return <Navigate to="/" replace state={{ hiddenFeature: featureKey }} />;
}
