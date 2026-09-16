import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Send, Unlink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface ChannelIdentity {
  id: string;
  channel: string;
  external_username?: string | null;
  status: string;
  linked_at?: string | null;
  verified_at?: string | null;
  last_seen_at?: string | null;
}

export default function TelegramSupportLink() {
  const { user } = useAuth();
  const [identity, setIdentity] = useState<ChannelIdentity | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!user) {
      setIdentity(null);
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('support-channel-link', {
        body: { action: 'status', channel: 'telegram' },
      });
      if (invokeError) throw invokeError;
      if (!data?.success) throw new Error(data?.error || 'Could not check Telegram connection.');
      setIdentity(data.connected ? data.identity : null);
      if (data.connected) {
        setCode(null);
        setExpiresAt(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check Telegram connection.');
    } finally {
      setChecking(false);
    }
  }, [user]);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const createLink = async () => {
    if (!user || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('support-channel-link', {
        body: { action: 'create', channel: 'telegram' },
      });
      if (invokeError) throw invokeError;
      if (!data?.success || !data?.code) throw new Error(data?.error || 'Could not create a Telegram link code.');
      setCode(String(data.code));
      setExpiresAt(data.expires_at || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a Telegram link code.');
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    if (!user || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('support-channel-link', {
        body: { action: 'revoke', channel: 'telegram' },
      });
      if (invokeError) throw invokeError;
      if (!data?.success) throw new Error(data?.error || 'Could not disconnect Telegram.');
      setIdentity(null);
      setCode(null);
      setExpiresAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect Telegram.');
    } finally {
      setLoading(false);
    }
  };

  const deepLink = code ? `https://t.me/DrightSupportBot?start=link_${encodeURIComponent(code)}` : null;

  return (
    <div className="rounded-2xl border border-blue-100 dark:border-blue-900/60 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-800 p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
          <Send className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white">Telegram Support</h3>
            {identity && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Connect your DRIGHT account to @DrightSupportBot for private account support, AI help, tickets, and agent replies in Telegram.
          </p>
        </div>
      </div>

      {!user ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Sign in to DRIGHT before linking Telegram to your account.</p>
      ) : identity ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-white/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">
            {identity.external_username ? `Connected as @${identity.external_username}` : 'Telegram account verified and connected.'}
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://t.me/DrightSupportBot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open Support Bot
            </a>
            <button
              type="button"
              onClick={() => void checkStatus()}
              disabled={checking || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium disabled:opacity-50"
            >
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-medium disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />} Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {!code ? (
            <button
              type="button"
              onClick={() => void createLink()}
              disabled={loading || checking}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Connect Telegram
            </button>
          ) : (
            <div className="rounded-xl border border-blue-100 dark:border-blue-900 bg-white dark:bg-gray-900/50 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Your one-time link code</p>
              <p className="font-mono text-lg tracking-widest font-bold text-gray-900 dark:text-white mt-1">{code}</p>
              {expiresAt && <p className="text-[11px] text-gray-400 mt-1">Expires at {new Date(expiresAt).toLocaleTimeString()}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {deepLink && (
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                  >
                    <Send className="w-3.5 h-3.5" /> Open Telegram & Link
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void checkStatus()}
                  disabled={checking}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium disabled:opacity-50"
                >
                  {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} I linked it
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
