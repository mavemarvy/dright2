import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Camera,
  Send,
  Image,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Verification {
  id: string;
  screenshot_url: string;
  transaction_details: string;
  status: string;
  submitted_at: string;
}

export default function VerifyPage() {
  const { user } = useAuth();
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      fetchVerifications();
    }
  }, [user]);

  const fetchVerifications = async () => {
    try {
      const { data, error } = await supabase
        .from('verifications')
        .select('*')
        .eq('promoter_id', user?.id)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setVerifications(data as Verification[]);
      }
    } catch (error) {
      console.error('Error fetching verifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be under 5MB');
        return;
      }

      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      setSelectedFile(file);
      setError(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !transactionDetails.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Upload image to Supabase Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('verification-screenshots')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('verification-screenshots')
        .getPublicUrl(fileName);

      // Insert verification record
      const { error: insertError } = await supabase.from('verifications').insert({
        promoter_id: user?.id,
        screenshot_url: urlData.publicUrl,
        transaction_details: transactionDetails,
      });

      if (insertError) throw insertError;

      // Success
      setSuccess(true);
      setSelectedFile(null);
      setPreviewUrl(null);
      setTransactionDetails('');
      setTimeout(() => {
        setSuccess(false);
        fetchVerifications();
      }, 2000);
    } catch (error) {
      console.error('Error submitting verification:', error);
      setError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-error" />;
      default:
        return <Clock className="w-5 h-5 text-warning" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-success-muted text-success border-success/20';
      case 'rejected':
        return 'bg-error-muted text-error border-error/20';
      default:
        return 'bg-warning-muted text-warning border-warning/20';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Submit Verification</h1>
        <p className="text-gray-500 mt-1">Upload proof of sale for approval</p>
      </div>

      {/* Success Message */}
      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-success-muted border border-success/20 text-success rounded-2xl p-4 mb-6 flex items-center gap-3"
        >
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">Verification submitted successfully!</span>
        </motion.div>
      )}

      {/* Upload Form */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
      >
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-error-muted text-error rounded-xl p-4 mb-6 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5" />
            {error}
          </motion.div>
        )}

        {/* Upload Area */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Screenshot of Transaction
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          {previewUrl ? (
            <div className="relative">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full max-h-64 object-cover rounded-2xl border border-gray-200"
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
                className="absolute top-2 right-2 p-2 bg-white/90 rounded-full shadow-sm hover:bg-white transition-colors"
              >
                <XCircle className="w-5 h-5 text-error" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 hover:border-primary-400 rounded-2xl p-8 text-center transition-colors bg-gray-50 hover:bg-primary-50"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-primary-100 rounded-2xl">
                  <Camera className="w-8 h-8 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Tap to take photo or upload</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Accepts JPG, PNG up to 5MB
                  </p>
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Transaction Details */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            <FileText className="w-4 h-4 inline mr-2" />
            Transaction ID or Buyer Details
          </label>
          <textarea
            value={transactionDetails}
            onChange={(e) => setTransactionDetails(e.target.value)}
            placeholder="Enter the transaction ID, order number, or buyer details (e.g., Order #12345 from John Doe)"
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 resize-none"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || !selectedFile || !transactionDetails.trim()}
          className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
        >
          {submitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Send className="w-5 h-5" />
              Submit for Review
            </>
          )}
        </button>
      </motion.form>

      {/* Previous Verifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl shadow-sm border border-gray-100"
      >
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Your Submissions</h2>
          <p className="text-sm text-gray-500 mt-1">
            {verifications.length} verification{verifications.length !== 1 ? 's' : ''} submitted
          </p>
        </div>

        {verifications.length === 0 ? (
          <div className="p-8 text-center">
            <Image className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No submissions yet</p>
            <p className="text-sm text-gray-400 mt-1">Your verification requests will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {verifications.map((verification, index) => (
              <motion.div
                key={verification.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.05 }}
                className="p-4"
              >
                <div className="flex items-start gap-4">
                  {/* Screenshot Thumbnail */}
                  <img
                    src={verification.screenshot_url}
                    alt="Screenshot"
                    className="w-16 h-16 rounded-xl object-cover border border-gray-200"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-500 mb-1">Transaction Details</p>
                        <p className="font-medium text-gray-900 truncate">
                          {verification.transaction_details}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${getStatusStyles(verification.status)}`}
                      >
                        {getStatusIcon(verification.status)}
                        {verification.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      Submitted {formatDate(verification.submitted_at)}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
