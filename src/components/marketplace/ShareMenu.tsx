import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Share2, X, Copy, Check, MessageCircle,
  Send, Mail, Link as LinkIcon,
} from 'lucide-react';
import { copyToClipboard } from '../../lib/affiliate';
import { supabase } from '../../lib/supabase';

interface ShareMenuProps {
  productId: string;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
  referralCode?: string | null;
}

export default function ShareMenu({ productId, productName, isOpen, onClose, referralCode }: ShareMenuProps) {
  const [copied, setCopied] = useState(false);
  const [shareLink, setShareLink] = useState('');

  const generateLink = async () => {
    let link = `${window.location.origin}/product/${productId}`;
    if (referralCode) {
      link = `${window.location.origin}/ref?ref=${referralCode}&product=${productId}`;
    }
    setShareLink(link);
    return link;
  };

  const handleCopy = async () => {
    const link = shareLink || await generateLink();
    const success = await copyToClipboard(link);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareTo = (platform: string) => {
    const link = shareLink || `${window.location.origin}/product/${productId}`;
    const text = `Check out "${productName}" on DRIGHT`;
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text + ' ' + link)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
      x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`,
      email: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(link)}`,
    };
    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'noopener,noreferrer');
    }
  };

  const platforms = [
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-600 bg-green-50' },
  { id: 'facebook', label: 'Facebook', icon: MessageCircle, color: 'text-blue-600 bg-blue-50' },
    { id: 'telegram', label: 'Telegram', icon: Send, color: 'text-sky-600 bg-sky-50' },
  { id: 'x', label: 'X', icon: Send, color: 'text-gray-900 bg-gray-100' },
  { id: 'linkedin', label: 'LinkedIn', icon: Mail, color: 'text-blue-700 bg-blue-50' },
    { id: 'email', label: 'Email', icon: Mail, color: 'text-orange-600 bg-orange-50' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-primary-600" /> Share Product
              </h3>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">Share "{productName}" with your network</p>

            {/* Social platforms */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {platforms.map(p => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => shareTo(p.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl hover:scale-105 transition-transform ${p.color}`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-xs font-medium">{p.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Copy link */}
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
              <LinkIcon className="w-4 h-4 text-gray-400 ml-2 shrink-0" />
              <input
                type="text"
                readOnly
                value={shareLink || `${window.location.origin}/product/${productId}`}
                className="flex-1 bg-transparent text-sm text-gray-600 outline-none truncate"
              />
              <button
                onClick={handleCopy}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  copied ? 'bg-success-muted text-success' : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
              </button>
            </div>

            {referralCode && (
              <p className="text-xs text-success mt-3 flex items-center gap-1">
                <Check className="w-3 h-3" /> Affiliate link with referral tracking
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Unused import guard
void supabase;
