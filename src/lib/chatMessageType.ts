import type { ChatAttachment, ChatReaction } from './chatTypes';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  message_type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'voice_note' | 'marketplace_card';
  reply_to_id: string | null;
  is_deleted: boolean;
  deleted_for_everyone: boolean;
  is_edited: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  // enriched client-side
  sender_name?: string;
  sender_avatar?: string | null;
  attachments?: ChatAttachment[];
  reactions?: ChatReaction[];
  reply_to?: {
    id: string;
    sender_name: string;
    body: string;
    message_type: ChatMessage['message_type'];
  } | null;
  is_starred?: boolean;
}
