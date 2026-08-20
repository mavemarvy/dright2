import { useState, useCallback, useRef } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useAI } from '../../lib/groqHooks';

interface AIPromptInputProps {
  placeholder?: string;
  context?: string;
  onResult?: (content: string) => void;
  buttonText?: string;
  className?: string;
}

export default function AIPromptInput({
  placeholder = 'Ask AI to help...',
  context,
  onResult,
  buttonText = 'Generate',
  className = '',
}: AIPromptInputProps) {
  const [input, setInput] = useState('');
  const { loading, generate } = useAI();
  const abortRef = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (!input.trim() || loading) return;
    abortRef.current = false;
    const res = await generate(input.trim(), context);
    if (!abortRef.current && res.success && onResult) {
      onResult(res.content);
    }
  }, [input, loading, context, generate, onResult]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex-1">
        <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400 pointer-events-none" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          placeholder={placeholder}
          disabled={loading}
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-500/30 disabled:opacity-50"
        />
      </div>
      <button
        onClick={handleGenerate}
        disabled={loading || !input.trim()}
        className="shrink-0 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-1.5"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Generating...' : buttonText}
      </button>
    </div>
  );
}
