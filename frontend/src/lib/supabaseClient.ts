import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'the-chronicle-auth',
  }
});

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
};

export type PostImage = {
  id: string;
  post_id: string;
  image_url: string;
  position: number;
};

export type Post = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  visibility: 'public' | 'followers' | 'private';
  created_at: string;
  profiles?: Profile;
  likes?: { id: string; user_id: string }[];
  comments?: Comment[];
  post_images?: PostImage[];
};

export type Comment = {
  id: string;
  user_id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  profiles?: Profile;
  comment_likes?: { id: string; user_id: string }[];
  replies?: Comment[];
};

/* ── Chat types ── */
export type ChatMember = {
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url: string | null;
  last_read_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  /* null once the sender deleted their account; the message stays */
  sender_id: string | null;
  content: string | null;
  image_url: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  is_group: boolean;
  name: string | null;
  created_by: string | null;
  last_message_at: string;
  last_message: Pick<ChatMessage, 'id' | 'sender_id' | 'content' | 'image_url' | 'created_at'> | null;
  unread_count: number;
  members: ChatMember[];
};
