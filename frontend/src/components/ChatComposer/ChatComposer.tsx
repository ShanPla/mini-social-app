import { useState, useEffect, useRef } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { describeError } from '../../lib/errors';
import { replyPreview } from '../../lib/replies';
import { supabase } from '../../lib/supabaseClient';
import type { ChatMessage } from '../../lib/supabaseClient';
import { useCooldown } from '../../lib/useCooldown';
import { shrinkImage, IMAGE_MAX_EDGE } from '../../lib/images';
import { revokePreview, useRevokeOnUnmount } from '../../lib/useObjectUrls';
import { MAX_IMAGE_BYTES } from '../../lib/chat';
import CharCount from '../CharCount/CharCount';
import './ChatComposer.css';

const MESSAGE_MAX = 4000;
/* The counter only shows once the end is in sight */
const COUNT_FROM = 3600;

type Props = {
  conversationId: string;
  userId: string | null;
  /* The thread has loaded: focus the box now (when autoFocus is on) */
  ready: boolean;
  autoFocus: boolean;
  /* Stable function: the thread appends the sent message to its list */
  onSent: (message: ChatMessage) => void;
  /* Stable function: tells the other side we are (not) typing */
  sendTyping: (isTyping: boolean) => void;
  /* The message being replied to (quote bar above the box), who sent it, and how to drop it */
  replyTo: ChatMessage | null;
  replyToName: string;
  onClearReply: () => void;
};

/*
 * The message box. It owns the draft text, the picked photo and the send
 * state, so typing re-renders only this small component and never the
 * message list above it.
 */
export default function ChatComposer({ conversationId, userId, ready, autoFocus, onSent, sendTyping, replyTo, replyToName, onClearReply }: Props) {
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /* A failed send keeps the draft, so Retry can simply send it again */
  const [error, setError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [isOnCooldown, triggerCooldown] = useCooldown(500);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useRevokeOnUnmount(imagePreview ? [imagePreview] : []);

  useEffect(() => {
    if (autoFocus && ready) textareaRef.current?.focus();
  }, [autoFocus, ready, conversationId]);

  /* Pressing Reply on a message moves the cursor to the box */
  const replyId = replyTo?.id;
  useEffect(() => {
    if (replyId) textareaRef.current?.focus();
  }, [replyId]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    sendTyping(!!e.target.value.trim());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError({ message: 'Only images can be sent.', canRetry: false }); return; }
    /* Photos are shrunk on send; a GIF goes as it is, so it must already fit */
    if (file.type === 'image/gif' && file.size > MAX_IMAGE_BYTES) { setError({ message: 'A GIF must be under 5 MB.', canRetry: false }); return; }
    setError(null);
    revokePreview(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    revokePreview(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canSend = (text.trim().length > 0 || !!imageFile) && !sending && !isOnCooldown;

  const handleSend = async () => {
    if (!canSend || !userId) return;
    const body = text.trim();
    setSending(true);
    setError(null);

    /* Image goes to the private bucket at {conversation}/{sender}/{uuid}.{ext};
       the message stores that path and the thread signs it when rendering. */
    let image_url: string | null = null;
    if (imageFile) {
      /* Big phone photos are resized first, so they fit the 5 MB limit */
      const photo = await shrinkImage(imageFile, IMAGE_MAX_EDGE.chat);
      const extFromType: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
      };
      const ext = extFromType[photo.type];
      if (!ext) {
        setError({ message: 'Only JPG, PNG, GIF or WebP images can be sent.', canRetry: false });
        setSending(false);
        return;
      }
      if (photo.size > MAX_IMAGE_BYTES) {
        setError({ message: 'Image must be under 5 MB.', canRetry: false });
        setSending(false);
        return;
      }
      const path = `${conversationId}/${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(path, photo, { contentType: photo.type });
      if (uploadError) {
        setError({ message: 'Image upload failed.', canRetry: true });
        setSending(false);
        return;
      }
      image_url = path;
    }

    const { data, error: insertError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: userId, content: body || null, image_url, reply_to_id: replyTo?.id ?? null })
      .select('*, reply:reply_to_id(id, sender_id, content, image_url)')
      .single();

    if (insertError || !data) {
      /* Do not leave an orphaned upload behind */
      if (image_url) supabase.storage.from('chat-images').remove([image_url]);
      const tooLong = insertError?.code === '23514' || body.length > MESSAGE_MAX;
      /* P0001 carries our own wording (blocked, reply in another chat, rate limit) */
      if (insertError?.code === 'P0001') {
        setError({ message: describeError(insertError, 'Could not send.'), canRetry: false });
        if (insertError.hint === 'reply') onClearReply();
      } else {
        setError(tooLong
          ? { message: `Message is too long (max ${MESSAGE_MAX} characters).`, canRetry: false }
          : { message: 'Could not send.', canRetry: true });
      }
      setSending(false);
      return;
    }

    onSent(data as ChatMessage);
    onClearReply();
    setText('');
    clearImage();
    sendTyping(false);
    triggerCooldown();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSending(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && replyTo) {
      e.preventDefault();
      onClearReply();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-composer">
      {/* Quote bar: the message this one will reply to */}
      {replyTo && (
        <div className="chat-reply-bar">
          <div className="chat-reply-text">
            <span className="chat-reply-label">Replying to {replyToName}</span>
            <span className="chat-reply-preview">{replyPreview(replyTo.content, replyTo.image_url)}</span>
          </div>
          <button type="button" className="chat-reply-close" onClick={onClearReply} title="Cancel reply" aria-label="Cancel reply">
            <X size={14} />
          </button>
        </div>
      )}
      {imagePreview && (
        <div className="chat-image-preview">
          <img src={imagePreview} alt="Preview" />
          <button type="button" className="chat-image-remove" onClick={clearImage} title="Remove" aria-label="Remove photo">
            <X size={12} />
          </button>
        </div>
      )}
      {error && (
        <div className="chat-error" role="alert">
          <span>{error.message}</span>
          {error.canRetry && (
            <button type="button" className="chat-retry" onClick={handleSend} disabled={!canSend}>Retry</button>
          )}
        </div>
      )}
      <div className="chat-composer-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="chat-attach"
          onClick={() => fileInputRef.current?.click()}
          title="Send a photo"
          aria-label="Send a photo"
          disabled={sending}
        >
          <ImagePlus size={18} />
        </button>
        <textarea
          ref={textareaRef}
          className="chat-input"
          aria-label="Message"
          rows={1}
          placeholder="Write a message…"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={() => sendTyping(false)}
          maxLength={MESSAGE_MAX}
          disabled={sending}
        />
        <button
          type="button"
          className="chat-send"
          onClick={handleSend}
          disabled={!canSend}
          title="Send (Enter)"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
      {text.length >= COUNT_FROM && <CharCount length={text.length} max={MESSAGE_MAX} className="chat-char-count" />}
    </div>
  );
}
