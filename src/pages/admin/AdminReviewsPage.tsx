import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Flag,
  Search,
  ShieldCheck,
  Star,
  Star as StarIcon,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Review {
  id: string;
  reviewer_id: string;
  target_type: string;
  target_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  reviewer_email?: string;
  reviewer_name?: string;
  target_label?: string;
}

interface ReviewReport {
  id: string;
  review_id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  admin_notes: string | null;
  ai_confidence_score: number | null;
  created_at: string;
  resolved_at: string | null;
  reporter_name?: string;
  reporter_email?: string;
  review?: Review;
}

type Tab = 'reviews' | 'reports';

export default function AdminReviewsPage() {
  const [tab, setTab] = useState<Tab>('reviews');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'seller' | 'sales_team'>('all');
  const [reportFilter, setReportFilter] = useState<'active' | ReviewReport['status'] | 'all'>('active');
  const [updatingReport, setUpdatingReport] = useState<string | null>(null);

  const enrichReviews = useCallback(async (rows: any[]): Promise<Review[]> => {
    if (rows.length === 0) return [];
    const reviewerIds = [...new Set(rows.map(row => row.reviewer_id))];
    const productIds = [...new Set(rows.filter(row => row.target_type === 'product').map(row => row.target_id))];
    const sellerIds = [...new Set(rows.filter(row => row.target_type === 'seller').map(row => row.target_id))];

    const [{ data: users }, { data: products }, { data: sellers }] = await Promise.all([
      supabase.from('users').select('id,email,full_name').in('id', reviewerIds),
      productIds.length > 0 ? supabase.from('products').select('id,name').in('id', productIds) : Promise.resolve({ data: [] as any[] }),
      sellerIds.length > 0 ? supabase.from('users').select('id,email').in('id', sellerIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const userMap = new Map((users || []).map(user => [user.id, { email: user.email, name: user.full_name }]));
    const productMap = new Map((products || []).map(product => [product.id, product.name]));
    const sellerMap = new Map((sellers || []).map(seller => [seller.id, seller.email]));

    return rows.map(row => ({
      ...row,
      reviewer_email: userMap.get(row.reviewer_id)?.email || 'Unknown',
      reviewer_name: userMap.get(row.reviewer_id)?.name || 'Unknown',
      target_label: row.target_type === 'product'
        ? productMap.get(row.target_id) || 'Unknown Product'
        : row.target_type === 'seller'
          ? sellerMap.get(row.target_id) || 'Unknown Seller'
          : row.target_type === 'sales_team'
            ? 'Sales Team'
            : row.target_id,
    })) as Review[];
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: reviewRows, error: reviewError }, { data: reportRows, error: reportError }] = await Promise.all([
        supabase.from('reviews').select('*').order('created_at', { ascending: false }),
        supabase.from('review_reports').select('*').order('created_at', { ascending: false }),
      ]);
      if (reviewError) throw reviewError;
      if (reportError) throw reportError;

      const mappedReviews = await enrichReviews(reviewRows || []);
      const reviewMap = new Map(mappedReviews.map(review => [review.id, review]));
      const reporterIds = [...new Set((reportRows || []).map(report => report.reporter_id))];
      const { data: reporters } = reporterIds.length > 0
        ? await supabase.from('users').select('id,email,full_name').in('id', reporterIds)
        : { data: [] as any[] };
      const reporterMap = new Map((reporters || []).map(reporter => [reporter.id, reporter]));

      setReviews(mappedReviews);
      setReports((reportRows || []).map(report => ({
        ...report,
        reporter_name: reporterMap.get(report.reporter_id)?.full_name || 'Unknown',
        reporter_email: reporterMap.get(report.reporter_id)?.email || 'Unknown',
        review: reviewMap.get(report.review_id),
      })) as ReviewReport[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review moderation data');
      setReviews([]);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [enrichReviews]);

  useEffect(() => {
    void fetchAll();
    const channel = supabase
      .channel('admin-review-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_reports' }, () => void fetchAll())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchAll]);

  const updateReport = async (id: string, status: ReviewReport['status']) => {
    setUpdatingReport(id);
    setError(null);
    const { error: updateError } = await supabase.from('review_reports').update({ status }).eq('id', id);
    if (updateError) setError(updateError.message);
    else await fetchAll();
    setUpdatingReport(null);
  };

  const formatDate = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const filteredReviews = useMemo(() => reviews.filter(review => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q
      || (review.review_text?.toLowerCase().includes(q) ?? false)
      || review.reviewer_email?.toLowerCase().includes(q)
      || review.target_label?.toLowerCase().includes(q);
    const matchesRating = ratingFilter === 'all' || review.rating === parseInt(ratingFilter);
    const matchesType = typeFilter === 'all' || review.target_type === typeFilter;
    return matchesSearch && matchesRating && matchesType;
  }), [reviews, searchQuery, ratingFilter, typeFilter]);

  const filteredReports = useMemo(() => reports.filter(report => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q
      || report.reason.toLowerCase().includes(q)
      || (report.description?.toLowerCase().includes(q) ?? false)
      || report.reporter_email?.toLowerCase().includes(q)
      || report.review?.review_text?.toLowerCase().includes(q);
    const matchesStatus = reportFilter === 'all'
      || (reportFilter === 'active' && ['pending', 'reviewing'].includes(report.status))
      || report.status === reportFilter;
    return matchesSearch && matchesStatus;
  }), [reports, searchQuery, reportFilter]);

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
    : '0.0';
  const activeReports = reports.filter(report => ['pending', 'reviewing'].includes(report.status)).length;
  const ratingCounts = {
    5: reviews.filter(review => review.rating === 5).length,
    1: reviews.filter(review => review.rating === 1).length,
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Star className="w-6 h-6 text-warning" /> Reviews & Reports</h1>
          <p className="text-gray-500 mt-1">Monitor verified reviews and process reported-review moderation cases.</p>
        </div>
        <div className="flex rounded-xl bg-gray-100 p-1">
          <button onClick={() => setTab('reviews')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'reviews' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Reviews</button>
          <button onClick={() => setTab('reports')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${tab === 'reports' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            <Flag className="w-3.5 h-3.5" /> Reports {activeReports > 0 && <span className="rounded-full bg-red-100 text-red-700 px-1.5 text-xs">{activeReports}</span>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          ['Total Reviews', reviews.length, Star, 'text-warning'],
          ['Average Rating', avgRating, StarIcon, 'text-warning'],
          ['5-Star', ratingCounts[5], CheckCircle2, 'text-success'],
          ['Active Reports', activeReports, Flag, activeReports > 0 ? 'text-error' : 'text-gray-400'],
        ].map(([label, value, Icon, color], index) => {
          const IconComponent = Icon as typeof Star;
          return (
            <motion.div key={String(label)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2"><IconComponent className={`w-6 h-6 ${String(color)}`} /><span className="text-sm text-gray-500">{String(label)}</span></div>
              <p className="text-3xl font-bold text-gray-900">{String(value)}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder={tab === 'reviews' ? 'Search reviews...' : 'Search reports...'} className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white text-gray-900" />
        </div>
        {tab === 'reviews' ? (
          <>
            <div className="flex gap-2 overflow-x-auto">
              {(['all', 'product', 'seller', 'sales_team'] as const).map(type => <button key={type} onClick={() => setTypeFilter(type)} className={`px-3 py-3 rounded-xl text-sm font-medium whitespace-nowrap capitalize ${typeFilter === type ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>{type === 'all' ? 'All Types' : type.replace('_', ' ')}</button>)}
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {(['all', '1', '2', '3', '4', '5'] as const).map(rating => <button key={rating} onClick={() => setRatingFilter(rating)} className={`px-3 py-3 rounded-xl text-sm font-medium ${ratingFilter === rating ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>{rating === 'all' ? 'All' : `${rating}★`}</button>)}
            </div>
          </>
        ) : (
          <div className="flex gap-2 overflow-x-auto">
            {(['active', 'pending', 'reviewing', 'resolved', 'dismissed', 'all'] as const).map(status => <button key={status} onClick={() => setReportFilter(status)} className={`px-3 py-3 rounded-xl text-sm font-medium whitespace-nowrap capitalize ${reportFilter === status ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>{status}</button>)}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-red-500 shrink-0" /><p className="text-sm text-red-700">{error}</p></div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" /></div>
      ) : tab === 'reviews' ? (
        filteredReviews.length === 0 ? <Empty icon={Star} title="No reviews found" /> : (
          <div className="space-y-3">
            {filteredReviews.map((review, idx) => (
              <motion.div key={review.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1"><div className="flex">{[1,2,3,4,5].map(star => <StarIcon key={star} className={`w-4 h-4 ${star <= review.rating ? 'text-warning fill-warning' : 'text-gray-200'}`} />)}</div><span className="text-sm font-medium text-gray-900">{review.reviewer_name}</span><span className="text-xs text-gray-400">{review.reviewer_email}</span></div>
                    <p className="text-xs text-gray-500 capitalize">{review.target_type.replace('_', ' ')}{review.target_label && `: ${review.target_label}`}</p>
                  </div>
                  <p className="text-xs text-gray-400 shrink-0">{formatDate(review.created_at)}</p>
                </div>
                {review.review_text && <p className="text-sm text-gray-700 mt-2">{review.review_text}</p>}
              </motion.div>
            ))}
          </div>
        )
      ) : filteredReports.length === 0 ? <Empty icon={Flag} title="No review reports in this queue" /> : (
        <div className="space-y-3">
          {filteredReports.map(report => (
            <div key={report.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><Flag className="w-4 h-4 text-red-500" /><h3 className="font-semibold text-gray-900 capitalize">{report.reason.replace(/_/g, ' ')}</h3><StatusBadge status={report.status} /></div>
                  <p className="text-xs text-gray-400 mt-1">Reported by {report.reporter_name} ({report.reporter_email}) · {formatDate(report.created_at)}</p>
                </div>
                {report.ai_confidence_score != null && <span className="text-xs rounded-full bg-indigo-50 text-indigo-700 px-2 py-1">AI confidence {Number(report.ai_confidence_score).toFixed(2)}</span>}
              </div>
              {report.description && <p className="text-sm text-gray-700 mt-3">{report.description}</p>}
              {report.review && (
                <div className="mt-4 rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <div className="flex items-center gap-2"><div className="flex">{[1,2,3,4,5].map(star => <StarIcon key={star} className={`w-3.5 h-3.5 ${star <= report.review!.rating ? 'text-warning fill-warning' : 'text-gray-200'}`} />)}</div><span className="text-xs text-gray-500">{report.review.reviewer_name} · {report.review.target_label}</span></div>
                  <p className="text-sm text-gray-700 mt-2">{report.review.review_text || 'No written review text.'}</p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {report.status === 'pending' && <button disabled={updatingReport === report.id} onClick={() => void updateReport(report.id, 'reviewing')} className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"><Clock3 className="w-3.5 h-3.5" /> Start Review</button>}
                {!['resolved','dismissed'].includes(report.status) && <button disabled={updatingReport === report.id} onClick={() => void updateReport(report.id, 'resolved')} className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"><ShieldCheck className="w-3.5 h-3.5" /> Mark Resolved</button>}
                {!['resolved','dismissed'].includes(report.status) && <button disabled={updatingReport === report.id} onClick={() => void updateReport(report.id, 'dismissed')} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"><XCircle className="w-3.5 h-3.5" /> Dismiss Report</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ReviewReport['status'] }) {
  const classes: Record<ReviewReport['status'], string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    reviewing: 'bg-blue-50 text-blue-700 border-blue-200',
    resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dismissed: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${classes[status]}`}>{status}</span>;
}

function Empty({ icon: Icon, title }: { icon: typeof Star; title: string }) {
  return <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center"><Icon className="w-14 h-14 text-gray-300 mx-auto mb-3" /><p className="text-gray-900 font-semibold">{title}</p></div>;
}
