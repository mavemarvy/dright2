import { Loader2 } from 'lucide-react';

interface LoadingIndicatorProps {
  label?: string;
  className?: string;
}

export default function LoadingIndicator({
  label = 'AI is thinking...',
  className = '',
}: LoadingIndicatorProps) {
  return (
    <div className={`flex items-center gap-2 text-sm text-gray-400 ${className}`}>
      <Loader2 className="w-4 h-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
