import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Loader2, Star, TrendingUp, Hash,
  Image as ImageIcon, DollarSign, FileText, Search,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface OptimizationScore {
  title_score: number;
  description_score: number;
  image_score: number;
  pricing_score: number;
  seo_score: number;
  tags_count: number;
  has_specifications: boolean;
  has_faqs: boolean;
  description_length: number;
}

interface ProductOptimizationCardProps {
  productId?: string;
  productData?: Partial<{
    name: string;
    description: string | null;
    price: number;
    is_free: boolean;
    category: string;
    tags: string[];
    image_url: string | null;
    specifications: Record<string, string> | null;
    faqs: Array<{ question: string; answer: string }> | null;
    commission_rate: number;
  }>;
  onImprove?: (suggestions: OptimizationSuggestion[]) => void;
}

export interface OptimizationSuggestion {
  area: string;
  score: number;
  tip: string;
  priority: 'high' | 'medium' | 'low';
}

function scoreToStars(score: number): number {
  return Math.round(score / 20);
}

function getGrade(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Excellent', color: 'text-green-600' };
  if (score >= 75) return { label: 'Good', color: 'text-blue-600' };
  if (score >= 50) return { label: 'Fair', color: 'text-amber-600' };
  return { label: 'Needs Work', color: 'text-red-500' };
}

function generateSuggestions(data: OptimizationScore): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  if (data.title_score < 70) {
    suggestions.push({
      area: 'Title',
      score: data.title_score,
      tip: data.title_score < 50
        ? 'Make your title 10-80 characters. Include descriptive keywords buyers would search for.'
        : 'Add numbers or power words like "Pro", "Complete", "Ultimate" to boost click appeal.',
      priority: data.title_score < 50 ? 'high' : 'medium',
    });
  }
  if (data.description_score < 70) {
    suggestions.push({
      area: 'Description',
      score: data.description_score,
      tip: data.description_score < 40
        ? 'Write at least 200 characters. Describe features, benefits, and what makes your product unique.'
        : 'Add more detail about features and benefits. Aim for 200+ characters.',
      priority: data.description_score < 40 ? 'high' : 'medium',
    });
  }
  if (data.image_score < 70) {
    suggestions.push({
      area: 'Images',
      score: data.image_score,
      tip: 'Add a high-quality product image. Listings with images get 5x more views.',
      priority: 'high',
    });
  }
  if (data.seo_score < 60) {
    suggestions.push({
      area: 'SEO',
      score: data.seo_score,
      tip: `Add at least 3 relevant tags${data.tags_count < 3 ? ` (you have ${data.tags_count})` : ''}. Add specifications and FAQs to improve discoverability.`,
      priority: data.seo_score < 40 ? 'high' : 'medium',
    });
  }
  if (data.pricing_score < 70) {
    suggestions.push({
      area: 'Pricing',
      score: data.pricing_score,
      tip: 'Consider competitive pricing. Research similar products in your category.',
      priority: 'medium',
    });
  }
  return suggestions.sort((a, b) => a.score - b.score);
}

