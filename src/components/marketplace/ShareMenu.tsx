import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Share2, X, Copy, Check, MessageCircle,
  Send, Mail, Link as LinkIcon,
} from 'lucide-react';
import { copyToClipboard, getOrCreateAffiliateLink } from '../../lib/affiliate';
import { useAuth } from '../../contexts/AuthContext';

interface ShareMenuProps {
  productId: string;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
  referralCode?: string | null;
}

export default function ShareMenu({ productId, productName, isOpen, onClose, referralCode }: ShareMenuProps) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [affiliateTracked, setAffiliateTracked] = useState(false);
  const [affiliateMessage, setAffiliateMessage] = useState<string | null>(null);

  const generateLink = async () => {
    const normalLink = `${window.location.origin}/product/${productId}`;

    if (!referralCode || !user?.id) {
      setShareLink(normalLink);
      setAffiliateTracked(false);
      setAffiliateMessage(null);
      return normalLink;
    }

    try {
      const link = await getOrCreateAffiliateLink(user.id, productId);
      setShareLink(link);
      setAffiliateTracked(true);
      setAffiliateMessage(null);
      return link;
    } catch (error) {
      setShareLink(normalLink);
      setAffiliateTracked(false);
      setAffiliateMessage(
        error instanceof Error
          ? error.message
          : 'Your current affiliate level does not include this product. A normal share link will be used instead.',
      );
      return normalLink;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setCopied(false);
    void generateLink();
  }, [isOpen, productId, referralCode, user?.id]);

  const handleCopy = async () => {
    const link = shareLink || await generateLink();
    const success = await copyToClipboard(link);
    if (success) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareTo = async (platform: string) => {
    const link = shareLink || await generateLink();
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
            onClick={event => event.stopPropagation()}
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

            <div className="grid grid-cols-3 gap-3 mb-5">
              {platforms.map(platform => {
                const Icon = platform.icon;
                return (
                  <button
                    key={platform.id}
                    onClick={() => void shareTo(platform.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl hover:scale-105 transition-transform ${platform.color}`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-xs font-medium">{platform.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
              <LinkIcon className="w-4 h-4 text-gray-400 ml-2 shrink-0" />
              <input
                type="text"
                readOnly
                value={shareLink || `${window.location.origin}/product/${productId}`}
                className="flex-1 bg-transparent text-sm text-gray-600 outline-none truncate"
              />
              <button
                onClick={() => void handleCopy()}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  copied ? 'bg-success-muted text-success' : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
              </button>
            </div>

            {referralCode && (
              <p className={'text-xs mt-3 flex items-start gap-1.5 ' + (affiliateTracked ? 'text-success' : 'text-amber-600')}>
                {affiliateTracked
                  ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  : <LinkIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span>
                  {affiliateTracked
                    ? 'Affiliate tracking is active for this product at your current level.'
                    : (affiliateMessage || 'Normal share link only. Increase your affiliate level to unlock this product for affiliate sales.')}
                </span>
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
