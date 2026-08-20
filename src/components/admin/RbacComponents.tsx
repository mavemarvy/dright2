import { type ReactNode } from 'react';

export function StatCard({ label, value, icon, color = 'text-primary-500', bg = 'bg-primary-50' }: {
  label: string; value: string | number; icon?: ReactNode; color?: string; bg?: string;
}) {
  void color;
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        {icon && <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>{icon}</div>}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  under_review: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  verified: 'bg-green-50 text-green-700 border-green-200',
  published: 'bg-green-50 text-green-700 border-green-200',
  active: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  revision_requested: 'bg-orange-50 text-orange-700 border-orange-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  draft: 'bg-gray-50 text-gray-600 border-gray-200',
  archived: 'bg-gray-50 text-gray-600 border-gray-200',
  hidden: 'bg-gray-50 text-gray-600 border-gray-200',
  not_submitted: 'bg-gray-50 text-gray-600 border-gray-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
};

export function StatusChip({ status, labels }: { status: string; labels: Record<string, string> }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="text-center py-12">
      {icon && <div className="mb-3 flex justify-center text-gray-300">{icon}</div>}
      <p className="text-gray-400">{message}</p>
    </div>
  );
}

export function LoadingBar() {
  return <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-4"><div className="h-full bg-primary-500 animate-pulse rounded-full" /></div>;
}
