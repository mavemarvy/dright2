import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, CheckCheck, Star, Pin, Reply, Forward, Copy, Pencil,
  Trash2, MoreHorizontal, Download, Play, Pause, FileText,
  FileSpreadsheet, File, Presentation, Flag, BadgeCheck,
} from 'lucide-react';
import { chatFormatTime, toggleReaction, toggleStar, editMessage, deleteMessage, parseMessageLinks } from '../../lib/chatHooks';
import type { ChatMessage } from '../../lib/chatMessageType';
import { getCurrencySymbol } from '../../lib/currency';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showAvatar: boolean;
  avatarUrl?: string | null;
  userName?: string;
  userId: string;
  conversationId: string;
  onReply: (msg: ChatMessage) => void;
  onForward: (msg: ChatMessage) => void;
  onImageClick: (url: string, allUrls: string[]) => void;
  onRefetch: () => void;
  trustBadge?: string | null;
  onReport?: (msg: ChatMessage) => void;
}

function getDocIcon(fileType: string) {
  if (fileType.includes('pdf')) return FileText;
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv')) return FileSpreadsheet;
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) return Presentation;
  return File;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function AudioPlayer({ url, duration }: { url: string; duration?: number | null }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  };

  const totalSecs = duration || 0;
  const progressPct = totalSecs > 0 ? (currentTime / totalSecs) * 100 : 0;

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />
      <button onClick={toggle} className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center flex-shrink-0 hover:bg-current/20 transition-colors">
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <div className="flex-1">
        <div className="h-1.5 bg-current/20 rounded-full overflow-hidden">
          <div className="h-full bg-current/60 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-between mt-0.5 text-[10px] opacity-60">
          <span>{Math.floor(currentTime)}s</span>
          {totalSecs > 0 && <span>{Math.floor(totalSecs)}s</span>}
        </div>
      </div>
      <button onClick={cycleSpeed} className="text-[10px] font-bold opacity-60 hover:opacity-100 transition-opacity w-6 text-center">
        {speed}x
      </button>
    </div>
  );
}

function LinkifiedText({ text, isOwn }: { text: string; isOwn: boolean }) {
  const parts = parseMessageLinks(text);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'url') {
          return (
            <a key={i} href={part.value} target="_blank" rel="noopener noreferrer"
              className={`underline ${isOwn ? 'text-white/90' : 'text-primary-600'}`}>
              {part.value}
            </a>
          );
        }
        if (part.type === 'email') {
          return (
            <a key={i} href={`mailto:${part.value}`}
              className={`underline ${isOwn ? 'text-white/90' : 'text-primary-600'}`}>
              {part.value}
            </a>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </>
  );
}

