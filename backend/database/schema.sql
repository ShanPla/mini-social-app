-- ============================================
-- THE CHRONICLE — DATABASE
--
-- Single source of truth for the whole backend: tables, triggers, RPCs,
-- row level security, storage buckets and realtime.
--
-- Run the WHOLE file in the Supabase SQL Editor. It is idempotent, so a
-- fresh install and an upgrade of a live project are the same action:
-- edit this file, run it again. Nothing here destroys data.
--
-- Upgrading from the old four-file layout (schema / policies / chat /
-- chat_notifications): just run this file once.
--
-- Sections
--   1. Tables and constraints
--   2. Helper functions
--   3. Triggers (profile creation, rate limits, notifications, mentions,
--      blocks, chat)
--   4. RPCs
--   5. Row level security and column grants
--   6. Storage buckets and policies
--   7. Realtime
--   8. Finish
--
-- Conventions
--   * All timestamps are `timestamptz` (no zone) in UTC. The client appends
--     a Z when parsing (lib/timeAgo.ts parseDbDate).
--   * CHECK constraints added to tables that may already hold data are
--     created NOT VALID: enforced for every new write, not retro-checked.
--     See the end of the file for how to validate them later.
-- ============================================


-- --------------------------------------------
-- 1. TABLES
-- --------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  bio text,
  avatar_url text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- Handle stays lowercase and URL-safe; the display name is free text shown
-- in its place wherever there is room, with the handle underneath.
alter table profiles add column if not exists display_name text;

alter table profiles drop constraint if exists profiles_display_name_check;
alter table profiles add constraint profiles_display_name_check
  check (display_name is null or (display_name ~ '\S' and length(display_name) <= 40));

-- Names that look official or collide with app routes. ONE list, used by
-- the CHECK below, username_available and handle_new_user.
create or replace function public.is_reserved_username(name text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(trim(coalesce(name, ''))) in (
    'admin', 'administrator', 'support', 'help', 'root', 'system', 'moderator', 'mod', 'staff', 'official', 'chronicle', 'thechronicle', 'null', 'undefined', 'me', 'settings', 'feed', 'messages', 'notifications', 'profile', 'search', 'login', 'register'
  );
$$;
grant execute on function public.is_reserved_username(text) to anon, authenticated;

alter table profiles drop constraint if exists profiles_username_check;
alter table profiles add constraint profiles_username_check
  check (username ~ '^[a-z0-9_]{3,30}$') not valid;

alter table profiles drop constraint if exists profiles_bio_check;
alter table profiles add constraint profiles_bio_check
  check (bio is null or length(bio) <= 200) not valid;

-- Enforced for new writes only (NOT VALID). A profile that already holds a
-- reserved name or a non-https avatar can not be updated until it is fixed.
alter table profiles drop constraint if exists profiles_username_reserved_check;
alter table profiles add constraint profiles_username_reserved_check
  check (not public.is_reserved_username(username)) not valid;

alter table profiles drop constraint if exists profiles_avatar_url_check;
alter table profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or avatar_url like 'https://%') not valid;


-- When the username last changed (null = never). Set by trg_limit_username_change.
alter table profiles add column if not exists username_changed_at timestamptz;

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  image_url text,
  visibility text not null default 'public'
    check (visibility in ('public', 'followers', 'private')),
  created_at timestamptz default now()
);

-- Image-only posts carry empty content, so only the length is capped.
alter table posts drop constraint if exists posts_content_check;
alter table posts add constraint posts_content_check
  check (length(content) <= 500) not valid;

-- Edited marker: null = never edited. Set by trg_mark_post_edited (3h) only
-- when the text or the visibility changes.
alter table posts add column if not exists updated_at timestamptz;


create table if not exists post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade not null,
  image_url text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);

alter table post_images drop constraint if exists post_images_url_check;
alter table post_images add constraint post_images_url_check
  check (image_url like 'https://%') not valid;


create table if not exists likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  post_id uuid references posts(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (user_id, post_id)
);


create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  post_id uuid references posts(id) on delete cascade not null,
  parent_id uuid references comments(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- Edited marker: null = never edited. Set by trg_mark_comment_edited (3h) only.
alter table comments add column if not exists updated_at timestamptz;

alter table comments drop constraint if exists comments_content_check;
alter table comments add constraint comments_content_check
  check (content ~ '\S' and length(content) <= 300) not valid;


create table if not exists comment_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  comment_id uuid references comments(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (user_id, comment_id)
);


create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references profiles(id) on delete cascade not null,
  following_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (follower_id, following_id)
);

alter table follows drop constraint if exists follows_no_self_check;
alter table follows add constraint follows_no_self_check
  check (follower_id <> following_id) not valid;


-- A conversation is either a DM (is_group = false, exactly 2 members)
-- or a group (is_group = true, 2+ members, optional name).
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  last_message_at timestamptz default now(),
  constraint conversations_name_check check (
    name is null or (name ~ '\S' and length(name) <= 100)
  )
);

-- Membership. last_read_at powers both unread counts and Seen receipts.
create table if not exists conversation_members (
  conversation_id uuid references conversations(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  joined_at timestamptz default now(),
  last_read_at timestamptz default now(),
  -- Set when this member hides the conversation from their list. It comes
  -- back by itself once a message newer than this arrives.
  hidden_at timestamptz,
  primary key (conversation_id, user_id)
);

alter table conversation_members add column if not exists hidden_at timestamptz;

-- A message has text, an image, or both.
-- image_url stores the STORAGE PATH inside the private chat-images bucket:
--   {conversation_id}/{sender_id}/{uuid}.{ext}
-- The client turns it into a signed URL when rendering.
-- sender_id goes null when the account is deleted: the conversation keeps
-- its history and the client shows [Deleted user].
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete set null,
  content text,
  image_url text,
  created_at timestamptz default now(),
  constraint messages_has_body check (
    coalesce(content ~ '\S', false) or nullif(trim(image_url), '') is not null
  ),
  constraint messages_content_length check (content is null or length(content) <= 4000),
  constraint messages_image_path check (
    image_url is null
    or image_url ~ ('^' || conversation_id::text || '/' || sender_id::text || '/[0-9a-f-]{36}\.(jpe?g|png|gif|webp)$')
  )
);


-- Upgrade path: the original sender_id was NOT NULL with ON DELETE CASCADE.
-- Only touch the FK when it is missing or has the wrong rule: the rewrite
-- re-validates every message and locks the table, so a plain re-run of this
-- file must leave a correct constraint alone.
alter table messages alter column sender_id drop not null;

do $$
declare
  c record;
  total integer;
  good integer;
begin
  select count(*),
         count(*) filter (
           where con.conname = 'messages_sender_id_fkey'
             and con.confdeltype = 'n'
             and con.confrelid = 'public.profiles'::regclass
         )
    into total, good
    from pg_constraint con
   where con.conrelid = 'public.messages'::regclass
     and con.contype = 'f'
     and con.conkey = array[
           (select a.attnum from pg_attribute a
             where a.attrelid = con.conrelid and a.attname = 'sender_id' and not a.attisdropped)
         ];

  if not (total = 1 and good = 1) then
    for c in
      select con.conname
        from pg_constraint con
       where con.conrelid = 'public.messages'::regclass
         and con.contype = 'f'
         and con.conkey = array[
               (select a.attnum from pg_attribute a
                 where a.attrelid = con.conrelid and a.attname = 'sender_id' and not a.attisdropped)
             ]
    loop
      execute format('alter table public.messages drop constraint %I', c.conname);
    end loop;

    alter table public.messages add constraint messages_sender_id_fkey
      foreign key (sender_id) references public.profiles(id) on delete set null;
  end if;
end $$;


-- Quoted reply: the message this one answers (same conversation, enforced by
-- trg_check_message_reply). Goes null when the original is deleted.
alter table messages
  add column if not exists reply_to_id uuid references messages(id) on delete set null;

create index if not exists idx_messages_reply_to on messages(reply_to_id) where reply_to_id is not null;


-- Notifications are written ONLY by the triggers in section 3. Each type
-- points at exactly one target: a post (like), a post + comment (comment),
-- nothing (follow), a conversation (message, added) or a post plus an
-- optional comment (mention).
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  actor_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  post_id uuid references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Upgrade path for tables created before these columns existed.
alter table notifications
  add column if not exists conversation_id uuid references conversations(id) on delete cascade;
alter table notifications
  add column if not exists comment_id uuid references comments(id) on delete cascade;

-- The original type CHECK was created inline, so its name is not guaranteed.
-- Replace the single-column CHECK(s) on `type` only when there is not
-- exactly one, correctly named, listing exactly the six types below.
do $$
declare
  c record;
  total integer;
  good integer;
