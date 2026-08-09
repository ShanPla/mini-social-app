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
  content: string;
  created_at: string;
  profiles?: Profile;
};