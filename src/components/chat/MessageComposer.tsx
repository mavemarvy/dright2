import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Send, Loader2, Smile, Paperclip, Mic, X, Square,
  ChevronDown, Zap, Bot,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { uploadChatAttachment, getFileCategory, formatFileSize, useDraft, useQuickReplies, emitNotificationEvent } from '../../lib/chatHooks';
import { generateSuggestedReplies, answerFaqQuestion, detectSpam, flagConversation } from '../../lib/chatPart3Hooks';
import type { ChatMessage } from '../../lib/chatMessageType';
import type { ChatConversation } from '../../lib/types';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'image/jpeg','image/jpg','image/png','image/gif','image/webp',
  'video/mp4','video/webm','video/mov',
  'audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/webm','audio/mp4',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip','text/plain','text/csv',
];

interface PendingFile { file: File; preview?: string; progress: number; }

interface MessageComposerProps {
  conversation: ChatConversation;
  userId: string;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  onMessageSent: () => void;
  disabled?: boolean;
  recentMessages?: ChatMessage[];
}

export default function MessageComposer({
  conversation, userId, replyTo, onClearReply, onMessageSent, disabled, recentMessages = [],
}: MessageComposerProps) {
  const isSeller = conversation.seller_id === userId;
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [faqAnswer, setFaqAnswer] = useState<{ text: string; confidence: string } | null>(null);
  const suggestions = useMemo(() => generateSuggestedReplies({ conversation, recentMessages, isSeller }), [conversation, recentMessages, isSeller]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { draft, saveDraft, clearDraft } = useDraft(conversation.id, userId);
  const { quickReplies } = useQuickReplies(userId);

  // Initialize input from draft
  useEffect(() => {
    if (draft && inputRef.current && !inputRef.current.value) {
      inputRef.current.value = draft;
      autoResize();
    }
  }, [draft]);

  const autoResize = useCallback(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 112) + 'px';
  }, []);

  const handleSend = async () => {
    const text = inputRef.current?.value.trim() || '';
    if ((!text && pendingFiles.length === 0) || sending || disabled) return;

    // Spam detection
    const spamResult = detectSpam({ messages: recentMessages, newMessageBody: text, senderId: userId, conversationId: conversation.id });
    if (spamResult.isSpam && spamResult.flagType) {
      await flagConversation({ conversationId: conversation.id, userId, flagType: spamResult.flagType, details: { reason: spamResult.reason, body: text.slice(0, 200) } });
    }

    setSending(true);

    const isCustomer = conversation.customer_id === userId;
    const otherCount = isCustomer ? 'seller_unread_count' : 'customer_unread_count';
    const currentOther = isCustomer ? (conversation.seller_unread_count || 0) : (conversation.customer_unread_count || 0);

    try {
      // Upload files first
      const uploadedAttachments: { storagePath: string; publicUrl: string; file: File }[] = [];
      for (let i = 0; i < pendingFiles.length; i++) {
        const pf = pendingFiles[i];
        const result = await uploadChatAttachment(pf.file, conversation.id, userId, pct => {
          setPendingFiles(prev => prev.map((f, idx) => idx === i ? { ...f, progress: pct } : f));
        });
        if (result) uploadedAttachments.push({ storagePath: result.path, publicUrl: result.url, file: pf.file });
      }

      // Determine message type
      const msgType = uploadedAttachments.length > 0
        ? getFileCategory(uploadedAttachments[0].file.type)
        : 'text';

      // Insert message
      const { data: msg, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversation.id,
          sender_id: userId,
          body: text,
          status: 'sent',
          message_type: msgType,
          reply_to_id: replyTo?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert attachments
      if (msg && uploadedAttachments.length > 0) {
        await supabase.from('chat_message_attachments').insert(
          uploadedAttachments.map(ua => ({
            message_id: msg.id,
            conversation_id: conversation.id,
            uploader_id: userId,
            file_name: ua.file.name,
            file_type: ua.file.type,
            file_size: ua.file.size,
            storage_path: ua.storagePath,
            public_url: ua.publicUrl,
          }))
        );
      }

      // Update conversation
      const lastMsgPreview = text || `[${msgType}]`;
      await supabase.from('chat_conversations').update({
        last_message: lastMsgPreview.slice(0, 100),
        last_message_at: new Date().toISOString(),
        [otherCount]: currentOther + 1,
      }).eq('id', conversation.id);

      // Emit notification event for the other participant
      const recipientId = isCustomer ? conversation.seller_id : conversation.customer_id;
      if (recipientId && msg) {
        emitNotificationEvent({
          userId: recipientId,
          eventType: uploadedAttachments.length > 0 ? 'attachment_received' : 'new_message',
          conversationId: conversation.id,
          messageId: msg.id,
          productId: conversation.product_id || null,
          actorId: userId,
          payload: { preview: lastMsgPreview.slice(0, 100), message_type: msgType },
        });
      }

      // Clear state
      if (inputRef.current) { inputRef.current.value = ''; autoResize(); }
      setPendingFiles([]);
      onClearReply();
      clearDraft();
      onMessageSent();
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const sendVoiceNote = async (blob: Blob, durationSec: number = 0) => {
    setSending(true);
    const isCustomer = conversation.customer_id === userId;
    const otherCount = isCustomer ? 'seller_unread_count' : 'customer_unread_count';
    const currentOther = isCustomer ? (conversation.seller_unread_count || 0) : (conversation.customer_unread_count || 0);

    try {
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      const result = await uploadChatAttachment(file, conversation.id, userId);
      if (!result) throw new Error('Upload failed');

      const { data: msg, error } = await supabase.from('chat_messages').insert({
        conversation_id: conversation.id,
        sender_id: userId,
        body: '',
        status: 'sent',
        message_type: 'voice_note',
      }).select().single();

      if (error) throw error;

      await supabase.from('chat_message_attachments').insert({
        message_id: msg.id,
        conversation_id: conversation.id,
        uploader_id: userId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: result.path,
        public_url: result.url,
        duration_seconds: durationSec,
      });

      await supabase.from('chat_conversations').update({
        last_message: '[Voice note]',
        last_message_at: new Date().toISOString(),
        [otherCount]: currentOther + 1,
      }).eq('id', conversation.id);

      // Emit notification event for voice note
      const recipientId = isCustomer ? conversation.seller_id : conversation.customer_id;
      if (recipientId && msg) {
        emitNotificationEvent({
          userId: recipientId,
          eventType: 'attachment_received',
          conversationId: conversation.id,
          messageId: msg.id,
          actorId: userId,
          payload: { preview: '[Voice note]', message_type: 'voice_note' },
        });
      }

      onMessageSent();
    } catch (err) {
      console.error('Voice send error:', err);
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      const recordStartTime = Date.now();
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        const actualDuration = (Date.now() - recordStartTime) / 1000;
        sendVoiceNote(blob, actualDuration);
      };
      mr.start();
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      console.error('Mic error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    // Always stop tracks to release the mic — prevents stream leak
    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    mediaRecorderRef.current = null;
    setRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordingTime(0);
  };

  const handleFiles = (files: File[]) => {
    const valid = files.filter(f => {
      if (f.size > MAX_FILE_SIZE) { alert(`${f.name} exceeds 50MB limit`); return false; }
      if (!ALLOWED_TYPES.includes(f.type)) { alert(`${f.name} — unsupported file type`); return false; }
      return true;
    });
    const previews: PendingFile[] = valid.map(f => ({
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      progress: 0,
    }));
    setPendingFiles(prev => [...prev, ...previews]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (disabled) {
    return (
      <div className="px-4 py-3 bg-white border-t border-gray-100 text-center text-sm text-gray-400">
        This conversation has been resolved
      </div>
    );
  }

  return (
    <div
      className={`bg-white border-t border-gray-100 ${isDragging ? 'ring-2 ring-primary-400 ring-inset' : ''}`}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary-50/90 border-2 border-dashed border-primary-400 rounded-lg pointer-events-none">
          <p className="text-primary-600 font-semibold">Drop files to attach</p>
        </div>
      )}

      {/* AI Suggested Replies */}
      {showSuggestions && (
        <div className="border-b border-gray-100 px-4 py-2 space-y-1.5 max-h-48 overflow-y-auto bg-purple-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-600">
              <Bot className="w-3.5 h-3.5" /> AI Suggested Replies
            </div>
            <button onClick={() => setShowSuggestions(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
          </div>
          {faqAnswer && (
            <div className="bg-purple-100/50 rounded-lg px-3 py-2 text-xs text-gray-700">
              <span className="font-medium text-purple-600">FAQ Match: </span>
              {faqAnswer.text}
              <button onClick={() => { if (inputRef.current) { inputRef.current.value = faqAnswer.text; autoResize(); saveDraft(faqAnswer.text); } setFaqAnswer(null); setShowSuggestions(false); inputRef.current?.focus(); }} className="ml-2 text-primary-600 font-medium hover:underline">Use</button>
            </div>
          )}
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => { if (inputRef.current) { inputRef.current.value = s; autoResize(); saveDraft(s); } setShowSuggestions(false); inputRef.current?.focus(); }} className="w-full text-left px-3 py-2 text-xs text-gray-700 bg-white rounded-lg border border-purple-100 hover:border-purple-300 hover:bg-purple-50/50 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
          <div className="flex-1 border-l-2 border-primary-500 pl-2">
            <p className="text-xs font-semibold text-primary-600">{replyTo.sender_name}</p>
            <p className="text-xs text-gray-500 truncate">
              {replyTo.message_type !== 'text' ? `[${replyTo.message_type}]` : replyTo.body}
            </p>
          </div>
          <button onClick={onClearReply} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-50">
          {pendingFiles.map((pf, i) => (
            <div key={i} className="relative shrink-0">
              {pf.preview ? (
                <img src={pf.preview} alt={pf.file.name} className="w-16 h-16 object-cover rounded-lg" />
              ) : (
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex flex-col items-center justify-center p-1 gap-1">
                  <span className="text-[9px] text-gray-500 text-center truncate w-full">{pf.file.name.slice(0, 8)}</span>
                  <span className="text-[9px] text-gray-400">{formatFileSize(pf.file.size)}</span>
                </div>
              )}
              {pf.progress > 0 && pf.progress < 100 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 rounded-b-lg overflow-hidden">
                  <div className="h-full bg-primary-500 transition-all" style={{ width: `${pf.progress}%` }} />
                </div>
              )}
              <button
                onClick={() => { URL.revokeObjectURL(pf.preview || ''); setPendingFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick replies dropdown */}
      {showQuickReplies && quickReplies.length > 0 && (
        <div className="border-b border-gray-100 max-h-40 overflow-y-auto">
          {quickReplies.map(qr => (
            <button
              key={qr.id}
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.value = qr.body;
                  autoResize();
                  saveDraft(qr.body);
                }
                setShowQuickReplies(false);
                inputRef.current?.focus();
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <p className="text-xs font-semibold text-gray-600">{qr.title}</p>
              <p className="text-xs text-gray-400 truncate">{qr.body}</p>
            </button>
          ))}
        </div>
      )}

      {/* Recording UI */}
      {recording ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-red-500">Recording {recordingTime}s</span>
          <div className="flex gap-1 items-center flex-1">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="w-0.5 bg-red-400 rounded-full animate-bounce"
                style={{ height: `${Math.random() * 16 + 4}px`, animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
          <button onClick={cancelRecording} className="p-2 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
          <button onClick={stopRecording} className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700">
            <Square className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 px-3 py-2.5">
          {/* Attachment */}
          <input ref={fileInputRef} type="file" multiple accept={ALLOWED_TYPES.join(',')} onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)); e.target.value = ''; }} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-primary-600 transition-colors shrink-0"
            aria-label="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Emoji (placeholder — future emoji picker library) */}
          <button className="p-2 text-gray-400 hover:text-primary-600 transition-colors shrink-0 hidden sm:block" aria-label="Emoji">
            <Smile className="w-5 h-5" />
          </button>

          {/* AI suggestions toggle */}
          <button onClick={() => { setShowSuggestions(v => !v); if (!showSuggestions) { const faq = answerFaqQuestion({ question: inputRef.current?.value || recentMessages.slice(-1)[0]?.body || '', conversation }); if (faq.answer) setFaqAnswer({ text: faq.answer, confidence: faq.confidence }); else setFaqAnswer(null); } }} className="p-2 text-gray-400 hover:text-purple-600 transition-colors shrink-0" aria-label="AI suggestions">
            <Bot className="w-5 h-5" />
          </button>

          {/* Quick replies toggle */}
          {quickReplies.length > 0 && (
            <button onClick={() => setShowQuickReplies(v => !v)} className="p-2 text-gray-400 hover:text-primary-600 transition-colors shrink-0" aria-label="Quick replies">
              <Zap className="w-5 h-5" />
            </button>
          )}

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              defaultValue={draft}
              onChange={e => { saveDraft(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              disabled={sending}
              className="w-full resize-none border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100 max-h-28 min-h-[44px] transition-colors pr-8"
            />
            {inputRef.current?.value && (
              <button
                onClick={() => setShowQuickReplies(false)}
                className="absolute right-3 bottom-3 text-gray-300"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Voice / Send */}
          {(!inputRef.current?.value && pendingFiles.length === 0) ? (
            <button
              onClick={startRecording}
              className="w-10 h-10 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors shrink-0"
              aria-label="Record voice note"
            >
              <Mic className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center disabled:opacity-40 hover:bg-primary-700 transition-colors shrink-0"
              aria-label="Send"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