begin
  select count(*), count(*) filter (where t.ok)
    into total, good
    from (
      select con.conname = 'notifications_type_check'
             and d ~ '''like''::text' and d ~ '''comment''::text' and d ~ '''follow''::text'
             and d ~ '''message''::text' and d ~ '''added''::text' and d ~ '''mention''::text'
             and (select count(*) from regexp_matches(d, '''[^'']*''::text', 'g')) = 6 as ok
        from (
          select con.conname, pg_get_constraintdef(con.oid) as d
            from pg_constraint con
           where con.conrelid = 'public.notifications'::regclass
             and con.contype = 'c'
             and con.conkey = array[
                   (select a.attnum from pg_attribute a
                     where a.attrelid = con.conrelid and a.attname = 'type' and not a.attisdropped)
                 ]
        ) con
    ) t;

  if not (total = 1 and good = 1) then
    for c in
      select con.conname
        from pg_constraint con
       where con.conrelid = 'public.notifications'::regclass
         and con.contype = 'c'
         and con.conkey = array[
               (select a.attnum from pg_attribute a
                 where a.attrelid = con.conrelid and a.attname = 'type' and not a.attisdropped)
             ]
    loop
      execute format('alter table public.notifications drop constraint %I', c.conname);
    end loop;

    alter table public.notifications add constraint notifications_type_check
      check (type in ('like', 'comment', 'follow', 'message', 'added', 'mention'));
  end if;
end $$;

-- comment_id is optional on comment rows so entries written before that
-- column existed remain valid. A mention points at a post, plus the comment
-- when the mention sits in a comment.
alter table notifications drop constraint if exists notifications_target_check;
alter table notifications add constraint notifications_target_check check (
  case type
    when 'like'    then post_id is not null and comment_id is null and conversation_id is null
    when 'comment' then post_id is not null and conversation_id is null
    when 'follow'  then post_id is null and comment_id is null and conversation_id is null
    when 'message' then conversation_id is not null and post_id is null and comment_id is null
    when 'added'   then conversation_id is not null and post_id is null and comment_id is null
    when 'mention' then post_id is not null and conversation_id is null
    else false
  end
) not valid;

-- Collapse duplicates left behind by the old client-side inserts (every
-- like/unlike cycle used to add a row) before the unique indexes below.
delete from notifications where id in (
  select id from (
    select id, row_number() over (
      partition by user_id, actor_id, post_id order by created_at desc, id desc
    ) as rn
    from notifications where type = 'like'
  ) t where rn > 1
);
delete from notifications where id in (
  select id from (
    select id, row_number() over (
      partition by user_id, actor_id order by created_at desc, id desc
    ) as rn
    from notifications where type = 'follow'
  ) t where rn > 1
);

-- One like entry per (recipient, actor, post); one follow entry per
-- (recipient, actor); one UNREAD message entry per (recipient, conversation).
create unique index if not exists idx_notifications_unique_like
  on notifications (user_id, actor_id, post_id) where type = 'like';
create unique index if not exists idx_notifications_unique_follow
  on notifications (user_id, actor_id) where type = 'follow';
create unique index if not exists idx_notifications_unread_message
  on notifications (user_id, conversation_id) where type = 'message' and is_read = false;
create unique index if not exists idx_notifications_unique_added
  on notifications (user_id, conversation_id) where type = 'added';

-- One mention entry per (recipient, post) for a mention in the post text,
-- and per (recipient, comment) for a mention in a comment.
create unique index if not exists idx_notifications_unique_mention_post
  on notifications (user_id, post_id) where type = 'mention' and comment_id is null;
create unique index if not exists idx_notifications_unique_mention_comment
  on notifications (user_id, comment_id) where type = 'mention' and comment_id is not null;


-- Indexes
-- Keyset pages for the feed and for one author (fetch_posts)
create index if not exists idx_posts_created_id on posts(created_at desc, id desc);
create index if not exists idx_posts_user_created on posts(user_id, created_at desc, id desc);
create index if not exists idx_post_images_post_id on post_images(post_id);
create index if not exists idx_likes_post_id on likes(post_id);
create index if not exists idx_comments_post_created on comments(post_id, created_at);
create index if not exists idx_comments_user_created on comments(user_id, created_at);
create index if not exists idx_comments_parent_id on comments(parent_id) where parent_id is not null;
create index if not exists idx_comment_likes_comment_id on comment_likes(comment_id);
create index if not exists idx_follows_following on follows(following_id);
create index if not exists idx_notifications_user_created on notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread on notifications(user_id) where is_read = false;
create index if not exists idx_notifications_post on notifications(post_id) where post_id is not null;
create index if not exists idx_notifications_actor_post on notifications(actor_id, post_id);
create index if not exists idx_notifications_conversation on notifications(conversation_id) where conversation_id is not null;
create index if not exists idx_notifications_comment on notifications(comment_id) where comment_id is not null;
create index if not exists idx_conversation_members_user on conversation_members(user_id);
create index if not exists idx_messages_conversation_created on messages(conversation_id, created_at desc, id desc);
create index if not exists idx_messages_sender_created on messages(sender_id, created_at);
create index if not exists idx_conversations_last_message on conversations(last_message_at desc);
create index if not exists idx_conversations_created_by on conversations(created_by) where created_by is not null;

-- Covered by another index, so they only cost writes:
--   idx_posts_created         by idx_posts_created_id
--   idx_posts_user_id         by idx_posts_user_created
--   idx_follows_follower      by the unique (follower_id, following_id)
--   idx_notifications_user_id by idx_notifications_user_created
--   idx_comments_post_id      by idx_comments_post_created
drop index if exists idx_posts_created;
drop index if exists idx_posts_user_id;
drop index if exists idx_follows_follower;
drop index if exists idx_notifications_user_id;
drop index if exists idx_comments_post_id;

-- Search: trigram indexes make ilike '%text%' on names fast. The opclass
-- lives in whichever schema pg_trgm was installed into (extensions on
-- Supabase).
create extension if not exists pg_trgm with schema extensions;

do $$
declare ns text;
begin
  select n.nspname into ns
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  execute format('create index if not exists idx_profiles_username_trgm on public.profiles using gin (username %I.gin_trgm_ops)', ns);
  execute format('create index if not exists idx_profiles_display_name_trgm on public.profiles using gin (display_name %I.gin_trgm_ops)', ns);
end $$;

-- Rate limit log. enforce_rate_limit (3b) counts these rows instead of the
-- target table, so deleting a post/comment/message/like does not reset the
-- budget. Written only by the trigger (security definer), pruned after a
-- day. No client access at all.
create table if not exists rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_events_lookup on rate_events (user_id, kind, created_at desc);
create index if not exists idx_rate_events_created on rate_events (created_at);

alter table rate_events enable row level security;
revoke all on rate_events from anon, authenticated;


-- User reports. target_id is polymorphic (post, comment, user or message),
-- so it has no foreign key; a report outlives its target on purpose.
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references profiles(id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  constraint reports_target_type_check check (target_type in ('post', 'comment', 'user', 'message')),
  constraint reports_reason_check check (reason ~ '\S' and length(reason) <= 500),
  -- one report per reporter per target (also stops repeat spam)
  constraint reports_unique_target unique (reporter_id, target_type, target_id)
);

create index if not exists idx_reports_target on reports (target_type, target_id);
create index if not exists idx_reports_open on reports (created_at desc) where resolved_at is null;


-- Blocks. A block works both ways (is_blocked_pair, section 2): neither side
-- sees the other's posts, comments or likes, can follow, or can message in
-- a DM. Only the blocker can read the row (RLS), so the blocked person
-- never learns of it from a select.
create table if not exists blocks (
  blocker_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self_check check (blocker_id <> blocked_id)
);

-- The reverse lookup of is_blocked_pair (who blocked me).
create index if not exists idx_blocks_blocked on blocks (blocked_id, blocker_id);


-- Saved posts (bookmarks), private to the person who saved them.
create table if not exists saved_posts (
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

create index if not exists idx_saved_posts_post on saved_posts (post_id);


-- One reaction per person per message; changing it is an update of emoji.
-- The emoji list is the source of truth for the picker in the app.
create table if not exists message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id)
);

alter table message_reactions drop constraint if exists message_reactions_emoji_check;
alter table message_reactions add constraint message_reactions_emoji_check
  check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏'));


-- Every date is timestamptz. Older tables were created with timestamp and hold
-- UTC. The two triggers name these columns, so they go first; section 3 puts
-- them back. Columns with a default and no nulls also become not null.
drop trigger if exists trg_clamp_member_times on conversation_members;
drop trigger if exists trg_broadcast_member_change on conversation_members;

do $$
declare
  c record;
  has_nulls boolean;
begin
  for c in
    select col.table_name, col.column_name, col.column_default
    from information_schema.columns col
    join pg_tables t on t.schemaname = col.table_schema and t.tablename = col.table_name
    where col.table_schema = 'public' and col.data_type = 'timestamp without time zone'
  loop
    if c.column_default is not null then
      execute format('alter table public.%I alter column %I drop default', c.table_name, c.column_name);
    end if;
    execute format('alter table public.%I alter column %I type timestamptz using %I at time zone ''UTC''',
      c.table_name, c.column_name, c.column_name);
    if c.column_default is not null then
      execute format('alter table public.%I alter column %I set default now()', c.table_name, c.column_name);
      execute format('select exists (select 1 from public.%I where %I is null)', c.table_name, c.column_name) into has_nulls;
      if not has_nulls then
        execute format('alter table public.%I alter column %I set not null', c.table_name, c.column_name);
      end if;
    end if;
  end loop;
end $$;


-- --------------------------------------------
-- 2. HELPERS
-- security definer so policies can call them without recursing into
-- their own RLS.
-- --------------------------------------------

create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;
-- Executable by anon too: it safely returns false when auth.uid() is null,
-- and Realtime evaluates policies for every subscriber role.
grant execute on function public.is_conversation_member(uuid) to anon, authenticated;

-- Return type must stay bigint: create or replace cannot change a
-- function's return type once it exists.
create or replace function public.conversation_member_count(conv_id uuid)
returns bigint
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select count(*) from conversation_members where conversation_id = conv_id;
$$;
grant execute on function public.conversation_member_count(uuid) to anon, authenticated;

-- Username availability for the Register page, which runs logged out.
-- anon has no table access (section 5), so this is the only door. At most 60
-- checks a minute per network address, so nobody can walk through every name.
-- The log holds a one-way hash of the address and is cleared after 10 minutes.
-- Without an address (SQL editor) there is no limit.
create table if not exists username_checks (
  ip_hash text not null,
  checked_at timestamptz not null default now()
);
create index if not exists idx_username_checks_lookup on username_checks (ip_hash, checked_at);
alter table username_checks enable row level security;
revoke all on username_checks from public, anon, authenticated;

create or replace function public.username_available(name text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  headers jsonb;
  ip text;
  ip_key text;
  now_utc timestamptz := now();
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;
  ip := coalesce(headers->>'cf-connecting-ip', split_part(headers->>'x-forwarded-for', ',', 1));

  if coalesce(ip, '') <> '' then
    ip_key := encode(sha256(convert_to(ip, 'UTF8')), 'hex');
    perform pg_advisory_xact_lock(hashtext('username_check:' || ip_key));
    delete from username_checks where checked_at < now_utc - interval '10 minutes';
    if (select count(*) from username_checks
         where ip_hash = ip_key and checked_at > now_utc - interval '1 minute') >= 60 then
      raise exception 'Too many username checks in a short time. Please wait a minute.'
        using errcode = 'P0001', hint = 'rate_limit';
    end if;
    insert into username_checks (ip_hash, checked_at) values (ip_key, now_utc);
  end if;

  return not public.is_reserved_username(name) and not exists (
    select 1 from profiles where username = lower(trim(coalesce(name, '')))
  );
end;
$$;
grant execute on function public.username_available(text) to anon, authenticated;


-- True when the caller is an admin. security definer because nobody can read
-- profiles.is_admin directly (section 5), which keeps secret who the admins
-- are. Policies and the client both ask through here.
create or replace function public.i_am_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;
revoke all on function public.i_am_admin() from public, anon;
grant execute on function public.i_am_admin() to authenticated;


-- True when either person has blocked the other. security definer because
-- blocks is readable only by the blocker (RLS), yet the blocked side must be
-- hidden too. Policies, RPCs and triggers all go through this one function.
-- Authenticated only: Realtime evaluates the posts and messages policies
-- as the subscriber, never as anon.
create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;
revoke all on function public.is_blocked_pair(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

-- The usernames @mentioned in a text: lowercase, distinct, in order of first
-- appearance, at most 10. The token must not touch a letter, digit or
-- underscore on its left (so an e-mail address is not a mention) nor on its
-- right (so a 31-character handle is not cut to 30). Internal use only.
create or replace function public.extract_mentions(txt text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(s.u order by s.first_pos), '{}'::text[])
  from (
    select lower(t.m[2]) as u, min(t.ord) as first_pos
    from regexp_matches(
           coalesce(txt, ''),
           '(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,30})(?![a-zA-Z0-9_])',
           'g'
         ) with ordinality as t(m, ord)
    group by lower(t.m[2])
    order by min(t.ord)
    limit 10
  ) s;
$$;
revoke all on function public.extract_mentions(text) from public, anon, authenticated;


-- --------------------------------------------
-- 3. TRIGGERS
-- --------------------------------------------

-- 3a. Profile on signup. The client passes the chosen username in
--     signUp options.data; anything invalid or taken falls back to
--     user_xxxxxxxx so signup itself can never fail on it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  wanted text := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  fallback text := 'user_' || substr(new.id::text, 1, 8);
begin
  if wanted !~ '^[a-z0-9_]{3,30}$'
     or public.is_reserved_username(wanted)
     or exists (select 1 from profiles where username = wanted) then
    wanted := fallback;
  end if;

  begin
    insert into public.profiles (id, username) values (new.id, wanted);
  exception when unique_violation then
    insert into public.profiles (id, username) values (new.id, fallback);
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();


-- 3b. Server-side rate limit. Client cooldowns are a courtesy; this is
--     the wall. Arguments: kind (the bucket name), window in seconds, max
--     events in that window, label used in the error message.
--     Every allowed insert is logged in rate_events, so the count survives
--     deletes (delete-then-repost no longer resets it). The advisory lock
--     serialises one user+kind, so parallel requests cannot all slip under
--     the limit. Calls without a user (SQL editor, service role) are not
--     limited. The error keeps P0001 + hint rate_limit (lib/errors.ts).
create or replace function public.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_kind text := TG_ARGV[0];
  window_s integer := TG_ARGV[1]::integer;
  max_events integer := TG_ARGV[2]::integer;
  v_label text := coalesce(TG_ARGV[3], TG_ARGV[0]);
  now_utc timestamptz := now();
  recent integer;
begin
  if uid is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_kind || ':' || uid::text));

  select count(*) into recent
    from rate_events re
   where re.user_id = uid
     and re.kind = v_kind
     and re.created_at > now_utc - make_interval(secs => window_s);

  if recent >= max_events then
    raise exception 'Too many % in a short time. Please slow down.', v_label
      using errcode = 'P0001', hint = 'rate_limit';
  end if;

  insert into rate_events (user_id, kind, created_at) values (uid, v_kind, now_utc);

  -- housekeeping: now and then drop events older than a day
  if random() < 0.02 then
    delete from rate_events where created_at < now_utc - interval '1 day';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_rate_limit() from public, anon, authenticated;

drop trigger if exists trg_rate_limit_posts on posts;
create trigger trg_rate_limit_posts
before insert on posts
for each row execute procedure public.enforce_rate_limit('posts', '60', '5', 'posts');

drop trigger if exists trg_rate_limit_comments on comments;
create trigger trg_rate_limit_comments
before insert on comments
for each row execute procedure public.enforce_rate_limit('comments', '60', '20', 'comments');

drop trigger if exists trg_rate_limit_messages on messages;
create trigger trg_rate_limit_messages
before insert on messages
for each row execute procedure public.enforce_rate_limit('messages', '10', '15', 'messages');

drop trigger if exists trg_rate_limit_likes on likes;
create trigger trg_rate_limit_likes
before insert on likes
for each row execute procedure public.enforce_rate_limit('likes', '600', '60', 'likes');

drop trigger if exists trg_rate_limit_comment_likes on comment_likes;
create trigger trg_rate_limit_comment_likes
before insert on comment_likes
for each row execute procedure public.enforce_rate_limit('comment_likes', '600', '60', 'comment likes');

drop trigger if exists trg_rate_limit_follows on follows;
create trigger trg_rate_limit_follows
before insert on follows
for each row execute procedure public.enforce_rate_limit('follows', '600', '30', 'follows');

drop trigger if exists trg_rate_limit_post_images on post_images;
create trigger trg_rate_limit_post_images
before insert on post_images
for each row execute procedure public.enforce_rate_limit('post_images', '600', '40', 'photos');

drop trigger if exists trg_rate_limit_conversations on conversations;
create trigger trg_rate_limit_conversations
before insert on conversations
for each row execute procedure public.enforce_rate_limit('conversations', '600', '10', 'conversations');

-- Invites: adding people to an existing group. create_conversation sets
-- app.skip_invite_limit for its own member inserts (those are not invites).
drop trigger if exists trg_rate_limit_invites on conversation_members;
create trigger trg_rate_limit_invites
before insert on conversation_members
for each row
when (current_setting('app.skip_invite_limit', true) is distinct from '1')
execute procedure public.enforce_rate_limit('invites', '600', '50', 'group invites');

drop trigger if exists trg_rate_limit_reports on reports;
create trigger trg_rate_limit_reports
before insert on reports
for each row execute procedure public.enforce_rate_limit('reports', '600', '10', 'reports');


drop trigger if exists trg_rate_limit_blocks on blocks;
create trigger trg_rate_limit_blocks
before insert on blocks
for each row execute procedure public.enforce_rate_limit('blocks', '600', '30', 'blocks');

drop trigger if exists trg_rate_limit_saved_posts on saved_posts;
create trigger trg_rate_limit_saved_posts
before insert on saved_posts
for each row execute procedure public.enforce_rate_limit('saved_posts', '600', '60', 'saves');

-- Insert and emoji change both count, so toggling cannot be used to flood.
drop trigger if exists trg_rate_limit_message_reactions on message_reactions;
create trigger trg_rate_limit_message_reactions
before insert or update of emoji on message_reactions
for each row execute procedure public.enforce_rate_limit('message_reactions', '600', '120', 'reactions');


-- 3c. A reply must hang off a comment on the same post.
create or replace function public.check_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from comments where id = new.parent_id and post_id = new.post_id
  ) then
    raise exception 'Reply must belong to the same post as its parent'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.check_comment_parent() from public, anon, authenticated;

drop trigger if exists trg_check_comment_parent on comments;
create trigger trg_check_comment_parent
before insert on comments
for each row execute procedure public.check_comment_parent();


-- 3d. Notifications. Written here and nowhere else: a client can no
--     longer forge a [liked your post] for a post it never touched.

create or replace function public.notify_like()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare owner uuid;
begin
  select user_id into owner from posts where id = new.post_id;
  if owner is not null and owner <> new.user_id
     and not public.is_blocked_pair(owner, new.user_id) then
    insert into notifications (user_id, actor_id, type, post_id, created_at)
    values (owner, new.user_id, 'like', new.post_id, new.created_at)
    on conflict (user_id, actor_id, post_id) where type = 'like' do nothing;
  end if;
  return null;
end;
$$;

-- Unliking retracts the entry, so a like/unlike loop cannot flood a bell.
create or replace function public.unnotify_like()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from notifications
    where type = 'like' and actor_id = old.user_id and post_id = old.post_id;
  return null;
end;
$$;

-- Top-level comments notify the post owner. Replies are silent for now
-- (a reply type with its own bell wording is a follow-up).
create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare owner uuid;
begin
  if new.parent_id is null then
    select user_id into owner from posts where id = new.post_id;
    if owner is not null and owner <> new.user_id
       and not public.is_blocked_pair(owner, new.user_id) then
      insert into notifications (user_id, actor_id, type, post_id, comment_id, created_at)
      values (owner, new.user_id, 'comment', new.post_id, new.id, new.created_at);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_blocked_pair(new.following_id, new.follower_id) then
    return null;
  end if;
  insert into notifications (user_id, actor_id, type, created_at)
  values (new.following_id, new.follower_id, 'follow', new.created_at)
  on conflict (user_id, actor_id) where type = 'follow' do nothing;
  return null;
end;
$$;

create or replace function public.unnotify_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from notifications
    where type = 'follow' and actor_id = old.follower_id and user_id = old.following_id;
  return null;
end;
$$;

revoke all on function public.notify_like() from public, anon, authenticated;
revoke all on function public.unnotify_like() from public, anon, authenticated;
revoke all on function public.notify_comment() from public, anon, authenticated;
revoke all on function public.notify_follow() from public, anon, authenticated;
revoke all on function public.unnotify_follow() from public, anon, authenticated;

drop trigger if exists trg_notify_like on likes;
create trigger trg_notify_like
after insert on likes
for each row execute procedure public.notify_like();

drop trigger if exists trg_unnotify_like on likes;
create trigger trg_unnotify_like
after delete on likes
for each row execute procedure public.unnotify_like();

drop trigger if exists trg_notify_comment on comments;
create trigger trg_notify_comment
after insert on comments
for each row execute procedure public.notify_comment();

drop trigger if exists trg_notify_follow on follows;
create trigger trg_notify_follow
after insert on follows
for each row execute procedure public.notify_follow();

drop trigger if exists trg_unnotify_follow on follows;
create trigger trg_unnotify_follow
after delete on follows
for each row execute procedure public.unnotify_follow();


-- Mentions. @username in a post or comment raises one [mention] bell entry
-- for each mentioned person who is not the author, is not in a blocked pair
-- with the author, and can see the post (public: everyone; followers-only:
-- people who follow the author; private: nobody). Max 10 per item (see
-- extract_mentions). Deleting the post or comment removes the entry (FKs).
create or replace function public.notify_mentions_post()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  names text[];
  old_names text[] := '{}';
  widened boolean := false;
begin
  if new.visibility = 'private' then return null; end if;

  names := public.extract_mentions(new.content);

  -- On an edit only the newly added handles are announced. When the edit
  -- also widens who can see the post, everything counts as new (the unique
  -- indexes keep an earlier entry from doubling).
  if tg_op = 'UPDATE' then
    widened := (old.visibility = 'private')
            or (old.visibility = 'followers' and new.visibility = 'public');
    if not widened then
      old_names := public.extract_mentions(old.content);
    end if;
    names := array(select n from unnest(names) n where n <> all (old_names));
  end if;

  if coalesce(array_length(names, 1), 0) = 0 then return null; end if;

  insert into notifications (user_id, actor_id, type, post_id, created_at)
  select pr.id, new.user_id, 'mention', new.id,
         case when tg_op = 'INSERT' then new.created_at else now() end
    from profiles pr
   where pr.username = any (names)
     and pr.id <> new.user_id
     and not public.is_blocked_pair(pr.id, new.user_id)
     and (
       new.visibility = 'public'
       or exists (
         select 1 from follows f
          where f.follower_id = pr.id and f.following_id = new.user_id
       )
     )
  on conflict do nothing;

  return null;
end;
$$;

-- A comment's mention also needs the post to be visible to the mentioned
-- person. The post owner is skipped on a top-level comment: the [comment]
-- entry already tells them. On an edit only the newly added handles count.
create or replace function public.notify_mentions_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  names text[] := public.extract_mentions(new.content);
  owner uuid;
  vis text;
begin
  if tg_op = 'UPDATE' then
    names := array(select n from unnest(names) n where n <> all (public.extract_mentions(old.content)));
  end if;
  if coalesce(array_length(names, 1), 0) = 0 then return null; end if;

  select p.user_id, p.visibility into owner, vis from posts p where p.id = new.post_id;
  if owner is null or vis = 'private' then return null; end if;

  insert into notifications (user_id, actor_id, type, post_id, comment_id, created_at)
  select pr.id, new.user_id, 'mention', new.post_id, new.id, coalesce(new.updated_at, new.created_at)
    from profiles pr
   where pr.username = any (names)
     and pr.id <> new.user_id
     and not (new.parent_id is null and pr.id = owner)
     and not public.is_blocked_pair(pr.id, new.user_id)
     and not public.is_blocked_pair(pr.id, owner)
     and (
       pr.id = owner
       or vis = 'public'
       or exists (
         select 1 from follows f
          where f.follower_id = pr.id and f.following_id = owner
       )
     )
  on conflict do nothing;

  return null;
end;
$$;

revoke all on function public.notify_mentions_post() from public, anon, authenticated;
revoke all on function public.notify_mentions_comment() from public, anon, authenticated;

drop trigger if exists trg_notify_mentions_post on posts;
create trigger trg_notify_mentions_post
after insert or update of content, visibility on posts
for each row execute procedure public.notify_mentions_post();

drop trigger if exists trg_notify_mentions_comment on comments;
create trigger trg_notify_mentions_comment
after insert or update of content on comments
for each row execute procedure public.notify_mentions_comment();


-- 3e. Chat.

-- On new message: bump conversation ordering and mark the sender as having
-- read their own message. greatest() guards against out-of-order commits.
create or replace function public.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update conversations
    set last_message_at = greatest(last_message_at, new.created_at)
    where id = new.conversation_id;

  update conversation_members
    set last_read_at = greatest(last_read_at, new.created_at)
    where conversation_id = new.conversation_id
      and user_id = new.sender_id;

  return new;
end;
$$;

revoke all on function public.on_message_insert() from public, anon, authenticated;

drop trigger if exists trg_on_message_insert on messages;
create trigger trg_on_message_insert
after insert on messages
for each row execute procedure public.on_message_insert();

-- Bell entry per recipient, collapsed while unread so a burst of messages
-- bumps one row instead of adding fifty. Nobody in a blocked pair with the
-- sender gets one (a group can still hold both sides).
create or replace function public.on_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (user_id, actor_id, type, conversation_id, created_at)
  select cm.user_id, new.sender_id, 'message', new.conversation_id, new.created_at
    from conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.sender_id
      and not public.is_blocked_pair(cm.user_id, new.sender_id)
  on conflict (user_id, conversation_id) where type = 'message' and is_read = false
  do update set actor_id = excluded.actor_id, created_at = excluded.created_at;

  return null;
end;
$$;

revoke all on function public.on_message_notify() from public, anon, authenticated;

drop trigger if exists trg_on_message_notify on messages;
create trigger trg_on_message_notify
after insert on messages
for each row execute procedure public.on_message_notify();

-- Being added to a group raises one bell entry per (person, group); being
-- added again after leaving bumps the same entry back to unread.
create or replace function public.notify_member_added()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or actor = new.user_id then return null; end if;
  if public.is_blocked_pair(new.user_id, actor) then return null; end if;
  if not exists (select 1 from conversations c where c.id = new.conversation_id and c.is_group) then
    return null;
  end if;

  insert into notifications (user_id, actor_id, type, conversation_id, created_at)
  values (new.user_id, actor, 'added', new.conversation_id, coalesce(new.joined_at, now()))
  on conflict (user_id, conversation_id) where type = 'added'
  do update set actor_id = excluded.actor_id, created_at = excluded.created_at, is_read = false;

  return null;
end;
$$;

revoke all on function public.notify_member_added() from public, anon, authenticated;

drop trigger if exists trg_notify_member_added on conversation_members;
create trigger trg_notify_member_added
after insert on conversation_members
for each row execute procedure public.notify_member_added();

-- When the last member leaves (or is deleted), remove the empty conversation.
-- When the creator leaves (or their account goes), the longest-standing
-- remaining member becomes the creator, so a group never ends up ownerless.
create or replace function public.on_member_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from conversations
    where id = old.conversation_id
      and not exists (
        select 1 from conversation_members where conversation_id = old.conversation_id
      );

  update conversations c
     set created_by = (
       select m.user_id from conversation_members m
        where m.conversation_id = c.id
        order by m.joined_at asc, m.user_id asc
        limit 1
     )
   where c.id = old.conversation_id
     and c.is_group
     and (c.created_by = old.user_id or c.created_by is null);

  return old;
end;
$$;

revoke all on function public.on_member_delete() from public, anon, authenticated;

drop trigger if exists trg_on_member_delete on conversation_members;
create trigger trg_on_member_delete
after delete on conversation_members
for each row execute procedure public.on_member_delete();


-- 3f. Read and hide times can never be in the future (a client could
--     otherwise set last_read_at far ahead and hide every new message from
--     its own unread count, or fake a Seen receipt ahead of time).
create or replace function public.clamp_member_times()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare now_utc timestamptz := now();
begin
  if new.last_read_at is not null and new.last_read_at > now_utc then
    new.last_read_at := now_utc;
  end if;
  if new.hidden_at is not null and new.hidden_at > now_utc then
    new.hidden_at := now_utc;
  end if;
  return new;
end;
$$;

revoke all on function public.clamp_member_times() from public, anon, authenticated;

drop trigger if exists trg_clamp_member_times on conversation_members;
create trigger trg_clamp_member_times
before update of last_read_at, hidden_at on conversation_members
for each row execute procedure public.clamp_member_times();


-- 3g. At most 10 photos per post. The lock keeps two parallel inserts from
--     both seeing 9. P0001 without rate_limit hint: describeError shows
--     the message as is.
create or replace function public.limit_post_images()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('post_images:' || new.post_id::text));

  if (select count(*) from post_images where post_id = new.post_id) >= 10 then
    raise exception 'A post can have at most 10 photos.'
      using errcode = 'P0001', hint = 'limit';
  end if;

  return new;
