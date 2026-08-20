export function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-surface-muted animate-pulse">
      {/* Cover */}
      <div className="h-48 sm:h-56 md:h-64 lg:h-72 bg-gray-200 dark:bg-gray-800" />

      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-16 relative z-10">
        <div className="flex flex-col md:flex-row items-start md:items-end gap-4">
          <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-2xl bg-gray-200 dark:bg-gray-800 shrink-0" />
          <div className="flex-1 space-y-2 pb-2">
            <div className="h-7 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg" />
            <div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="flex gap-4 mt-2">
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
          </div>
          <div className="flex gap-2 pb-2">
            <div className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded-lg" />
            <div className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-6 border-b border-gray-200 dark:border-gray-800 pb-px">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-20 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
