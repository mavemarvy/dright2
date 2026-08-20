import { useState } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';
import { useProductGenerator, useContentRewriter } from '../../lib/groqHooks';
import ErrorAlert from './ErrorAlert';

interface AIGenerateButtonProps {
  type: 'description' | 'title' | 'tags' | 'category' | 'rewrite' | 'summary' | 'pricing';
  productName?: string;
  category?: string;
  description?: string;
  content?: string;
  onApply: (value: string) => void;
  label?: string;
  className?: string;
}

export default function AIGenerateButton({
  type,
  productName = '',
  category = '',
  description = '',
  content = '',
  onApply,
  label,
  className = '',
}: AIGenerateButtonProps) {
  const [applied, setApplied] = useState(false);
  const productGen = useProductGenerator();
  const rewriter = useContentRewriter();
  const loading = productGen.loading || rewriter.loading;
  const error = productGen.error || rewriter.error;

  const handleGenerate = async () => {
    setApplied(false);
    let result: { success: boolean; content: string; error?: string } | null = null;

    switch (type) {
      case 'description':
        result = await productGen.generateDescription(productName, category, description || 'General digital product');
        break;
      case 'title':
        result = await productGen.improveTitle(productName, category);
        break;
      case 'tags':
        result = await productGen.suggestTags(productName, category, description);
        break;
      case 'category':
        result = await productGen.suggestCategory(productName, description);
        break;
      case 'rewrite':
        result = await rewriter.rewriteContent(content, 'Marketplace listing');
        break;
      case 'summary':
        result = await rewriter.rewriteContent(content, 'Summarize this content in 2-3 sentences');
        break;
      case 'pricing':
        result = await rewriter.rewriteContent(content, 'Suggest better pricing text for this marketplace listing');
        break;
    }

    if (result?.success && result.content) {
      onApply(result.content.trim());
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    }
  };

  const defaultLabels: Record<string, string> = {
    description: 'Generate Description',
    title: 'Improve Title',
    tags: 'Suggest Tags',
    category: 'Suggest Category',
    rewrite: 'Rewrite with AI',
    summary: 'Summarize with AI',
    pricing: 'Improve Pricing Text',
  };

  return (
    <div className={className}>
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : applied ? <Check className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
        {label || defaultLabels[type]}
      </button>
      {error && <ErrorAlert message={error} className="mt-2" />}
    </div>
  );
}