end;
$$;

revoke all on function public.limit_post_images() from public, anon, authenticated;

drop trigger if exists trg_limit_post_images on post_images;
create trigger trg_limit_post_images
before insert on post_images
for each row execute procedure public.limit_post_images();


-- 3g2. A username can change once every 7 days, so nobody can keep swapping
--      names and hand the old ones to someone else. The first change is free.
--      SQL editor calls (no user) are not limited. The client can not write
--      username_changed_at (column grants, section 5).
create or replace function public.limit_username_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  now_utc timestamptz := now();
  next_allowed timestamptz := old.username_changed_at + interval '7 days';
begin
  if new.username is not distinct from old.username then
    return new;
  end if;
  if auth.uid() is not null and next_allowed > now_utc then
    raise exception 'You can change your username again on %.', to_char(next_allowed at time zone 'utc', 'FMMonth FMDD, YYYY')
      using errcode = 'P0001', hint = 'limit';
  end if;
  new.username_changed_at := now_utc;
  return new;
end;
$$;

revoke all on function public.limit_username_change() from public, anon, authenticated;

drop trigger if exists trg_limit_username_change on profiles;
create trigger trg_limit_username_change
before update of username on profiles
for each row execute procedure public.limit_username_change();


-- 3h. Edited marker. updated_at moves only when the text or the visibility
--     changes (not for image edits, not for no-op saves); the client can
--     not write the column at all (column grants, section 5).
create or replace function public.mark_post_edited()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.content is distinct from old.content
     or new.visibility is distinct from old.visibility then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.mark_post_edited() from public, anon, authenticated;

