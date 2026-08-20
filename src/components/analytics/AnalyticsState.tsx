// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Analytics Error States
// Never display zero when loading fails — show appropriate status instead
// ─────────────────────────────────────────────────────────────────────────────

export function AnalyticsLoading({ message = 'Loading analytics...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
      </div>
    </div>
  );
}

export function AnalyticsSyncing() {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
      <div className="w-3 h-3 border-2 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin" />
      <span>Syncing...</span>
    </div>
  );
}

export function AnalyticsOffline() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Offline</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">Showing last cached data. Will sync when reconnected.</p>
      </div>
    </div>
  );
}

export function AnalyticsPermissionDenied() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75M5.25 10.5h13.5a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-6a1.5 1.5 0 011.5-1.5z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-red-600 dark:text-red-400">Permission Denied</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">You don't have access to this data.</p>
      </div>
    </div>
  );
}

export function AnalyticsNoData({ message = 'No data yet' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.875c0-.621.504-1.125 1.125-1.125h2.25C20.496 3.75 21 4.254 21 4.875v15c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125v-15z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{message}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">Analytics will appear here once there's activity.</p>
      </div>
    </div>
  );
}

export function AnalyticsError({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed to load</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{message}</p>
      </div>
    </div>
  );
}

// Smart wrapper that picks the right state
export function AnalyticsState({
  loading,
  error,
  syncing,
  offline,
  hasData,
  children,
}: {
  loading: boolean;
  error: string | null;
  syncing: boolean;
  offline: boolean;
  hasData: boolean;
  children: React.ReactNode;
}) {
  if (loading) return <AnalyticsLoading />;
  if (error === 'Permission Denied') return <AnalyticsPermissionDenied />;
  if (error) return <AnalyticsError message={error} />;
  if (!hasData) return <AnalyticsNoData />;
  return (
    <div className="relative">
      {offline && <AnalyticsOffline />}
      {syncing && !offline && (
        <div className="absolute top-0 right-0 z-10">
          <AnalyticsSyncing />
        </div>
      )}
      {children}
    </div>
  );
}
