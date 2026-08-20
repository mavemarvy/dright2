import { Copy, Check, X } from 'lucide-react';
import { useState } from 'react';

interface AIResponseCardProps {
  content: string;
  onClose?: () => void;
  onUse?: (content: string) => void;
  useButtonText?: string;
  title?: string;
  className?: string;
}

export default function AIResponseCard({
  content,
  onClose,
  onUse,
  useButtonText = 'Use',
  title = 'AI Generated',
  className = '',
}: AIResponseCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border border-primary-200 dark:border-primary-500/30 bg-primary-50/50 dark:bg-primary-500/10 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-primary-200 dark:border-primary-500/20">
        <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1.5">
          <SparklesIcon />
          {title}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            title="Copy"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {onUse && (
            <button
              onClick={() => onUse(content)}
              className="px-2 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-lg transition-colors"
            >
              {useButtonText}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-80 overflow-y-auto">
        {content}
      </div>
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}