drop trigger if exists trg_mark_post_edited on posts;
create trigger trg_mark_post_edited
before update on posts
for each row execute procedure public.mark_post_edited();

-- The same for comments: the client can write only the text (section 5).
create or replace function public.mark_comment_edited()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.content is distinct from old.content then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.mark_comment_edited() from public, anon, authenticated;

drop trigger if exists trg_mark_comment_edited on comments;
create trigger trg_mark_comment_edited
before update on comments
for each row execute procedure public.mark_comment_edited();


-- 3i. Blocks and chat rules.

-- Blocking someone cuts what already exists between the two: follows in both
-- directions, their bell entries about each other, and the DM disappears
-- from the blocker's list (it returns on unblock + a new chat, or when
-- create_conversation reopens it). Messages and posts are not deleted.
create or replace function public.on_block_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from follows
   where (follower_id = new.blocker_id and following_id = new.blocked_id)
      or (follower_id = new.blocked_id and following_id = new.blocker_id);

  delete from notifications
   where (user_id = new.blocker_id and actor_id = new.blocked_id)
      or (user_id = new.blocked_id and actor_id = new.blocker_id);

  update conversation_members cm
     set hidden_at = now()
    from conversations c
   where c.id = cm.conversation_id
     and not c.is_group
     and cm.user_id = new.blocker_id
     and exists (
       select 1 from conversation_members o
        where o.conversation_id = c.id and o.user_id = new.blocked_id
     );

  return null;
