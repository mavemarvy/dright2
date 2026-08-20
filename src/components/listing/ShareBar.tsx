import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Share2, X, Copy, Check, MessageCircle, Mail, Link as LinkIcon,
  Facebook, Twitter, Linkedin,
} from 'lucide-react';
import { copyToClipboard } from '../../lib/affiliate';

interface ShareBarProps {
  listingId: string;
  listingName: string;
  referralCode?: string | null;
}

export default function ShareBar({ listingId, listingName, referralCode }: ShareBarProps) {
  const [copied, setCopied] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const generateLink = () => {
    if (referralCode) {
      return `${window.location.origin}/ref?ref=${referralCode}&product=${listingId}`;
    }
    return `${window.location.origin}/product/${listingId}`;
  };

  const handleCopy = async () => {
    const link = generateLink();
    const success = await copyToClipboard(link);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareTo = (platform: string) => {
    const link = generateLink();
    const text = `Check out "${listingName}" on DRIGHT`;
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text + ' ' + link)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
      x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`,
      email: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(link)}`,
    };
    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
            copied ? 'bg-success-muted text-success' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy Link</>}
        </button>
        <button
          onClick={() => setShowFull(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Share2 className="w-4 h-4" />Share
        </button>
      </div>

      <AnimatePresence>
        {showFull && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowFull(false)}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-primary-600" />Share Listing
                </h3>
                <button onClick={() => setShowFull(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">Share "{listingName}" with your network</p>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-600 bg-green-50' },
                  { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-600 bg-blue-50' },
                  { id: 'x', label: 'X', icon: Twitter, color: 'text-gray-900 bg-gray-100' },
                  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-blue-700 bg-blue-50' },
                  { id: 'email', label: 'Email', icon: Mail, color: 'text-orange-600 bg-orange-50' },
                ].map(p => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      onClick={() => shareTo(p.id)}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:scale-105 transition-transform ${p.color}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[10px] font-medium">{p.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                <LinkIcon className="w-4 h-4 text-gray-400 ml-2 shrink-0" />
                <input
                  type="text"
                  readOnly
                  value={generateLink()}
                  className="flex-1 bg-transparent text-sm text-gray-600 outline-none truncate"
                />
                <button
                  onClick={handleCopy}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    copied ? 'bg-success-muted text-success' : 'bg-primary-600 text-white hover:bg-primary-700'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {referralCode && (
                <p className="text-xs text-success mt-3 flex items-center gap-1">
                  <Check className="w-3 h-3" />Affiliate link with referral tracking
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
