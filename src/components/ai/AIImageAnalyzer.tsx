import { useState } from 'react';
import { Scan, Loader2, Check } from 'lucide-react';
import { useImageAnalysis, useImageUpload } from '../../lib/ai/imageHooks';
import ErrorAlert from './ErrorAlert';

interface AIImageAnalyzerProps {
  userId: string;
  onApplyTitle?: (title: string) => void;
  onApplyDescription?: (desc: string) => void;
  onApplyCategory?: (cat: string) => void;
  onApplyKeywords?: (keywords: string[]) => void;
  className?: string;
}

export default function AIImageAnalyzer({
  userId,
  onApplyTitle,
  onApplyDescription,
  onApplyCategory,
  onApplyKeywords,
  className = '',
}: AIImageAnalyzerProps) {
  const [, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const { upload, uploading, error: uploadError } = useImageUpload();
  const { analyze, analyzing, result: analysis, error: analysisError, reset: resetAnalysis } = useImageAnalysis();
  const [applied, setApplied] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setApplied(false);
    resetAnalysis();
    const uploadResult = await upload(file, userId);
    if (uploadResult) {
      setImageUrl(uploadResult.url);
      const res = await analyze(uploadResult.url, 'product', userId);
      if (res?.success && res.analysis) {
        const a = res.analysis;
        if (onApplyTitle && a.suggested_title) onApplyTitle(String(a.suggested_title));
        if (onApplyDescription && a.description) onApplyDescription(String(a.description));
        if (onApplyCategory && a.suggested_categories) {
          const cats = Array.isArray(a.suggested_categories)
            ? a.suggested_categories.join(', ')
            : String(a.suggested_categories);
          onApplyCategory(cats);
        }
        if (onApplyKeywords && a.seo_keywords) {
          const kws = Array.isArray(a.seo_keywords)
            ? a.seo_keywords.map(String)
            : String(a.seo_keywords).split(',').map((k) => k.trim()).filter(Boolean);
          onApplyKeywords(kws);
        }
        setApplied(true);
        setTimeout(() => setApplied(false), 3000);
      }
    }
  };

  const error = uploadError || analysisError;

  return (
    <div className={className}>
      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer transition-colors">
        {uploading || analyzing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : applied ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Scan className="w-3.5 h-3.5" />
        )}
        Analyze Image with AI
        <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={uploading || analyzing} />
      </label>
      {fileName && <span className="text-xs text-gray-400 ml-2">{fileName}</span>}
      {error && <ErrorAlert message={error} className="mt-2" />}
      {analysis && (
        <div className="mt-2 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg text-xs text-gray-600 dark:text-gray-300">
          <p className="font-medium mb-1">AI Analysis Result:</p>
          {analysis.product_type != null && <p>Product type: {String(analysis.product_type)}</p>}
          {analysis.suggested_title != null && <p>Suggested title: {String(analysis.suggested_title)}</p>}
          {analysis.price_range != null && <p>Price range: {String(analysis.price_range)}</p>}
        </div>
      )}
    </div>
  );
}
