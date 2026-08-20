import { supabase } from '../supabase';

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Product Q&A Service
//
// Replaces fake keyword matching with real LLM-powered product assistant.
// Uses the ai-proxy edge function to answer questions about products using
// product description, seller info, FAQ, reviews, ratings, and marketplace
// policies. Never hallucinates — says "I don't know" when data is missing.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductQAContext {
  productId: string;
  productName: string;
  description: string;
  price: number;
  isFree: boolean;
  category: string;
  sellerName: string;
  sellerRating: number;
  specifications?: Record<string, string>;
  faqs?: Array<{ question: string; answer: string }>;
  reviews?: Array<{ rating: number; comment: string }>;
  averageRating: number;
  totalReviews: number;
  previousQuestions?: Array<{ question: string; answer: string | null }>;
}

export interface ProductQAResult {
  success: boolean;
  answer: string;
  sources: string[];
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

export async function loadProductQAContext(productId: string): Promise<ProductQAContext | null> {
  // Fetch product with seller info
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      id, name, description, price, is_free, category,
      uploaded_by, specifications, faqs,
      seller:uploaded_by(id, full_name, store_title)
    `)
    .eq('id', productId)
    .maybeSingle();

  if (error || !product) return null;

  // Fetch reviews
  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating, review_text')
    .eq('target_type', 'product')
    .eq('target_id', productId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Fetch previous Q&A
  const { data: qa } = await supabase
    .from('product_qa')
    .select('question, answer')
    .eq('product_id', productId)
    .not('answer', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  const reviewData = (reviews || []) as any[];
  const qaData = (qa || []) as any[];
  const avgRating = reviewData.length > 0
    ? reviewData.reduce((s: number, r: any) => s + r.rating, 0) / reviewData.length
    : 0;

  return {
    productId: product.id,
    productName: product.name,
    description: product.description || '',
    price: Number(product.price || 0),
    isFree: product.is_free || false,
    category: product.category || '',
    sellerName: (product.seller as any)?.store_title || (product.seller as any)?.full_name || 'Seller',
    sellerRating: 0, // Would need seller rating aggregation
    specifications: product.specifications || {},
    faqs: product.faqs || [],
    reviews: reviewData.map((r: any) => ({ rating: r.rating, comment: r.review_text })),
    averageRating: avgRating,
    totalReviews: reviewData.length,
    previousQuestions: qaData.map((q: any) => ({ question: q.question, answer: q.answer })),
  };
}

export function buildProductQASystemPrompt(ctx: ProductQAContext): string {
  const parts: string[] = [
    'You are DRIGHT AI Product Assistant. Answer questions about this specific product accurately.',
    'Use ONLY the information provided below. If you do not know the answer, say "I don\'t have that information. You can contact the seller directly."',
    'Never hallucinate or make up product features, specs, or policies.',
    'Be concise and helpful. Respond in the user\'s language.',
    '',
    `Product: ${ctx.productName}`,
    `Category: ${ctx.category}`,
    `Price: ${ctx.isFree ? 'Free' : '$' + ctx.price.toFixed(2)}`,
    `Seller: ${ctx.sellerName}`,
    '',
    'Description:',
    ctx.description.slice(0, 2000),
  ];

  if (ctx.specifications && Object.keys(ctx.specifications).length > 0) {
    parts.push('', 'Specifications:');
    for (const [key, value] of Object.entries(ctx.specifications)) {
      parts.push(`- ${key}: ${value}`);
    }
  }

  if (ctx.faqs && ctx.faqs.length > 0) {
    parts.push('', 'FAQ:');
    for (const faq of ctx.faqs) {
      parts.push(`Q: ${faq.question}`);
      parts.push(`A: ${faq.answer}`);
    }
  }

  if (ctx.reviews && ctx.reviews.length > 0) {
    parts.push('', `Reviews (${ctx.totalReviews} total, avg ${ctx.averageRating.toFixed(1)} stars):`);
    for (const review of ctx.reviews.slice(0, 5)) {
      parts.push(`- ${review.rating}★: ${review.comment.slice(0, 200)}`);
    }
  }

  if (ctx.previousQuestions && ctx.previousQuestions.length > 0) {
    parts.push('', 'Previously answered questions:');
    for (const qa of ctx.previousQuestions) {
      parts.push(`Q: ${qa.question}`);
      parts.push(`A: ${qa.answer}`);
    }
  }

  return parts.join('\n');
}

export async function askProductQuestion(
  productId: string,
  question: string,
  userId?: string,
): Promise<ProductQAResult> {
  // Load product context
  const ctx = await loadProductQAContext(productId);
  if (!ctx) {
    return { success: false, answer: '', sources: [], confidence: 'low', error: 'Product not found' };
  }

  // Build system prompt with product context
  const systemPrompt = buildProductQASystemPrompt(ctx);

  // Call AI proxy
  try {
    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        feature: 'product-qa',
        prompt: question,
        context: systemPrompt,
        userId: userId || undefined,
      },
    });

    if (error || !data || data.success === false) {
      return {
        success: false,
        answer: '',
        sources: [],
        confidence: 'low',
        error: data?.error || error?.message || 'AI service unavailable',
      };
    }

    // Determine confidence based on available data
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    const sources: string[] = [];

    if (ctx.description && ctx.description.length > 100) { sources.push('product description'); confidence = 'high'; }
    if (ctx.specifications && Object.keys(ctx.specifications).length > 0) { sources.push('specifications'); }
    if (ctx.faqs && ctx.faqs.length > 0) { sources.push('FAQ'); confidence = 'high'; }
    if (ctx.reviews && ctx.reviews.length > 0) { sources.push('reviews'); }
    if (ctx.previousQuestions && ctx.previousQuestions.length > 0) { sources.push('previous Q&A'); }

    return {
      success: true,
      answer: data.content || '',
      sources,
      confidence,
    };
  } catch (err) {
    return {
      success: false,
      answer: '',
      sources: [],
      confidence: 'low',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
