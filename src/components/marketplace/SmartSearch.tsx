import { formatDisplayCurrency } from '../../lib/currency';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Mic, TrendingUp, Clock, Trash2, ArrowRight, Package, Flame, Sparkles, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { smartSearch as groqSmartSearch } from '../../lib/groqService';
import { getSmartSuggestions, type SearchSuggestion } from '../../lib/searchSuggestions';
import {
  getTrendingSearches,
  getPopularSearches,
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
  parseNaturalLanguageSearch,
} from '../../lib/marketplace';
import { fuzzyMatch } from '../../lib/rankingEngine';

interface SearchResult {
  id: string;
  name: string;
  type: 'product' | 'service' | 'job' | 'store' | 'category';
  image_url?: string | null;
  price?: number;
  category?: string;
}

interface SmartSearchProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export default function SmartSearch({ onSearch, placeholder = 'Search products, services, jobs, stores...' }: SmartSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [smartSuggestions, setSmartSuggestions] = useState<SearchSuggestion[]>([]);
  const [aiIntent, setAiIntent] = useState<string | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trendingSearches = getTrendingSearches();
  const popularSearches = getPopularSearches();

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // Recognition cleanup is best-effort.
      }
      recognitionRef.current = null;

      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }

      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // Recorder cleanup is best-effort.
      }
      mediaRecorderRef.current = null;

      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    };
  }, []);

  const searchDb = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setAiIntent(null);
      return;
    }
    setLoading(true);

    // Check if this looks like natural language — if so, use Groq smart search
    const looksNaturalLanguage = /^(i need|i want|i'm looking for|best|show me|find|get me|where can|how do|looking for)/i.test(q.trim()) || q.trim().split(' ').length > 4;
    let searchTerm = q.trim();
    if (looksNaturalLanguage) {
      const groqResult = await groqSmartSearch(q.trim());
      if (groqResult?.keywords?.length) {
        searchTerm = groqResult.keywords.join(' ');
        setAiIntent(groqResult.intent || null);
      }
    } else {
      setAiIntent(null);
    }

    const parsed = parseNaturalLanguageSearch(searchTerm);
    const dbSearchTerm = parsed.keywords.join(' ').replace(/[,.()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();

    const [prodRes, jobRes, storeRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, image_url, price, category, product_type')
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .or(`name.ilike.%${dbSearchTerm}%,description.ilike.%${dbSearchTerm}%,category.ilike.%${dbSearchTerm}%`)
        .limit(5),
      supabase
        .from('jobs')
        .select('id, title, category')
        .eq('status', 'active')
        .or(`title.ilike.%${dbSearchTerm}%,description.ilike.%${dbSearchTerm}%`)
        .limit(3),
      supabase
        .from('users')
        .select('id, full_name, store_title')
        .not('store_title', 'is', null)
        .or(`full_name.ilike.%${dbSearchTerm}%,store_title.ilike.%${dbSearchTerm}%`)
        .limit(3),
    ]);

    const productResults: SearchResult[] = (prodRes.data || []).filter((p: Record<string, unknown>) => {
      const name = (p.name as string) || '';
      const desc = (p as Record<string, unknown>).description as string || '';
      return fuzzyMatch(dbSearchTerm, name, 2) || fuzzyMatch(dbSearchTerm, desc, 2);
    }).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      type: (p.product_type as string) === 'SERVICE' ? 'service' : 'product',
      image_url: p.image_url as string | null,
      price: p.price as number,
      category: p.category as string,
    }));

    const jobResults: SearchResult[] = (jobRes.data || []).map((j: Record<string, unknown>) => ({
      id: j.id as string,
      name: j.title as string,
      type: 'job',
      category: j.category as string,
    }));

    const storeResults: SearchResult[] = (storeRes.data || []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      name: (s.store_title as string) || (s.full_name as string) || 'Store',
      type: 'store',
    }));

    setResults([...productResults, ...jobResults, ...storeResults]);
    setLoading(false);
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => searchDb(value), 300);
      suggestionDebounceRef.current = setTimeout(() => {
        getSmartSuggestions(value, null, 6).then(setSmartSuggestions);
      }, 150);
    } else {
      setResults([]);
      setSmartSuggestions([]);
    }
  };

  const handleSearch = (searchQuery?: string) => {
    const q = (searchQuery ?? query).trim();
    if (!q) return;
    addRecentSearch(q);
    setRecentSearches(getRecentSearches());
    onSearch(q);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const applyVoiceTranscript = useCallback((rawTranscript: string) => {
    const transcript = rawTranscript.trim();
    if (!transcript) {
      setVoiceError('No speech was detected. Tap the microphone and try again.');
      return;
    }

    setQuery(transcript);
    addRecentSearch(transcript);
    setRecentSearches(getRecentSearches());
    setVoiceError(null);

    // Voice search behaves exactly like submitting the single marketplace search bar.
    onSearch(transcript);
    void searchDb(transcript);
    setIsOpen(true);
  }, [onSearch, searchDb]);

  const transcribeRecordedAudio = useCallback(async (audioBlob: Blob, mimeType: string) => {
    const extension = mimeType.includes('mp4')
      ? 'm4a'
      : mimeType.includes('ogg')
        ? 'ogg'
        : 'webm';

    const formData = new FormData();
    formData.append('audio', audioBlob, `marketplace-voice-search.${extension}`);
    formData.append('language', (navigator.language || 'en-US').split('-')[0]);

    const { data, error } = await supabase.functions.invoke('voice-search-transcribe', {
      body: formData,
    });

    if (error) throw error;
    if (!data?.success || !data?.transcript) {
      throw new Error(data?.error || 'No transcript was returned');
    }

    applyVoiceTranscript(String(data.transcript));
  }, [applyVoiceTranscript]);

  const startRecordedVoiceSearch = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError('Voice search is not supported by this browser. You can still type your search.');
      return;
    }

    setVoiceError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredMimeTypes = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = preferredMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      recorder.onerror = () => {
        setVoiceError('Microphone recording failed. Please try again.');
        setVoiceListening(false);
      };

      recorder.onstop = async () => {
        if (voiceTimeoutRef.current) {
          clearTimeout(voiceTimeoutRef.current);
          voiceTimeoutRef.current = null;
        }

        const actualMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: actualMimeType });

        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (blob.size === 0) {
          setVoiceListening(false);
          setVoiceError('No audio was recorded. Tap the microphone and try again.');
          return;
        }

        try {
          await transcribeRecordedAudio(blob, actualMimeType);
        } catch (error) {
          console.error('Server voice transcription failed:', error);
          setVoiceError('Voice transcription could not complete. Please sign in, check your connection, and try again.');
        } finally {
          setVoiceListening(false);
        }
      };

      recorder.start();
      setVoiceListening(true);

      // Keep voice searches short, responsive, and inexpensive.
      voiceTimeoutRef.current = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 10000);
    } catch (error) {
      console.error('Microphone access failed:', error);
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setVoiceListening(false);
      setVoiceError('Microphone access is blocked. Allow microphone access for DRIGHT and try again.');
    }
  }, [transcribeRecordedAudio]);

  const handleVoiceSearch = useCallback(() => {
    if (voiceListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore stop failures from browsers that already ended recognition.
        }
        return;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    // Safari/iPhone and other browsers without Web Speech use DRIGHT's
    // authenticated server-side Whisper fallback instead.
    if (!SpeechRecognition) {
      void startRecordedVoiceSearch();
      return;
    }

    setVoiceError(null);

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setVoiceListening(true);
        setVoiceError(null);
      };

      recognition.onresult = (event: any) => {
        const transcript = String(event?.results?.[0]?.[0]?.transcript || '');
        applyVoiceTranscript(transcript);
      };

      recognition.onerror = (event: any) => {
        const errorCode = String(event?.error || '');
        if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
          setVoiceError('Microphone access is blocked. Allow microphone access for DRIGHT and try again.');
        } else if (errorCode === 'no-speech') {
          setVoiceError('No speech was detected. Tap the microphone and try again.');
        } else if (errorCode !== 'aborted') {
          setVoiceError('Voice search could not complete. Please try again or type your search.');
        }
        setVoiceListening(false);
      };

      recognition.onend = () => {
        setVoiceListening(false);
        recognitionRef.current = null;
      };

      recognition.start();
    } catch (error) {
      console.error('Voice search failed to start:', error);
      recognitionRef.current = null;
      setVoiceListening(false);
      void startRecordedVoiceSearch();
    }
  }, [applyVoiceTranscript, startRecordedVoiceSearch, voiceListening]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const flatResults = results;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && flatResults[activeIndex]) {
        const r = flatResults[activeIndex];
        const href = r.type === 'job' ? `/jobs/${r.id}` : r.type === 'store' ? `/shop/${r.id}` : `/product/${r.id}`;
        navigate(href);
        setIsOpen(false);
      } else {
        handleSearch();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const typeLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'job': return 'Job';
      case 'store': return 'Store';
      case 'service': return 'Service';
      default: return 'Product';
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-12 pr-24 py-4 rounded-2xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900 text-base shadow-sm"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleVoiceSearch}
            className={`p-1.5 rounded-lg transition-colors ${
              voiceListening
                ? 'text-primary-600 bg-primary-50'
                : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'
            }`}
            title={voiceListening ? 'Stop voice search' : 'Voice search'}
            aria-label={voiceListening ? 'Stop voice search' : 'Start voice search'}
            aria-pressed={voiceListening}
          >
            {voiceListening ? <Loader2 className="w-5 h-5 animate-spin text-primary-600" /> : <Mic className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {voiceError && (
        <p className="mt-2 px-1 text-xs text-red-600 dark:text-red-400" role="status">
          {voiceError}
        </p>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-xl border border-gray-100 z-50 max-h-[70vh] overflow-y-auto"
          >
            {/* AI intent indicator */}
            {aiIntent && !loading && results.length > 0 && (
              <div className="px-3 py-2 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
                <p className="text-xs text-orange-600 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> AI understood: {aiIntent}
                </p>
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="p-6 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              </div>
            )}

            {/* Smart suggestions — shown above results while typing */}
            {!loading && smartSuggestions.length > 0 && (
              <div className="p-2 border-b border-gray-50">
                <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Suggestions
                </p>
                {smartSuggestions.map((s) => (
                  <button
                    key={`${s.term}-${s.type}`}
                    onClick={() => { setQuery(s.term); handleSearch(s.term); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left"
                  >
                    {s.type === 'trending' ? <Flame className="w-4 h-4 text-red-500 shrink-0" /> :
                     s.type === 'recent' ? <Clock className="w-4 h-4 text-gray-400 shrink-0" /> :
                     s.type === 'category' ? <Package className="w-4 h-4 text-blue-500 shrink-0" /> :
                     <Search className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="text-sm text-gray-700 flex-1">{s.term}</span>
                    {s.type === 'trending' && (
                      <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">TRENDING</span>
                    )}
                    {s.category && (
                      <span className="text-[10px] text-gray-400">{s.category}</span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                ))}
              </div>
            )}

            {/* Search results */}
            {!loading && results.length > 0 && (
              <div className="p-2">
                <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Results</p>
                {results.map((r, idx) => {
                  const href = r.type === 'job' ? `/jobs/${r.id}` : r.type === 'store' ? `/shop/${r.id}` : `/product/${r.id}`;
                  return (
                    <Link
                      key={`${r.type}-${r.id}`}
                      to={href}
                      onClick={() => { handleSearch(r.name); setIsOpen(false); }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${activeIndex === idx ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                    >
                      {r.image_url ? (
                        <img src={r.image_url} alt={r.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                        <p className="text-xs text-gray-400">{typeLabel(r.type)}{r.category ? ` · ${r.category}` : ''}</p>
                      </div>
                      {r.price !== undefined && (
                        <span className="text-sm font-semibold text-gray-900 shrink-0">{formatDisplayCurrency(Number(r.price.toFixed(2)))}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* No results */}
            {!loading && query.trim().length >= 2 && results.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-500">No results for "{query}"</p>
                <button
                  onClick={() => handleSearch()}
                  className="mt-2 text-sm text-primary-600 hover:underline font-medium"
                >
                  Search for "{query}" →
                </button>
              </div>
            )}

            {/* Recent searches */}
            {!loading && query.trim().length < 2 && recentSearches.length > 0 && (
              <div className="p-2">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Recent
                  </p>
                  <button
                    onClick={() => { clearRecentSearches(); setRecentSearches([]); }}
                    className="text-xs text-gray-400 hover:text-error flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                </div>
                {recentSearches.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setQuery(s); handleSearch(s); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left"
                  >
                    <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-700 flex-1">{s}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                ))}
              </div>
            )}

            {/* Trending + Popular */}
            {!loading && query.trim().length < 2 && (
              <>
                <div className="p-2 border-t border-gray-50">
                  <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> Trending
                  </p>
                  <div className="flex flex-wrap gap-2 px-3 pb-2">
                    {trendingSearches.map((s: string) => (
                      <button
                        key={s}
                        onClick={() => { setQuery(s); handleSearch(s); }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-2 border-t border-gray-50">
                  <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Popular</p>
                  <div className="flex flex-wrap gap-2 px-3 pb-3">
                    {popularSearches.map((s: string) => (
                      <button
                        key={s}
                        onClick={() => { setQuery(s); handleSearch(s); }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

