import { AlertCircle, X } from 'lucide-react';

interface ErrorAlertProps {
  message: string;
  onClose?: () => void;
  className?: string;
}

export default function ErrorAlert({
  message,
  onClose,
  className = '',
}: ErrorAlertProps) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 ${className}`}>
      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
      <p className="flex-1 text-sm text-red-600 dark:text-red-400">{message}</p>
      {onClose && (
        <button
          onClick={onClose}
          className="p-0.5 text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
