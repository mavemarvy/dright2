import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, Link2, Loader2, AlertCircle, CheckCircle,
  FileText, Clock, Award, Play, ExternalLink, Lock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import VideoPlayer from './VideoPlayer';

interface AccessDownloadProps {
  orderId: string;
  downloadToken: string | null;
  productName: string;
  productType: string;
  hasPurchased: boolean;
}

interface VerifyResult {
  verified: boolean;
  product_name?: string;
  delivery_type?: string;
  download_url?: string | null;
  access_link?: string | null;
  video_url?: string | null;
  file_format?: string | null;
  download_limit?: number | null;
  expiry_days?: number;
  days_remaining?: number;
  includes_bonus_materials?: boolean;
  error?: string;
  expired?: boolean;
}

export default function AccessDownload({ orderId, downloadToken, productName, productType, hasPurchased }: AccessDownloadProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);

  const handleVerifyAndAccess = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          download_token: downloadToken,
          order_id: orderId,
          user_id: user?.id,
        }),
      });

      const data: VerifyResult = await response.json();

      if (!response.ok || !data.verified) {
        setError(data.error || 'Download link verification failed');
        return;
      }

      setResult(data);

      // Auto-open download or access link
      if (data.delivery_type === 'INSTANT_DOWNLOAD' && data.download_url) {
        // Open download in new tab
        window.open(data.download_url, '_blank');
      } else if (data.delivery_type === 'LINK_ACCESS' && data.access_link) {
        // Open access link in new tab
        window.open(data.access_link, '_blank');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify download link');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayVideo = () => {
    setShowVideo(true);
  };

  if (!hasPurchased) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
        <Lock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-600">Purchase this product to access downloads</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Verify & Download Button */}
      <button
        onClick={handleVerifyAndAccess}
        disabled={loading || !downloadToken}
        className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px] shadow-lg shadow-primary-600/20"
      >
        {loading ? (
          <><Loader2 className="w-5 h-5 animate-spin" />Verifying access...</>
        ) : (
          <><Download className="w-5 h-5" />Verify & Download</>
        )}
      </button>

      {/* Play Demo Video Button (if video exists) */}
      {result?.video_url && !showVideo && (
        <button
          onClick={handlePlayVideo}
          className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-2xl font-medium hover:border-primary-300 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
        >
          <Play className="w-5 h-5 text-primary-600" />Play Demo Video
        </button>
      )}

      {/* In-app Video Player */}
      <AnimatePresence>
        {showVideo && result?.video_url && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <VideoPlayer url={result.video_url} title={`${productName} — Demo Video`} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl p-4 bg-error-muted border border-error/20 text-error flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">{error}</p>
              <p className="text-xs mt-1 opacity-80">If this persists, contact the seller or support.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verified result display */}
      <AnimatePresence>
        {result && result.verified && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-success/20 bg-success-muted/30 p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-success">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold text-sm">Access Verified</span>
            </div>

            <div className="space-y-2">
              {/* Delivery type badge */}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileText className="w-4 h-4 text-gray-400" />
                Delivery: <span className="font-medium capitalize">{result.delivery_type?.replace(/_/g, ' ').toLowerCase()}</span>
                {result.file_format && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{result.file_format}</span>
                )}
              </div>

              {/* Expiry info */}
              {result.days_remaining !== undefined && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4 text-gray-400" />
                  {result.days_remaining > 0
                    ? `Access expires in ${result.days_remaining} day${result.days_remaining !== 1 ? 's' : ''}`
                    : 'Access expires today'}
                </div>
              )}

              {/* Download limit */}
              {result.download_limit && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Download className="w-4 h-4 text-gray-400" />
                  Download limit: {result.download_limit} downloads
                </div>
              )}

              {/* Bonus materials */}
              {result.includes_bonus_materials && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Award className="w-4 h-4 text-success" />
                  Includes bonus materials
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              {result.download_url && (
                <a
                  href={result.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors min-h-[44px]"
                >
                  <Download className="w-4 h-4" />Download File
                </a>
              )}
              {result.access_link && (
                <a
                  href={result.access_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors min-h-[44px]"
                >
                  <ExternalLink className="w-4 h-4" />Open Access Link
                </a>
              )}
            </div>

            {/* For course products, show access link prominently */}
            {productType === 'COURSE' && result.access_link && (
              <div className="pt-2">
                <a
                  href={result.access_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-xl font-semibold hover:from-primary-700 hover:to-primary-600 transition-all min-h-[48px]"
                >
                  <Link2 className="w-5 h-5" />Access Course Platform
                </a>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