end;
$$;

revoke all on function public.on_block_insert() from public, anon, authenticated;

drop trigger if exists trg_on_block_insert on blocks;
create trigger trg_on_block_insert
after insert on blocks
for each row execute procedure public.on_block_insert();

-- A DM with someone in a blocked pair is read-only: no new messages from
-- either side. Groups are not affected (they hold other people too).
-- P0001 with hint blocked: describeError shows the message as is.
create or replace function public.check_message_blocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.sender_id is not null and exists (
    select 1
      from conversations c
      join conversation_members cm on cm.conversation_id = c.id
     where c.id = new.conversation_id
       and not c.is_group
       and cm.user_id <> new.sender_id
       and public.is_blocked_pair(new.sender_id, cm.user_id)
  ) then
    raise exception 'You cannot message this person.'
      using errcode = 'P0001', hint = 'blocked';
  end if;
  return new;
end;
$$;

revoke all on function public.check_message_blocked() from public, anon, authenticated;

drop trigger if exists trg_check_message_blocked on messages;
create trigger trg_check_message_blocked
before insert on messages
for each row execute procedure public.check_message_blocked();

-- A reply must quote a message of the same conversation.
create or replace function public.check_message_reply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from messages m
     where m.id = new.reply_to_id and m.conversation_id = new.conversation_id
  ) then
    raise exception 'You can only reply within the same chat.'
      using errcode = 'P0001', hint = 'reply';
  end if;
  return new;
end;
$$;

revoke all on function public.check_message_reply() from public, anon, authenticated;

drop trigger if exists trg_check_message_reply on messages;
create trigger trg_check_message_reply
before insert on messages
for each row execute procedure public.check_message_reply();

-- Friendly error for adding someone in a blocked pair to a group (the
-- insert policy refuses it too; this one runs first and says why).
create or replace function public.check_member_blocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and new.user_id <> auth.uid()
     and public.is_blocked_pair(auth.uid(), new.user_id) then
    raise exception 'You cannot add this person.'
      using errcode = 'P0001', hint = 'blocked';
  end if;
  return new;
end;
$$;

revoke all on function public.check_member_blocked() from public, anon, authenticated;

drop trigger if exists trg_check_member_blocked on conversation_members;
create trigger trg_check_member_blocked
before insert on conversation_members
for each row execute procedure public.check_member_blocked();


-- 3j. Like and comment counters. fetch_posts used to count likes and
--     comments per post through the child tables' row level security,
--     which checks every single like row and gets slow on popular posts.
--     The counts now live in post_stats, kept up to date by these triggers.
--     They count every like and comment, including ones the viewer can not
--     see because of a block. The row is only ever updated on delete (never
--     inserted), so a cascade from a post being deleted can not trip the
--     foreign key.
create table if not exists post_stats (
  post_id uuid primary key references posts(id) on delete cascade,
  like_count integer not null default 0,
  comment_count integer not null default 0
);

alter table post_stats enable row level security;
revoke all on post_stats from public, anon, authenticated;
grant select on post_stats to authenticated;

drop policy if exists "Viewers can read post stats" on post_stats;
create policy "Viewers can read post stats"
on post_stats for select to authenticated
using (exists (select 1 from posts where id = post_id));

create or replace function public.bump_post_stats()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'likes' then
    if tg_op = 'INSERT' then
      insert into post_stats as s (post_id, like_count) values (new.post_id, 1)
      on conflict (post_id) do update set like_count = s.like_count + 1;
    else
      update post_stats set like_count = greatest(like_count - 1, 0) where post_id = old.post_id;
    end if;
  else
    if tg_op = 'INSERT' then
      insert into post_stats as s (post_id, comment_count) values (new.post_id, 1)
      on conflict (post_id) do update set comment_count = s.comment_count + 1;
    else
      update post_stats set comment_count = greatest(comment_count - 1, 0) where post_id = old.post_id;
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.bump_post_stats() from public, anon, authenticated;

drop trigger if exists trg_post_stats_likes on likes;
create trigger trg_post_stats_likes
after insert or delete on likes
for each row execute procedure public.bump_post_stats();

drop trigger if exists trg_post_stats_comments on comments;
create trigger trg_post_stats_comments
after insert or delete on comments
for each row execute procedure public.bump_post_stats();

-- Backfill, and repair any drift on every run of this file.
insert into post_stats (post_id, like_count, comment_count)
select
  p.id,
  (select count(*) from likes l where l.post_id = p.id),
  (select count(*) from comments c where c.post_id = p.id)
from posts p
on conflict (post_id) do update
  set like_count = excluded.like_count,
      comment_count = excluded.comment_count
  where (post_stats.like_count, post_stats.comment_count)
        is distinct from (excluded.like_count, excluded.comment_count);


-- 3k. Membership changes reach only the people in that conversation.
--     Realtime sends DELETE events of a published table to every subscriber,
--     whatever the row level security says, so anyone listening could see
--     who left or was removed from any conversation. conversation_members
--     is therefore not in the realtime publication (section 7a). Instead
--     this trigger sends a private broadcast, event [member], on the topic
--     inbox:{user_id} of each person concerned: the members of the
--     conversation, plus the person who was removed. Section 7c lets each
--     user listen only to their own inbox. A failed broadcast never blocks
--     the membership change itself.
create or replace function public.broadcast_member_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data conversation_members;
  payload jsonb;
  target uuid;
begin
  if tg_op = 'DELETE' then
    row_data := old;
  else
    row_data := new;
  end if;

  if tg_op = 'UPDATE' and new.last_read_at is not distinct from old.last_read_at then
    return null;
  end if;

  payload := jsonb_build_object(
    'op', tg_op,
    'conversation_id', row_data.conversation_id,
    'user_id', row_data.user_id,
    'last_read_at', row_data.last_read_at
  );

  for target in
    select m.user_id from conversation_members m where m.conversation_id = row_data.conversation_id
    union
    select row_data.user_id
  loop
    begin
      perform realtime.send(payload, 'member', 'inbox:' || target::text, true);
    exception when others then
      null;
    end;
  end loop;
  return null;
end;
$$;

revoke all on function public.broadcast_member_change() from public, anon, authenticated;

drop trigger if exists trg_broadcast_member_change on conversation_members;
create trigger trg_broadcast_member_change
after insert or update of last_read_at or delete on conversation_members
for each row execute procedure public.broadcast_member_change();


-- 3l. Reaction changes reach only the members of the chat. A DELETE event
--     of a published table goes to every subscriber, so message_reactions
--     is not in the realtime publication (section 7a). This trigger sends
--     a private broadcast, event [reaction], on the chat's topic
--     typing:{conversation_id}, which only members can hear (7b). It
--     carries only the message id: the open chat reads that message's
--     reactions again, so a member who sends a fake notice changes nothing.
create or replace function public.broadcast_reaction_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  msg uuid;
  conv uuid;
begin
  if tg_op = 'DELETE' then
    msg := old.message_id;
  else
    msg := new.message_id;
  end if;
  -- Gone when the whole message is being deleted: nothing to tell
  select m.conversation_id into conv from messages m where m.id = msg;
  if conv is null then
    return null;
  end if;
  begin
    perform realtime.send(jsonb_build_object('message_id', msg), 'reaction', 'typing:' || conv::text, true);
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function public.broadcast_reaction_change() from public, anon, authenticated;

drop trigger if exists trg_broadcast_reaction_change on message_reactions;
create trigger trg_broadcast_reaction_change
after insert or update of emoji or delete on message_reactions
for each row execute procedure public.broadcast_reaction_change();



-- --------------------------------------------
-- 4. RPCs
-- --------------------------------------------

