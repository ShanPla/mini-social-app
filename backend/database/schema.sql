-- ============================================
-- MINI SOCIAL MEDIA APP — DATABASE SCHEMA
-- Run these in order in the Supabase SQL Editor
-- ============================================

-- 1. PROFILES TABLE (extends Supabase Auth users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  bio text,
  avatar_url text,
  created_at timestamp default now()
);

-- 2. POSTS TABLE
create table posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp default now()
);

-- 3. LIKES TABLE (many-to-many: users ↔ posts)
create table likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  post_id uuid references posts(id) on delete cascade not null,
  created_at timestamp default now(),

  -- prevents duplicate likes
  unique (user_id, post_id)
);

-- 4. COMMENTS TABLE
create table comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  post_id uuid references posts(id) on delete cascade not null,
  content text not null,
  created_at timestamp default now()
);

-- 5. FOLLOWS TABLE (self-referencing many-to-many)
create table follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references profiles(id) on delete cascade not null,
  following_id uuid references profiles(id) on delete cascade not null,
  created_at timestamp default now(),

  -- prevents duplicate follows
  unique (follower_id, following_id)
);

-- 6. AUTO-CREATE PROFILE ON SIGNUP
-- Ensures every new user gets a profile row automatically
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(new.id::text, 1, 8));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 7. PERFORMANCE INDEXES
create index idx_posts_user_id on posts(user_id);
create index idx_likes_post_id on likes(post_id);
create index idx_comments_post_id on comments(post_id);
create index idx_follows_follower on follows(follower_id);
create index idx_follows_following on follows(following_id);