export default function MessageBubble({
  message, isOwn, showAvatar, avatarUrl, userName, userId,
  conversationId, onReply, onForward, onImageClick, onRefetch,
  trustBadge, onReport,
}: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.body);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDeleted = message.is_deleted || message.deleted_for_everyone;

  const handleReact = async (emoji: string) => {
    await toggleReaction(message.id, userId, emoji);
    setShowEmojiPicker(false);
    onRefetch();
  };

  const handleStar = async () => {
    await toggleStar(message.id, userId, conversationId);
    setShowMenu(false);
    onRefetch();
  };

  const handleEdit = async () => {
    if (!editValue.trim() || editValue === message.body) { setEditing(false); return; }
    setSaving(true);
    await editMessage(message.id, editValue.trim(), message.body, userId);
    setSaving(false);
    setEditing(false);
    onRefetch();
  };

  const handleDelete = async (forEveryone: boolean) => {
    await deleteMessage(message.id, forEveryone);
    setShowMenu(false);
    onRefetch();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.body);
    setShowMenu(false);
  };

  const reactionGroups = (message.reactions || []).reduce<Record<string, { count: number; users: string[]; hasOwn: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, users: [], hasOwn: false };
    acc[r.emoji].count++;
    acc[r.emoji].users.push(r.user_name || 'Unknown');
    if (r.user_id === userId) acc[r.emoji].hasOwn = true;
    return acc;
  }, {});

  const bubbleBase = isOwn
    ? 'bg-primary-600 text-white rounded-2xl rounded-br-md'
    : 'bg-white text-gray-900 rounded-2xl rounded-bl-md shadow-sm border border-gray-100';

  const handleLongPress = useCallback(() => { setShowMenu(true); }, []);

  // Marketplace card from metadata
  const cardData = message.message_type === 'marketplace_card' && message.metadata
    ? message.metadata as { type: string; title: string; image_url?: string; price?: number; price_label?: string; subtitle?: string; rating?: number; url: string }
    : null;

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group relative`}
      onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}
    >
      {/* Avatar (other user) — clickable to profile */}
      {!isOwn && (
        <div className="w-8 mr-2 shrink-0 self-end">
          {showAvatar ? (
            <Link to={`/profile/${message.sender_id}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={userName} className="w-8 h-8 rounded-full object-cover hover:ring-2 hover:ring-primary-400 transition-all" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center hover:ring-2 hover:ring-primary-400 transition-all">
                  <span className="text-xs font-bold text-gray-500">{(userName || '?')[0].toUpperCase()}</span>
                </div>
              )}
            </Link>
          ) : null}
        </div>
      )}

      <div className={`max-w-[70%] sm:max-w-[60%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>

        {/* Sender name + trust badge */}
        {!isOwn && showAvatar && trustBadge && (
          <div className="flex items-center gap-1 mb-0.5 px-1">
            <BadgeCheck className="w-3 h-3 text-blue-500" />
            <span className="text-[10px] text-blue-600 font-medium">{trustBadge}</span>
          </div>
        )}

        {/* Reply preview */}
        {message.reply_to && !isDeleted && (
          <div className={`mb-1 px-3 py-1.5 rounded-xl text-xs border-l-2 max-w-full ${
            isOwn ? 'bg-primary-700/50 border-white/40 text-white/80' : 'bg-gray-50 border-primary-400 text-gray-600'
          }`}>
            <p className="font-semibold truncate">{message.reply_to.sender_name}</p>
            <p className="truncate opacity-80">
              {message.reply_to.message_type !== 'text' ? `[${message.reply_to.message_type}]` : message.reply_to.body}
            </p>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`relative ${bubbleBase} ${message.id.startsWith('temp-') ? 'opacity-70' : ''}`}
          onTouchStart={() => {
            const t = setTimeout(handleLongPress, 600);
            const clear = () => clearTimeout(t);
            document.addEventListener('touchend', clear, { once: true });
            document.addEventListener('touchmove', clear, { once: true });
          }}
        >
          {isDeleted ? (
            <p className="px-4 py-2.5 text-sm italic opacity-60">This message was deleted.</p>
          ) : (

            /* Marketplace Card */
            cardData ? (
              <a href={cardData.url} target="_blank" rel="noopener noreferrer"
                className="block w-56 overflow-hidden rounded-2xl hover:opacity-90 transition-opacity">
                {cardData.image_url && (
                  <img src={cardData.image_url} alt={cardData.title} className="w-full h-28 object-cover" />
                )}
                <div className="p-3 bg-white border border-gray-100">
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{cardData.title}</p>
                  {cardData.price != null && (
                    <p className="text-primary-600 font-bold text-sm mt-0.5">
                      {cardData.price === 0 ? 'Free' : `${getCurrencySymbol('NGN')}${cardData.price.toLocaleString()}`}
                    </p>
                  )}
                  {cardData.price_label && <p className="text-xs text-gray-500">{cardData.price_label}</p>}
                  {cardData.subtitle && <p className="text-xs text-gray-500 mt-0.5">{cardData.subtitle}</p>}
                  <span className="inline-block mt-2 text-xs font-semibold text-primary-600 hover:underline">
                    View {cardData.type}
                  </span>
                </div>
              </a>
            ) : message.message_type === 'image' ? (
              /* Images */
              <div className="p-1">
                <div className={`grid gap-1 ${(message.attachments?.length || 0) > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {(message.attachments || []).map(att => (
                    <button key={att.id} onClick={() => onImageClick(att.public_url, (message.attachments || []).map(a => a.public_url))}>
                      <img
                        src={att.thumbnail_url || att.public_url}
                        alt={att.file_name}
                        loading="lazy"
                        className="w-full max-w-[220px] max-h-[220px] object-cover rounded-xl"
                      />
                    </button>
                  ))}
                </div>
                {message.body && (
                  <p className="px-2 pb-1.5 pt-1 text-sm">{message.body}</p>
                )}
              </div>
            ) : message.message_type === 'video' ? (
              /* Video */
              <div className="p-1">
                {(message.attachments || []).map(att => (
                  <video
                    key={att.id}
                    src={att.public_url}
                    controls
                    className="w-full max-w-[260px] rounded-xl"
                    poster={att.thumbnail_url || undefined}
                  />
                ))}
                {message.body && <p className="px-2 pb-1.5 pt-1 text-sm">{message.body}</p>}
              </div>
            ) : message.message_type === 'audio' || message.message_type === 'voice_note' ? (
              /* Audio / Voice */
              <div className="px-4 py-2.5">
                {(message.attachments || []).map(att => (
                  <AudioPlayer key={att.id} url={att.public_url} duration={att.duration_seconds} />
                ))}
                {message.message_type === 'voice_note' && (
                  <p className="text-[10px] opacity-60 mt-1">Voice note</p>
                )}
              </div>
            ) : message.message_type === 'document' ? (
              /* Document */
              <div className="px-4 py-2.5 space-y-2">
                {(message.attachments || []).map(att => {
                  const DocIcon = getDocIcon(att.file_type);
                  return (
                    <div key={att.id} className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isOwn ? 'bg-white/20' : 'bg-gray-100'}`}>
                        <DocIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{att.file_name}</p>
                        <p className={`text-xs ${isOwn ? 'opacity-70' : 'text-gray-400'}`}>{formatBytes(att.file_size)}</p>
                      </div>
                      <a href={att.public_url} download={att.file_name} target="_blank" rel="noopener noreferrer"
                        className={`p-1 rounded hover:opacity-80 ${isOwn ? 'opacity-70' : 'text-gray-500'}`}>
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  );
                })}
                {message.body && <p className="text-sm pt-1">{message.body}</p>}
              </div>
            ) : (
              /* Text */
              <p className="px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                {editing ? null : <LinkifiedText text={message.body} isOwn={isOwn} />}
              </p>
            )
          )}

          {/* Edit input overlay */}
          {editing && !isDeleted && (
            <div className="px-3 pb-2">
              <textarea
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(); } if (e.key === 'Escape') setEditing(false); }}
                className="w-full border border-white/30 bg-white/10 rounded-lg px-2 py-1 text-sm text-white resize-none focus:outline-none"
                rows={2}
              />
              <div className="flex gap-2 mt-1">
                <button onClick={() => setEditing(false)} className="text-xs opacity-70 hover:opacity-100">Cancel</button>
                <button onClick={handleEdit} disabled={saving} className="text-xs font-bold opacity-90 hover:opacity-100">Save</button>
              </div>
            </div>
          )}

          {/* Hover quick-react */}
          {!isDeleted && (
            <div className={`absolute top-0 ${isOwn ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity`}>
              <button onClick={() => setShowEmojiPicker(v => !v)} className="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm text-xs hover:bg-gray-50">
                😊
              </button>
              <button onClick={() => onReply(message)} className="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50">
                <Reply className="w-3 h-3 text-gray-500" />
              </button>
              <button onClick={() => setShowMenu(v => !v)} className="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50">
                <MoreHorizontal className="w-3 h-3 text-gray-500" />
              </button>
            </div>
          )}
        </div>

        {/* Reactions row */}
        {Object.keys(reactionGroups).length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
            {Object.entries(reactionGroups).map(([emoji, info]) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                title={info.users.join(', ')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  info.hasOwn
                    ? 'bg-primary-100 border-primary-400 text-primary-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {emoji} {info.count > 1 && <span>{info.count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Status row */}
        <div className={`flex items-center gap-1 mt-0.5 px-1 ${isOwn ? 'justify-end' : ''}`}>
          {message.is_starred && <Star className="w-3 h-3 text-amber-400 fill-current" />}
          {message.is_edited && !isDeleted && <span className="text-[10px] text-gray-400">Edited</span>}
          <span className="text-[10px] text-gray-400">{chatFormatTime(message.created_at)}</span>
          {isOwn && (
            message.status === 'read' ? <CheckCheck className="w-3 h-3 text-primary-500" />
            : message.status === 'delivered' ? <CheckCheck className="w-3 h-3 text-gray-400" />
            : message.status === 'failed' ? <span className="text-[10px] text-red-500">Failed</span>
            : <Check className="w-3 h-3 text-gray-400" />
          )}
        </div>

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className={`flex gap-1 p-2 bg-white rounded-2xl shadow-xl border border-gray-100 mt-1 ${isOwn ? 'self-end' : ''}`} ref={menuRef}>
            {QUICK_EMOJIS.map(e => (
              <button key={e} onClick={() => handleReact(e)} className="text-lg hover:scale-125 transition-transform">{e}</button>
            ))}
            <button onClick={() => setShowEmojiPicker(false)} className="ml-1 text-gray-400 text-xs self-center">✕</button>
          </div>
        )}

        {/* Context menu */}
        {showMenu && !isDeleted && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
            <div className={`absolute z-40 bg-white rounded-2xl shadow-2xl border border-gray-100 py-1.5 min-w-[160px] ${isOwn ? 'right-0' : 'left-0'} top-0 -translate-y-full mb-1`}>
              <button onClick={() => { onReply(message); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                <Reply className="w-4 h-4 text-gray-400" /> Reply
              </button>
              <button onClick={() => { onForward(message); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                <Forward className="w-4 h-4 text-gray-400" /> Forward
              </button>
              {message.message_type === 'text' && (
                <button onClick={handleCopy} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  <Copy className="w-4 h-4 text-gray-400" /> Copy
                </button>
              )}
              <button onClick={handleStar} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                <Star className={`w-4 h-4 ${message.is_starred ? 'text-amber-400 fill-current' : 'text-gray-400'}`} />
                {message.is_starred ? 'Unstar' : 'Star'}
              </button>
              <button onClick={() => setShowEmojiPicker(true)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                <span className="text-base">😊</span> React
              </button>
              {isOwn && message.message_type === 'text' && (
                <button onClick={() => { setEditing(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  <Pencil className="w-4 h-4 text-gray-400" /> Edit
                </button>
              )}
              {isOwn && (
                <>
                  <div className="border-t border-gray-50 my-1" />
                  <button onClick={() => handleDelete(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50">
                    <Trash2 className="w-4 h-4 text-gray-400" /> Delete for me
                  </button>
                  <button onClick={() => handleDelete(true)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                    <Trash2 className="w-4 h-4 text-red-400" /> Delete for everyone
                  </button>
                </>
              )}
              {!isOwn && (
                <button onClick={() => { void(Pin); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  <Pin className="w-4 h-4 text-gray-400" /> Pin
                </button>
              )}
              {!isOwn && onReport && (
                <button onClick={() => { onReport(message); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                  <Flag className="w-4 h-4 text-red-400" /> Report
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