-- create_conversation(member_ids, group_name)
-- Creates a conversation with the caller + member_ids. For a DM (one other
-- member, no name) it returns the existing DM if one exists.
create or replace function public.create_conversation(member_ids uuid[], group_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  others uuid[];
  conv_id uuid;
  is_grp boolean;
  clean_name text := nullif(trim(coalesce(group_name, '')), '');
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  if clean_name is not null and length(clean_name) > 100 then
    raise exception 'Group name is too long (max 100 characters)';
  end if;

  -- de-duplicate, drop self and nulls
  select array_agg(distinct m) into others
  from unnest(member_ids) as m
  where m is not null and m <> me;

  if others is null or array_length(others, 1) = 0 then
    raise exception 'A conversation needs at least one other member';
  end if;

  if array_length(others, 1) > 49 then
    raise exception 'Too many members (max 50)';
  end if;

  -- every member must be a real profile
  if exists (select 1 from unnest(others) o where not exists (select 1 from profiles where id = o)) then
    raise exception 'Unknown member';
  end if;

  -- nobody in a blocked pair with the caller, either way round
  if exists (select 1 from unnest(others) o where public.is_blocked_pair(me, o)) then
    raise exception 'You cannot message this person.'
      using errcode = 'P0001', hint = 'blocked';
  end if;

  is_grp := array_length(others, 1) > 1 or clean_name is not null;

  -- Reuse existing DM between the two users. Advisory lock on the ordered
  -- pair prevents two simultaneous calls from creating duplicate DMs.
  if not is_grp then
    perform pg_advisory_xact_lock(
      hashtext(least(me::text, others[1]::text)),
      hashtext(greatest(me::text, others[1]::text))
    );

    select c.id into conv_id
    from conversations c
    where c.is_group = false
      and exists (select 1 from conversation_members where conversation_id = c.id and user_id = me)
      and exists (select 1 from conversation_members where conversation_id = c.id and user_id = others[1])
    limit 1;

    if conv_id is not null then
      -- Starting a chat with someone you hid brings the DM back for you
      update conversation_members set hidden_at = null
       where conversation_id = conv_id and user_id = me;
      return conv_id;
    end if;
  end if;

  insert into conversations (is_group, name, created_by)
  values (is_grp, clean_name, me)
  returning id into conv_id;

  -- The creator's own member inserts are not invites (see trg_rate_limit_invites).
  perform set_config('app.skip_invite_limit', '1', true);

  insert into conversation_members (conversation_id, user_id)
  select conv_id, m from unnest(others || me) as m;

  perform set_config('app.skip_invite_limit', '', true);

  return conv_id;
end;
$$;

revoke all on function public.create_conversation(uuid[], text) from public, anon;
grant execute on function public.create_conversation(uuid[], text) to authenticated;


-- get_conversations()
-- The caller's conversation list, newest activity first, with the last
-- message, unread count, and member list (with last_read_at for Seen).
-- The 200 most recently active conversations at most.
-- security invoker: normal RLS applies.
drop function if exists public.get_conversations();
create or replace function public.get_conversations()
returns table (
  id uuid,
  is_group boolean,
  name text,
  created_by uuid,
  last_message_at timestamptz,
  last_message jsonb,
  unread_count bigint,
  members jsonb
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    c.id,
    c.is_group,
    c.name,
    c.created_by,
    c.last_message_at,
    (
      select to_jsonb(lm) from (
        select m.id, m.sender_id, m.content, m.image_url, m.created_at
        from messages m
        where m.conversation_id = c.id
        order by m.created_at desc, m.id desc
        limit 1
      ) lm
    ) as last_message,
    (
      select count(*)
      from messages m
      where m.conversation_id = c.id
        and m.sender_id is distinct from auth.uid()
        and m.created_at > me.last_read_at
    ) as unread_count,
    (
      select jsonb_agg(
        jsonb_build_object(
          'user_id', cm.user_id,
          'username', p.username,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url,
          'last_read_at', cm.last_read_at
        ) order by p.username
      )
      from conversation_members cm
      join profiles p on p.id = cm.user_id
      where cm.conversation_id = c.id
    ) as members
  from conversations c
  join conversation_members me
    on me.conversation_id = c.id
   and me.user_id = auth.uid()
  where me.hidden_at is null or c.last_message_at > me.hidden_at
  order by c.last_message_at desc
  limit 200;
$$;

revoke all on function public.get_conversations() from public, anon;
grant execute on function public.get_conversations() to authenticated;


-- mark_conversation_read(conv_id)
-- Server time so it always compares correctly with message timestamps.
-- Also clears the conversation's bell entry.
create or replace function public.mark_conversation_read(conv_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update conversation_members
    set last_read_at = now()
    where conversation_id = conv_id
      and user_id = auth.uid();

  update notifications
    set is_read = true
    where user_id = auth.uid()
      and conversation_id = conv_id
      and type in ('message', 'added')
      and is_read = false;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;


-- hide_conversation(conv_id)
-- Takes a conversation off the caller's list. Server time, same reason as
-- mark_conversation_read. A newer message brings it back (get_conversations).
create or replace function public.hide_conversation(conv_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update conversation_members
    set hidden_at = now()
    where conversation_id = conv_id
      and user_id = auth.uid();
$$;

revoke all on function public.hide_conversation(uuid) from public, anon;
grant execute on function public.hide_conversation(uuid) to authenticated;


-- delete_my_account()
-- Removes the caller's auth user. profiles cascades from auth.users, and
-- everything else cascades from profiles: posts, comments, likes, follows,
-- notifications, memberships. Messages stay with sender_id null (see the
-- messages table) and a group whose creator is deleted passes to its
-- longest-standing member (on_member_delete). Files in storage are removed
-- by the client before it calls this, while the storage policies still
-- recognise the user; chat photos are found with my_chat_image_paths().
-- Messages that were only a photo are removed, and the rest lose their
-- photo, so nobody is left looking at a broken image.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  delete from messages
  where sender_id = me and image_url is not null and not coalesce(content ~ '\S', false);
  update messages set image_url = null
  where sender_id = me and image_url is not null;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;


-- my_chat_image_paths()
-- Every file the caller uploaded to chat-images, also in conversations they
-- have left (the bucket listing only shows chats you are still in). The
-- client removes these through the Storage API before delete_my_account.
create or replace function public.my_chat_image_paths()
returns setof text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'chat-images'
    and auth.uid() is not null
    and (storage.foldername(o.name))[2] = auth.uid()::text;
$$;

revoke all on function public.my_chat_image_paths() from public, anon;
grant execute on function public.my_chat_image_paths() to authenticated;



-- fetch_posts(...)
-- One read for the feed, a profile, a single post, or the caller's saved
-- posts (p_mode = 'saved'). Returns like and comment counts plus whether the
-- caller liked and saved it, instead of every like row, and the author and
-- images as jsonb. security invoker: the posts policy (visibility and
-- blocks) decides what is returned. The counts come from post_stats (3j).
-- Keyset pagination on (created_at, id): pass the last row's values back
-- as p_before / p_before_id to get the next page. The saved mode pages the
-- same way, by the post's own created_at.
-- Return columns changed (saved_by_me), which create or replace can not do
-- (42P13), so the old signature goes first. The grants below recreate access.
drop function if exists public.fetch_posts(text, uuid, uuid, timestamp, uuid, integer);
drop function if exists public.fetch_posts(text, uuid, uuid, timestamptz, uuid, integer);
create or replace function public.fetch_posts(
  p_mode text default 'all',
  p_author uuid default null,
  p_post_id uuid default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  user_id uuid,
  content text,
  image_url text,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  like_count integer,
  comment_count integer,
  liked_by_me boolean,
  saved_by_me boolean,
  profiles jsonb,
  post_images jsonb
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.content,
    p.image_url,
    p.visibility,
    p.created_at,
    p.updated_at,
    coalesce(ps.like_count, 0) as like_count,
    coalesce(ps.comment_count, 0) as comment_count,
    exists (select 1 from likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
    exists (select 1 from saved_posts sp where sp.post_id = p.id and sp.user_id = auth.uid()) as saved_by_me,
    (
      select jsonb_build_object(
        'id', pr.id,
        'username', pr.username,
        'display_name', pr.display_name,
        'avatar_url', pr.avatar_url
      )
      from profiles pr
      where pr.id = p.user_id
    ) as profiles,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', pi.id, 'post_id', pi.post_id, 'image_url', pi.image_url, 'position', pi.position)
        order by pi.position
      )
      from post_images pi
      where pi.post_id = p.id
    ), '[]'::jsonb) as post_images
  from posts p
  left join post_stats ps on ps.post_id = p.id
  where (p_post_id is null or p.id = p_post_id)
    and (p_author is null or p.user_id = p_author)
    and (
      p_mode <> 'following'
      or p.user_id in (select f.following_id from follows f where f.follower_id = auth.uid())
    )
    and (
      p_mode <> 'saved'
      or exists (select 1 from saved_posts sp where sp.post_id = p.id and sp.user_id = auth.uid())
    )
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, p.id)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.fetch_posts(text, uuid, uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.fetch_posts(text, uuid, uuid, timestamptz, uuid, integer) to authenticated;


-- suggested_follows(p_limit)
-- People the caller does not follow yet, most followed first. Replaces a
-- client that pulled the whole follows table to count.
create or replace function public.suggested_follows(p_limit integer default 5)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  follower_count integer
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    pr.id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.bio,
    (select count(*) from follows f where f.following_id = pr.id)::integer as follower_count
  from profiles pr
  where pr.id <> auth.uid()
    and not public.is_blocked_pair(auth.uid(), pr.id)
    and not exists (
      select 1 from follows f where f.follower_id = auth.uid() and f.following_id = pr.id
    )
  order by follower_count desc, pr.created_at asc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

revoke all on function public.suggested_follows(integer) from public, anon;
grant execute on function public.suggested_follows(integer) to authenticated;


-- active_posters(p_days, p_limit)
-- Who posted most in the last p_days days, counting only posts the caller
-- can see (security invoker). Replaces a client-side tally over 500 rows.
create or replace function public.active_posters(p_days integer default 7, p_limit integer default 5)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  post_count integer
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    pr.id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    count(*)::integer as post_count
  from posts p
  join profiles pr on pr.id = p.user_id
  where p.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
    and not public.is_blocked_pair(auth.uid(), pr.id)
  group by pr.id, pr.username, pr.display_name, pr.avatar_url
  order by post_count desc, max(p.created_at) desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

revoke all on function public.active_posters(integer, integer) from public, anon;
grant execute on function public.active_posters(integer, integer) to authenticated;


-- search_profiles(q, p_after, p_limit)
-- People whose username or display name contains q (case-insensitive,
-- % and _ taken literally; the trigram indexes serve it), alphabetical by
-- username, never anyone in a blocked pair with the caller. Pass the last
-- username seen as p_after for the next page. Returns the same fields as
-- the profile selects in the app.
drop function if exists public.search_profiles(text, text, integer);
create or replace function public.search_profiles(
  q text,
  p_after text default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = public
as $$
  select pr.id, pr.username, pr.display_name, pr.bio, pr.avatar_url, pr.created_at
  from profiles pr
  where length(trim(coalesce(q, ''))) > 0
    and (
      pr.username ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or pr.display_name ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
    and (p_after is null or pr.username > p_after)
    and not public.is_blocked_pair(auth.uid(), pr.id)
  order by pr.username asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_profiles(text, text, integer) from public, anon;
grant execute on function public.search_profiles(text, text, integer) to authenticated;


-- profile_stats(p_user)
-- The three numbers on a profile header in one call. security invoker, so
-- posts_count only counts posts the caller is allowed to see (followers-only
-- and private posts of others stay out of the number).
create or replace function public.profile_stats(p_user uuid)
returns table (
  posts_count integer,
  followers_count integer,
  following_count integer
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select
    (select count(*) from posts p where p.user_id = p_user)::integer,
    (select count(*) from follows f where f.following_id = p_user)::integer,
    (select count(*) from follows f where f.follower_id = p_user)::integer;
$$;

revoke all on function public.profile_stats(uuid) from public, anon;
grant execute on function public.profile_stats(uuid) to authenticated;


-- --------------------------------------------
-- 5. ROW LEVEL SECURITY
--
-- Every app table is login-only: anon loses all table access at the end
-- of this section. Column grants stop clients from writing server-owned
-- fields (ids, timestamps, is_admin, ownership).
-- --------------------------------------------

-- PROFILES
alter table profiles enable row level security;

drop policy if exists "Public profiles are viewable" on profiles;
create policy "Public profiles are viewable"
on profiles for select to authenticated
using (true);

-- with check + column grant: a user can edit their own name, bio and
-- avatar, and nothing else. is_admin is unreachable from the client.
drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
on profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

revoke insert, update on profiles from authenticated;
grant update (username, display_name, bio, avatar_url) on profiles to authenticated;

-- Reading is by named column: is_admin and username_changed_at stay private,
-- and a select of [*] is refused. Keep this list in step with PROFILE_COLUMNS
-- in the client (lib/supabaseClient.ts).
revoke select on profiles from anon, authenticated;
grant select (id, username, display_name, bio, avatar_url, created_at) on profiles to authenticated;


-- POSTS
alter table posts enable row level security;

-- Hidden when the author and the viewer are in a blocked pair, either way
-- round (the author always sees their own posts: a pair never includes
-- oneself). Every child table below inherits this through its posts subquery.
drop policy if exists "Anyone can view public posts" on posts;
create policy "Anyone can view public posts"
on posts for select to authenticated
using (
  (
    visibility = 'public'
    or auth.uid() = user_id
    or (
      visibility = 'followers'
      and exists (
        select 1 from follows
        where follower_id = auth.uid()
        and following_id = posts.user_id
      )
    )
  )
  and not public.is_blocked_pair(auth.uid(), user_id)
);

drop policy if exists "Authenticated users can create posts" on posts;
create policy "Authenticated users can create posts"
on posts for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own posts" on posts;
create policy "Users can update own posts"
on posts for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own posts" on posts;
create policy "Users can delete own posts"
on posts for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can delete any post" on posts;
create policy "Admins can delete any post"
on posts for delete to authenticated
using (public.i_am_admin());

-- Editing can never move a post to another user or bump it to the top of
-- the feed by rewriting created_at.
revoke insert, update on posts from authenticated;
grant insert (user_id, content, image_url, visibility) on posts to authenticated;
grant update (content, image_url, visibility) on posts to authenticated;


-- POST IMAGES, LIKES, COMMENTS, COMMENT LIKES
-- Child rows are visible exactly when their post is: the subquery runs as
-- the caller, so the posts policy above does the visibility work.
alter table post_images enable row level security;

drop policy if exists "Anyone can view post images" on post_images;
create policy "Anyone can view post images"
on post_images for select to authenticated
using (exists (select 1 from posts where id = post_id));

drop policy if exists "Authenticated users can insert post images" on post_images;
create policy "Authenticated users can insert post images"
on post_images for insert to authenticated
with check (auth.uid() = (select user_id from posts where id = post_id));

drop policy if exists "Users can delete own post images" on post_images;
create policy "Users can delete own post images"
on post_images for delete to authenticated
using (auth.uid() = (select user_id from posts where id = post_id));

revoke insert, update on post_images from authenticated;
grant insert (post_id, image_url, position) on post_images to authenticated;


alter table likes enable row level security;

drop policy if exists "Anyone can view likes" on likes;
create policy "Anyone can view likes"
on likes for select to authenticated
using (
  exists (select 1 from posts where id = post_id)
  and not public.is_blocked_pair(auth.uid(), user_id)
);

drop policy if exists "Users can like posts" on likes;
create policy "Users can like posts"
on likes for insert to authenticated
with check (auth.uid() = user_id and exists (select 1 from posts where id = post_id));

drop policy if exists "Users can unlike their likes" on likes;
create policy "Users can unlike their likes"
on likes for delete to authenticated
using (auth.uid() = user_id);

revoke insert, update on likes from authenticated;
grant insert (user_id, post_id) on likes to authenticated;


alter table comments enable row level security;

-- Comments by someone in a blocked pair with the viewer are hidden (replies
-- under a hidden comment stay, so the client drops comments whose parent_id
-- is not in the list it received).
drop policy if exists "Anyone can view comments" on comments;
create policy "Anyone can view comments"
on comments for select to authenticated
using (
  exists (select 1 from posts where id = post_id)
  and not public.is_blocked_pair(auth.uid(), user_id)
);

drop policy if exists "Users can add comments" on comments;
create policy "Users can add comments"
on comments for insert to authenticated
with check (auth.uid() = user_id and exists (select 1 from posts where id = post_id));

drop policy if exists "Users can delete own comments" on comments;
create policy "Users can delete own comments"
on comments for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can delete any comment" on comments;
create policy "Admins can delete any comment"
on comments for delete to authenticated
using (public.i_am_admin());

-- A post's owner can clear comments off their own post. Deleting cascades
-- to replies, comment likes and the comment's bell entry (FKs); the
-- retract triggers are security definer, so RLS is not involved.
drop policy if exists "Post owners can delete comments on their posts" on comments;
create policy "Post owners can delete comments on their posts"
on comments for delete to authenticated
using (exists (
  select 1 from posts p where p.id = comments.post_id and p.user_id = auth.uid()
));

-- You edit only your own comment, and only the text, on a post you can see.
drop policy if exists "Users can edit own comments" on comments;
create policy "Users can edit own comments"
on comments for update to authenticated
using (auth.uid() = user_id and exists (select 1 from posts where id = post_id))
with check (auth.uid() = user_id);

revoke insert, update on comments from authenticated;
grant insert (user_id, post_id, parent_id, content) on comments to authenticated;
grant update (content) on comments to authenticated;


alter table comment_likes enable row level security;

drop policy if exists "Anyone can view comment likes" on comment_likes;
create policy "Anyone can view comment likes"
on comment_likes for select to authenticated
using (
  exists (select 1 from comments where id = comment_id)
  and not public.is_blocked_pair(auth.uid(), user_id)
);

drop policy if exists "Users can like comments" on comment_likes;
create policy "Users can like comments"
on comment_likes for insert to authenticated
with check (auth.uid() = user_id and exists (select 1 from comments where id = comment_id));

drop policy if exists "Users can unlike comments" on comment_likes;
create policy "Users can unlike comments"
on comment_likes for delete to authenticated
using (auth.uid() = user_id);

revoke insert, update on comment_likes from authenticated;
grant insert (user_id, comment_id) on comment_likes to authenticated;


-- FOLLOWS
alter table follows enable row level security;

drop policy if exists "Anyone can view follows" on follows;
create policy "Anyone can view follows"
on follows for select to authenticated
using (true);

drop policy if exists "Users can follow others" on follows;
create policy "Users can follow others"
on follows for insert to authenticated
with check (
  auth.uid() = follower_id
  and not public.is_blocked_pair(follower_id, following_id)
);

drop policy if exists "Users can unfollow" on follows;
create policy "Users can unfollow"
on follows for delete to authenticated
using (auth.uid() = follower_id);

revoke insert, update on follows from authenticated;
grant insert (follower_id, following_id) on follows to authenticated;


-- NOTIFICATIONS: read, mark read, delete. Never insert (triggers only).
alter table notifications enable row level security;

drop policy if exists "Authenticated users can insert notifications" on notifications;

drop policy if exists "Users can view own notifications" on notifications;
create policy "Users can view own notifications"
on notifications for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on notifications;
create policy "Users can update own notifications"
on notifications for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own notifications" on notifications;
create policy "Users can delete own notifications"
on notifications for delete to authenticated
using (auth.uid() = user_id);

revoke insert, update on notifications from authenticated;
grant update (is_read) on notifications to authenticated;


-- CONVERSATIONS
alter table conversations enable row level security;

drop policy if exists "Members can view their conversations" on conversations;
create policy "Members can view their conversations"
on conversations for select to authenticated
using (is_conversation_member(id));

-- Only groups can be renamed, and only by their creator.
drop policy if exists "Members can rename groups" on conversations;
drop policy if exists "Creators can rename groups" on conversations;
create policy "Creators can rename groups"
on conversations for update to authenticated
using (is_group and created_by = auth.uid())
with check (is_group and created_by = auth.uid());

revoke insert, update on conversations from authenticated;
grant update (name) on conversations to authenticated;
-- No direct insert (use create_conversation) and no direct delete
-- (conversations are removed by trigger when the last member leaves).


-- CONVERSATION MEMBERS
alter table conversation_members enable row level security;

drop policy if exists "Members can view co-members" on conversation_members;
create policy "Members can view co-members"
on conversation_members for select to authenticated
using (is_conversation_member(conversation_id));

-- Existing members can add people to a group (not to a DM), up to 50, and
-- nobody in a blocked pair with the person adding them.
drop policy if exists "Members can add people to groups" on conversation_members;
create policy "Members can add people to groups"
on conversation_members for insert to authenticated
with check (
  is_conversation_member(conversation_id)
  and exists (
    select 1 from conversations c
    where c.id = conversation_id and c.is_group = true
  )
  and conversation_member_count(conversation_id) < 50
  and not public.is_blocked_pair(auth.uid(), user_id)
);

-- Users may update only their own row, and only last_read_at.
-- No update policy or grant: last_read_at and hidden_at move only through
-- mark_conversation_read and hide_conversation, always to the server time and
-- only on the caller's own row, so nobody can fake what [Seen] shows.
drop policy if exists "Users can update own membership" on conversation_members;

-- Leave a GROUP. DMs cannot be left (that would orphan a one-person DM);
-- they are hidden instead (hide_conversation).
drop policy if exists "Users can leave conversations" on conversation_members;
drop policy if exists "Users can leave groups" on conversation_members;
create policy "Users can leave groups"
on conversation_members for delete to authenticated
using (
  user_id = auth.uid()
  and exists (select 1 from conversations c where c.id = conversation_id and c.is_group = true)
);

-- The creator can remove anyone else from their group.
drop policy if exists "Creators can remove members" on conversation_members;
create policy "Creators can remove members"
on conversation_members for delete to authenticated
using (
  user_id <> auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = conversation_id and c.is_group = true and c.created_by = auth.uid()
  )
);

revoke insert, update on conversation_members from authenticated;
grant insert (conversation_id, user_id) on conversation_members to authenticated;


-- MESSAGES
alter table messages enable row level security;

drop policy if exists "Members can view messages" on messages;
create policy "Members can view messages"
on messages for select to authenticated
using (is_conversation_member(conversation_id));

drop policy if exists "Members can send messages" on messages;
create policy "Members can send messages"
on messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and is_conversation_member(conversation_id)
);

drop policy if exists "Senders can delete own messages" on messages;
create policy "Senders can delete own messages"
on messages for delete to authenticated
using (sender_id = auth.uid());

-- No update: messages are immutable.
revoke insert, update on messages from authenticated;
grant insert (conversation_id, sender_id, content, image_url, reply_to_id) on messages to authenticated;


-- REPORTS: file a report, see your own; admins see all and mark them
-- resolved. Nobody deletes, and the content itself is never touched here.
alter table reports enable row level security;

drop policy if exists "Users can file reports" on reports;
create policy "Users can file reports"
on reports for insert to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "Reporters can view own reports" on reports;
create policy "Reporters can view own reports"
on reports for select to authenticated
using (reporter_id = auth.uid());

drop policy if exists "Admins can view all reports" on reports;
create policy "Admins can view all reports"
on reports for select to authenticated
using (public.i_am_admin());

drop policy if exists "Admins can resolve reports" on reports;
create policy "Admins can resolve reports"
on reports for update to authenticated
using (public.i_am_admin())
with check (
  public.i_am_admin()
  and (resolved_by is null or resolved_by = auth.uid())
);

revoke all on reports from anon, authenticated;
grant select on reports to authenticated;
grant insert (reporter_id, target_type, target_id, reason) on reports to authenticated;
grant update (resolved_at, resolved_by) on reports to authenticated;


-- BLOCKS: you see, add and remove only your own rows. A blocked person can
-- not select the row, so they cannot tell they were blocked from the table.
alter table blocks enable row level security;

drop policy if exists "Users can view own blocks" on blocks;
create policy "Users can view own blocks"
on blocks for select to authenticated
using (blocker_id = auth.uid());

drop policy if exists "Users can block people" on blocks;
create policy "Users can block people"
on blocks for insert to authenticated
with check (blocker_id = auth.uid());

drop policy if exists "Users can unblock people" on blocks;
create policy "Users can unblock people"
on blocks for delete to authenticated
using (blocker_id = auth.uid());

revoke all on blocks from anon, authenticated;
grant select, delete on blocks to authenticated;
grant insert (blocker_id, blocked_id) on blocks to authenticated;


-- SAVED POSTS: all private to the saver. Only posts they can see can be saved.
alter table saved_posts enable row level security;

drop policy if exists "Users can view own saved posts" on saved_posts;
create policy "Users can view own saved posts"
on saved_posts for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can save posts" on saved_posts;
create policy "Users can save posts"
on saved_posts for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from posts where id = post_id)
);

drop policy if exists "Users can unsave posts" on saved_posts;
create policy "Users can unsave posts"
on saved_posts for delete to authenticated
using (user_id = auth.uid());

revoke all on saved_posts from anon, authenticated;
grant select, delete on saved_posts to authenticated;
grant insert (user_id, post_id) on saved_posts to authenticated;


-- MESSAGE REACTIONS: members of the conversation see everyone's reactions;
-- you add, change and remove only your own, and only while you are a member.
alter table message_reactions enable row level security;

drop policy if exists "Members can view reactions" on message_reactions;
create policy "Members can view reactions"
on message_reactions for select to authenticated
using (
  exists (
    select 1 from messages m
    where m.id = message_id and is_conversation_member(m.conversation_id)
  )
);

drop policy if exists "Members can react" on message_reactions;
create policy "Members can react"
on message_reactions for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from messages m
    where m.id = message_id and is_conversation_member(m.conversation_id)
  )
);

