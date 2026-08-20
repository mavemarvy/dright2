import { useState } from 'react';
import { MessageCircle, Lock, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { startOrFindConversation } from '../lib/chatHooks';
import type { ChatContextType, ChatContextData } from '../lib/types';

interface ContactSellerProps {
  sellerId: string;
  contextType?: ChatContextType;
  contextId?: string;
  contextData?: ChatContextData;
  customLabel?: string;
  outline?: boolean;
  // legacy compat
  productId?: string;
  productName?: string;
  sellerName?: string;
}

export default function ContactSeller({
  sellerId,
  contextType = 'product_inquiry',
  contextId,
  contextData,
  customLabel,
  outline,
  productId,
  productName,
  sellerName,
}: ContactSellerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const handleClick = async () => {
    if (!user) {
      setShowAuth(true);
      return;
    }

    // Don't allow messaging yourself
    if (user.id === sellerId) return;

    setLoading(true);
    try {
      // Build context data from legacy props if not provided
      const resolvedContextData: ChatContextData = contextData || {
        title: productName,
        seller_name: sellerName,
      };
      const resolvedContextId = contextId || productId || null;

      const convId = await startOrFindConversation({
        currentUserId: user.id,
        otherUserId: sellerId,
        contextType,
        contextId: resolvedContextId,
        contextData: resolvedContextData,
        productId: productId || (contextType === 'product_inquiry' ? resolvedContextId : null),
      });

      if (convId) {
        navigate(`/chat?conv=${convId}`);
      }
    } catch (err) {
      console.error('ContactSeller error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (showAuth) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center space-y-3">
        <div className="w-10 h-10 bg-primary-50 rounded-full flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5 text-primary-400" />
        </div>
        <p className="text-sm text-gray-700 font-medium">Sign in to message the seller</p>
        <div className="flex gap-2">
          <Link
            to="/sign-up"
            className="flex-1 text-center bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Sign Up
          </Link>
          <Link
            to="/sign-in"
            className="flex-1 text-center bg-white border border-gray-200 text-gray-900 font-semibold rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || user?.id === sellerId}
      className={`flex items-center justify-center gap-2 w-full font-semibold rounded-xl px-6 py-3.5 transition-colors min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed ${
        outline
          ? 'bg-transparent border border-green-500/40 text-green-400 hover:bg-green-500/10'
          : 'bg-white border border-gray-200 text-gray-900 hover:bg-gray-50'
      }`}
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <MessageCircle className="w-5 h-5" />
      )}
      {customLabel || 'Contact Seller'}
    </button>
  );
}