export default function ProductOptimizationCard({ productId, productData, onImprove }: ProductOptimizationCardProps) {
  const [score, setScore] = useState<OptimizationScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const computeScore = useCallback(async () => {
    setLoading(true);
    try {
      if (productId) {
        const { data, error } = await supabase.rpc('ai_product_optimization_score', { p_product_id: productId });
        if (!error && data) {
          setScore(data as OptimizationScore);
          return;
        }
      }
      // Fallback: compute from productData client-side
      if (productData) {
        const titleLen = (productData.name || '').length;
        const descLen = (productData.description || '').length;
        const computed: OptimizationScore = {
          title_score: Math.min(100, Math.max(0,
            (titleLen >= 10 && titleLen <= 80 ? 80 : titleLen >= 5 ? 50 : 20) +
            (/\d/.test(productData.name || '') ? 10 : 0) +
            (/\b(best|premium|pro|ultimate|complete|guide)\b/i.test(productData.name || '') ? 10 : 0)
          )),
          description_score: Math.min(100, Math.max(0,
            (descLen >= 200 ? 80 : descLen >= 100 ? 60 : descLen >= 50 ? 40 : 15) +
            (/\b(feature|include|benefit|quality|professional)\b/i.test(productData.description || '') ? 15 : 0) +
            Math.min(5, Math.floor(descLen / 200))
          )),
          image_score: productData.image_url ? 90 : 20,
          pricing_score: Math.min(100, Math.max(0,
            (productData.is_free ? 90 :
             (productData.price || 0) > 0 && (productData.price || 0) <= 100 ? 85 :
             (productData.price || 0) > 100 && (productData.price || 0) <= 1000 ? 80 :
             (productData.price || 0) > 1000 && (productData.price || 0) <= 10000 ? 70 :
             (productData.price || 0) > 10000 ? 50 : 30) +
            ((productData.commission_rate || 0) >= 10 && (productData.commission_rate || 0) <= 30 ? 10 : 0)
          )),
          seo_score: Math.min(100, Math.max(0,
            ((productData.tags?.length || 0) >= 3 ? 30 : 5) +
            (productData.category ? 20 : 0) +
            (productData.description && /[a-z]{3,}/i.test(productData.description) ? 20 : 0) +
            (productData.specifications ? 20 : 0) +
            (productData.faqs && productData.faqs.length > 0 ? 10 : 0)
          )),
          tags_count: productData.tags?.length || 0,
          has_specifications: !!productData.specifications,
          has_faqs: !!(productData.faqs && productData.faqs.length > 0),
          description_length: descLen,
        };
        setScore(computed);
      }
    } finally {
      setLoading(false);
    }
  }, [productId, productData]);

  useEffect(() => { computeScore(); }, [computeScore]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!score) return null;

  const overall = Math.round(
    (score.title_score + score.description_score + score.image_score + score.pricing_score + score.seo_score) / 5
  );
  const grade = getGrade(overall);
  const suggestions = generateSuggestions(score);

  const scoreRows: Array<{ label: string; score: number; icon: any }> = [
    { label: 'Title', score: score.title_score, icon: Hash },
    { label: 'Description', score: score.description_score, icon: FileText },
    { label: 'SEO', score: score.seo_score, icon: Search },
    { label: 'Images', score: score.image_score, icon: ImageIcon },
    { label: 'Pricing', score: score.pricing_score, icon: DollarSign },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">AI Optimization Score</h3>
          <p className="text-xs text-gray-400">How well your listing is optimized</p>
        </div>
      </div>

      {/* Overall score */}
      <div className="flex items-center justify-between mb-4 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl">
        <div>
          <p className="text-3xl font-bold text-gray-900">{overall}<span className="text-lg text-gray-400">/100</span></p>
          <p className={`text-xs font-medium ${grade.color}`}>{grade.label}</p>
        </div>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map(i => (
            <Star
              key={i}
              className={`w-5 h-5 ${i <= scoreToStars(overall) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`}
            />
          ))}
        </div>
      </div>

      {/* Individual scores */}
      <div className="space-y-2 mb-4">
        {scoreRows.map(row => {
          const Icon = row.icon;
          const rowGrade = getGrade(row.score);
          return (
            <div key={row.label} className="flex items-center gap-3">
              <Icon className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-600 w-20">{row.label}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${row.score}%` }}
                  transition={{ duration: 0.5 }}
                  className={`h-full rounded-full ${
                    row.score >= 75 ? 'bg-green-500' : row.score >= 50 ? 'bg-amber-500' : 'bg-red-400'
                  }`}
                />
              </div>
              <span className={`text-xs font-medium w-12 text-right ${rowGrade.color}`}>{row.score}</span>
            </div>
          );
        })}
      </div>

      {/* Suggestions toggle */}
      {suggestions.length > 0 && (
        <>
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="w-full text-sm text-primary-600 hover:text-primary-700 flex items-center justify-center gap-1.5 py-2 border-t border-gray-100"
          >
            <TrendingUp className="w-4 h-4" />
            {showSuggestions ? 'Hide' : 'Show'} AI Suggestions ({suggestions.length})
          </button>

          <AnimatePresence>
            {showSuggestions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 pt-2">
                  {suggestions.map((s, i) => (
                    <div key={i} className={`p-2.5 rounded-xl border ${
                      s.priority === 'high' ? 'border-red-100 bg-red-50/50' :
                      s.priority === 'medium' ? 'border-amber-100 bg-amber-50/50' :
                      'border-gray-100 bg-gray-50/50'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          s.priority === 'high' ? 'bg-red-100 text-red-700' :
                          s.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{s.priority.toUpperCase()}</span>
                        <span className="text-sm font-medium text-gray-700">{s.area}</span>
                        <span className="text-xs text-gray-400 ml-auto">{s.score}/100</span>
                      </div>
                      <p className="text-xs text-gray-600">{s.tip}</p>
                    </div>
                  ))}
                </div>
                {onImprove && (
                  <button
                    onClick={() => onImprove(suggestions)}
                    className="w-full mt-3 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
                  >
                    Apply AI Improvements
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {suggestions.length === 0 && (
        <div className="flex items-center gap-2 py-2 border-t border-gray-100">
          <Sparkles className="w-4 h-4 text-green-500" />
          <p className="text-sm text-green-600">Your listing is well optimized!</p>
        </div>
      )}
    </div>
  );
}