drop policy if exists "Users can change own reaction" on message_reactions;
create policy "Users can change own reaction"
on message_reactions for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from messages m
    where m.id = message_id and is_conversation_member(m.conversation_id)
  )
);

drop policy if exists "Users can remove own reaction" on message_reactions;
create policy "Users can remove own reaction"
on message_reactions for delete to authenticated
using (user_id = auth.uid());

revoke all on message_reactions from anon, authenticated;
grant select, delete on message_reactions to authenticated;
grant insert (message_id, user_id, emoji) on message_reactions to authenticated;
grant update (emoji) on message_reactions to authenticated;


-- ANON: the app is login-only. Logged-out visitors get the auth pages and
-- the username_available RPC, nothing else.
revoke all on all tables in schema public from anon;


-- --------------------------------------------
-- 6. STORAGE
-- --------------------------------------------

-- avatars is a public bucket (served by URL). post-images is PRIVATE since
-- 2026-11-01: the app shows post photos through signed URLs
-- (frontend/src/lib/postImages.ts) while post_images.image_url keeps the
-- public-URL form, which the client turns back into a storage path. Uploads
-- are limited to images, 5 MB, and to the uploader's own folder.
--   avatars:     {user_id}/avatar.{ext}
--   post-images: {user_id}/{post_id}/{n}.{ext}
-- The values below are the source of truth: a re-run puts the bucket settings
-- back to these, and writes nothing when they already match.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  ('post-images', 'post-images', false, 5242880, array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types
  where (buckets.public, buckets.file_size_limit, buckets.allowed_mime_types)
        is distinct from (excluded.public, excluded.file_size_limit, excluded.allowed_mime_types);

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Authenticated users can upload avatars" on storage.objects;
create policy "Authenticated users can upload avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Readable by: the uploader (own folder), an admin (to clean up after
-- removing someone else's post), or anyone who can see the post the file
-- belongs to. Path is {user_id}/{post_id}/{file}, so folder 2 is the post id;
-- the subquery runs as the caller, so the posts policy (public / followers /
-- private) decides. The CASE keeps a malformed path from raising a uuid cast
-- error.
drop policy if exists "Anyone can view post images" on storage.objects;
drop policy if exists "Viewers can read post images" on storage.objects;
create policy "Viewers can read post images"
on storage.objects for select to authenticated
using (
  bucket_id = 'post-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.i_am_admin()
    or exists (
      select 1 from public.posts p
      where p.id = case
        when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[2])::uuid
      end
    )
  )
);

