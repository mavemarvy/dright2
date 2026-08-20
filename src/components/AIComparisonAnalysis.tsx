import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, X, Check, AlertTriangle, ThumbsUp, ThumbsDown, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { validatePrompt } from '../lib/ai/safety';
import type { ComparisonProduct } from './marketplace/ProductComparison';

interface AIComparisonAnalysisProps {
  products: ComparisonProduct[];
}

interface AIAnalysis {
  pros: Record<string, string[]>;
  cons: Record<string, string[]>;
  recommendation: string;
  bestFor: Record<string, string>;
  valueForMoney: Record<string, string>;
}

export default function AIComparisonAnalysis({ products }: AIComparisonAnalysisProps) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const generateAnalysis = useCallback(async () => {
    if (products.length < 2) return;
    setLoading(true);
    setShow(true);
    try {
      const productData = products.map(p => ({
        name: p.name,
        price: p.is_free ? 'FREE' : `$${p.price}`,
        rating: p.average_rating,
        reviews: p.total_reviews,
        sales: p.total_sales,
        category: p.category,
        type: p.product_type,
        seller: p.seller_name,
        verified: p.seller_verified,
        commission: p.commission_rate,
        stock: p.stock_quantity,
        specs: p.specifications,
      }));

      const prompt = `Compare these marketplace products and provide analysis:\n${JSON.stringify(productData, null, 2)}\n\nFor each product provide: pros, cons, who should buy it, and value for money rating. Then give an overall recommendation.`;

      const safety = validatePrompt(prompt);

      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: JSON.stringify({
          feature: 'product_comparison',
          prompt: safety.sanitizedPrompt,
          systemPrompt: 'You are a product comparison expert. Analyze marketplace products and provide structured, unbiased comparisons. Return JSON with fields: pros (object keyed by product name with array of pros), cons (same structure), recommendation (string), bestFor (object keyed by product name), valueForMoney (object keyed by product name with rating like "Excellent", "Good", "Fair").',
        }),
      });

      if (error) throw new Error(error.message);

      let parsed: AIAnalysis;
      try {
        const content = (data as any)?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {
          pros: {},
          cons: {},
          recommendation: content,
          bestFor: {},
          valueForMoney: {},
        };
      } catch {
        parsed = {
          pros: {},
          cons: {},
          recommendation: (data as any)?.content || 'Unable to generate analysis.',
          bestFor: {},
          valueForMoney: {},
        };
      }
      setAnalysis(parsed);
    } catch (err) {
      setAnalysis({
        pros: {},
        cons: {},
        recommendation: 'AI analysis is temporarily unavailable. You can still compare products using the table above.',
        bestFor: {},
        valueForMoney: {},
      });
    } finally {
      setLoading(false);
    }
  }, [products]);

  if (products.length < 2) return null;

  return (
    <div className="mb-6">
      <button
        onClick={generateAnalysis}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl font-semibold hover:shadow-lg transition-all"
      >
        <Sparkles className="w-5 h-5" />
        AI Compare These Products
      </button>

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" /> AI Comparison Analysis
                </h3>
                <button onClick={() => setShow(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  <span className="ml-2 text-sm text-gray-500">Analyzing products...</span>
                </div>
              )}

              {analysis && !loading && (
                <div className="space-y-4">
                  {/* Pros and Cons grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {products.map(p => (
                      <div key={p.id} className="border border-gray-100 rounded-xl p-4">
                        <h4 className="font-semibold text-gray-900 text-sm mb-3 line-clamp-1">{p.name}</h4>
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-medium text-green-600 flex items-center gap-1 mb-1">
                              <ThumbsUp className="w-3 h-3" /> Pros
                            </p>
                            {(analysis.pros[p.name] || []).length > 0 ? (
                              <ul className="space-y-1">
                                {(analysis.pros[p.name] || []).map((pro, i) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                                    <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" /> {pro}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-gray-400">No specific pros identified.</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-red-500 flex items-center gap-1 mb-1">
                              <ThumbsDown className="w-3 h-3" /> Cons
                            </p>
                            {(analysis.cons[p.name] || []).length > 0 ? (
                              <ul className="space-y-1">
                                {(analysis.cons[p.name] || []).map((con, i) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                                    <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" /> {con}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-gray-400">No specific cons identified.</p>
                            )}
                          </div>
                          {analysis.bestFor[p.name] && (
                            <div>
                              <p className="text-xs font-medium text-blue-600 mb-1">Best For</p>
                              <p className="text-xs text-gray-600">{analysis.bestFor[p.name]}</p>
                            </div>
                          )}
                          {analysis.valueForMoney[p.name] && (
                            <div className="flex items-center gap-1.5">
                              <DollarSign className="w-3 h-3 text-amber-500" />
                              <span className="text-xs text-gray-500">Value:</span>
                              <span className="text-xs font-medium text-gray-800">{analysis.valueForMoney[p.name]}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recommendation */}
                  {analysis.recommendation && (
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
                      <p className="text-xs font-semibold text-purple-700 mb-1 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" /> AI Recommendation
                      </p>
                      <p className="text-sm text-gray-700 leading-relaxed">{analysis.recommendation}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