drop policy if exists "Authenticated users can upload post images" on storage.objects;
create policy "Authenticated users can upload post images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Own folder, or an admin cleaning up after deleting someone else's post.
drop policy if exists "Users can delete own post images" on storage.objects;
create policy "Users can delete own post images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'post-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.i_am_admin()
  )
);


-- chat-images is PRIVATE. Path: {conversation_id}/{sender_id}/{uuid}.{ext}
-- Only conversation members can read (via signed URLs); uploads go into
-- the uploader's own folder inside a conversation they belong to.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chat-images', 'chat-images', false, 5242880, array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types
  where (buckets.public, buckets.file_size_limit, buckets.allowed_mime_types)
        is distinct from (excluded.public, excluded.file_size_limit, excluded.allowed_mime_types);

drop policy if exists "Anyone can view chat images" on storage.objects;
drop policy if exists "Users can upload chat images to own folder" on storage.objects;

drop policy if exists "Members can read chat images" on storage.objects;
create policy "Members can read chat images"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
);

-- The sender can always read their own uploads, also after leaving the
-- chat: Storage only deletes files the caller can read, and account
-- deletion removes every chat photo the person sent.
drop policy if exists "Users can read own chat images" on storage.objects;
create policy "Users can read own chat images"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Members can upload chat images" on storage.objects;
create policy "Members can upload chat images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can delete own chat images" on storage.objects;
create policy "Users can delete own chat images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = auth.uid()::text
);


-- --------------------------------------------
-- 7. REALTIME
-- --------------------------------------------

-- 7a. postgres_changes. RLS scopes INSERT/UPDATE events per subscriber.
--     conversation_members and message_reactions are left out on
--     purpose, see 3k and 3l.
--     posts feeds the [new posts] banner; the rest drive chat and the bell.
--     message_reactions drives live reactions in an open chat.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['posts', 'notifications', 'messages', 'conversations'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
    -- Membership and reaction changes go out as private broadcasts
    -- instead (3k, 3l)
    foreach t in array array['conversation_members', 'message_reactions'] loop
      if exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- With RLS on, DELETE payloads only ever contain the primary key and are
-- not RLS-scoped. Keep the default replica identity so nothing more leaks.
alter table posts replica identity default;
alter table notifications replica identity default;
alter table messages replica identity default;
alter table conversation_members replica identity default;
alter table message_reactions replica identity default;

-- 7b. Private broadcast channels for typing indicators: topic typing:{conversation_id}.
--     The same topic carries the [reaction] notices from 3l.
--     Only members can join/send (Realtime Authorization via realtime.messages RLS).
drop policy if exists "Members can receive typing broadcasts" on realtime.messages;
create policy "Members can receive typing broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() ~ '^typing:[0-9a-f-]{36}$'
  and public.is_conversation_member(split_part(realtime.topic(), ':', 2)::uuid)
);

drop policy if exists "Members can send typing broadcasts" on realtime.messages;
create policy "Members can send typing broadcasts"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() ~ '^typing:[0-9a-f-]{36}$'
  and public.is_conversation_member(split_part(realtime.topic(), ':', 2)::uuid)
);


-- 7c. Private inbox topic inbox:{user_id}: membership changes (3k). Only
--     the user can listen; nobody can send from the client.
drop policy if exists "Users can receive their inbox" on realtime.messages;
create policy "Users can receive their inbox"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = 'inbox:' || auth.uid()::text
);


-- --------------------------------------------
-- 8. FINISH
-- --------------------------------------------

-- PostgREST caches the schema; new columns and embeds need a reload.
notify pgrst, 'reload schema';

-- The NOT VALID constraints above are enforced for new writes only. Once
-- you have confirmed existing rows comply (or cleaned them up), you can
-- make them full constraints by running:
--
--   alter table profiles validate constraint profiles_username_check;
--   alter table profiles validate constraint profiles_bio_check;
--   alter table posts    validate constraint posts_content_check;
--   alter table comments validate constraint comments_content_check;
--   alter table follows  validate constraint follows_no_self_check;
--   alter table notifications validate constraint notifications_target_check;
--   alter table profiles validate constraint profiles_username_reserved_check;
--   alter table profiles validate constraint profiles_avatar_url_check;
--   alter table post_images validate constraint post_images_url_check;
--
-- A failure names the offending rows; fix them and run it again.
