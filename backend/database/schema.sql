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
--   3. Triggers (profile creation, rate limits, notifications, chat)
--   4. RPCs
--   5. Row level security and column grants
--   6. Storage buckets and policies
--   7. Realtime
--   8. Finish
--
-- Conventions
--   * All timestamps are `timestamp` (no zone) in UTC. The client appends
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
  created_at timestamp default now()
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


create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  image_url text,
  visibility text not null default 'public'
    check (visibility in ('public', 'followers', 'private')),
  created_at timestamp default now()
);

-- Image-only posts carry empty content, so only the length is capped.
alter table posts drop constraint if exists posts_content_check;
alter table posts add constraint posts_content_check
  check (length(content) <= 500) not valid;

-- Edited marker: null = never edited. Set by trg_mark_post_edited (3h) only
-- when the text or the visibility changes.
alter table posts add column if not exists updated_at timestamp;


create table if not exists post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade not null,
  image_url text not null,
  position integer not null default 0,
  created_at timestamp default now()
);

alter table post_images drop constraint if exists post_images_url_check;
alter table post_images add constraint post_images_url_check
  check (image_url like 'https://%') not valid;


create table if not exists likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  post_id uuid references posts(id) on delete cascade not null,
  created_at timestamp default now(),
  unique (user_id, post_id)
);


create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  post_id uuid references posts(id) on delete cascade not null,
  parent_id uuid references comments(id) on delete cascade,
  content text not null,
  created_at timestamp default now()
);

alter table comments drop constraint if exists comments_content_check;
alter table comments add constraint comments_content_check
  check (content ~ '\S' and length(content) <= 300) not valid;


create table if not exists comment_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  comment_id uuid references comments(id) on delete cascade not null,
  created_at timestamp default now(),
  unique (user_id, comment_id)
);


create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references profiles(id) on delete cascade not null,
  following_id uuid references profiles(id) on delete cascade not null,
  created_at timestamp default now(),
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
  created_at timestamp default now(),
  last_message_at timestamp default now(),
  constraint conversations_name_check check (
    name is null or (name ~ '\S' and length(name) <= 100)
  )
);

-- Membership. last_read_at powers both unread counts and Seen receipts.
create table if not exists conversation_members (
  conversation_id uuid references conversations(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  joined_at timestamp default now(),
  last_read_at timestamp default now(),
  -- Set when this member hides the conversation from their list. It comes
  -- back by itself once a message newer than this arrives.
  hidden_at timestamp,
  primary key (conversation_id, user_id)
);

alter table conversation_members add column if not exists hidden_at timestamp;

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
  created_at timestamp default now(),
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


-- Notifications are written ONLY by the triggers in section 3. Each type
-- points at exactly one target: a post (like), a post + comment (comment),
-- nothing (follow) or a conversation (message).
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  actor_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  post_id uuid references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  is_read boolean default false,
  created_at timestamp default now()
);

-- Upgrade path for tables created before these columns existed.
alter table notifications
  add column if not exists conversation_id uuid references conversations(id) on delete cascade;
alter table notifications
  add column if not exists comment_id uuid references comments(id) on delete cascade;

-- The original type CHECK was created inline, so its name is not guaranteed.
-- Replace the single-column CHECK(s) on `type` only when there is not
-- exactly one, correctly named, listing exactly the five types below.
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
             and d ~ '''message''::text' and d ~ '''added''::text'
             and (select count(*) from regexp_matches(d, '''[^'']*''::text', 'g')) = 5 as ok
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
      check (type in ('like', 'comment', 'follow', 'message', 'added'));
  end if;
end $$;

-- comment_id is optional on comment rows so entries written before that
-- column existed remain valid.
alter table notifications drop constraint if exists notifications_target_check;
alter table notifications add constraint notifications_target_check check (
  case type
    when 'like'    then post_id is not null and comment_id is null and conversation_id is null
    when 'comment' then post_id is not null and conversation_id is null
    when 'follow'  then post_id is null and comment_id is null and conversation_id is null
    when 'message' then conversation_id is not null and post_id is null and comment_id is null
    when 'added'   then conversation_id is not null and post_id is null and comment_id is null
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
  created_at timestamp not null default timezone('utc', now())
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
  created_at timestamp default timezone('utc', now()),
  resolved_at timestamp,
  resolved_by uuid references profiles(id) on delete set null,
  constraint reports_target_type_check check (target_type in ('post', 'comment', 'user', 'message')),
  constraint reports_reason_check check (reason ~ '\S' and length(reason) <= 500),
  -- one report per reporter per target (also stops repeat spam)
  constraint reports_unique_target unique (reporter_id, target_type, target_id)
);

create index if not exists idx_reports_target on reports (target_type, target_id);
create index if not exists idx_reports_open on reports (created_at desc) where resolved_at is null;


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
-- anon has no table access (section 5), so this is the only door.
create or replace function public.username_available(name text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select not public.is_reserved_username(name) and not exists (
    select 1 from profiles where username = lower(trim(coalesce(name, '')))
  );
$$;
grant execute on function public.username_available(text) to anon, authenticated;


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
  now_utc timestamp := timezone('utc', now());
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
  if owner is not null and owner <> new.user_id then
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
    if owner is not null and owner <> new.user_id then
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
-- bumps one row instead of adding fifty.
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
  if not exists (select 1 from conversations c where c.id = new.conversation_id and c.is_group) then
    return null;
  end if;

  insert into notifications (user_id, actor_id, type, conversation_id, created_at)
  values (new.user_id, actor, 'added', new.conversation_id, coalesce(new.joined_at, timezone('utc', now())))
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
declare now_utc timestamp := timezone('utc', now());
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
    new.updated_at := timezone('utc', now());
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
-- security invoker: normal RLS applies.
create or replace function public.get_conversations()
returns table (
  id uuid,
  is_group boolean,
  name text,
  created_by uuid,
  last_message_at timestamp,
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
  order by c.last_message_at desc;
$$;

revoke all on function public.get_conversations() from public, anon;
grant execute on function public.get_conversations() to authenticated;


-- mark_conversation_read(conv_id)
-- Server time so it always compares correctly with message timestamps.
-- Also clears the conversation's bell entry.
create or replace function public.mark_conversation_read(conv_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
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
security invoker
set search_path = public
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
-- recognise the user.
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
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;



-- fetch_posts(...)
-- One read for the feed, a profile, or a single post. Returns like and
-- comment counts plus whether the caller liked it, instead of every like
-- row, and the author and images as jsonb. security invoker: the posts
-- visibility policy decides what is returned.
-- Keyset pagination on (created_at, id): pass the last row's values back
-- as p_before / p_before_id to get the next page.
-- Return columns changed (updated_at), which create or replace can not do
-- (42P13), so the old signature goes first. The grants below recreate access.
drop function if exists public.fetch_posts(text, uuid, uuid, timestamp, uuid, integer);
create or replace function public.fetch_posts(
  p_mode text default 'all',
  p_author uuid default null,
  p_post_id uuid default null,
  p_before timestamp default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  user_id uuid,
  content text,
  image_url text,
  visibility text,
  created_at timestamp,
  updated_at timestamp,
  like_count integer,
  comment_count integer,
  liked_by_me boolean,
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
    (select count(*) from likes l where l.post_id = p.id)::integer as like_count,
    (select count(*) from comments c where c.post_id = p.id)::integer as comment_count,
    exists (select 1 from likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
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
  where (p_post_id is null or p.id = p_post_id)
    and (p_author is null or p.user_id = p_author)
    and (
      p_mode <> 'following'
      or p.user_id in (select f.following_id from follows f where f.follower_id = auth.uid())
    )
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, p.id)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.fetch_posts(text, uuid, uuid, timestamp, uuid, integer) from public, anon;
grant execute on function public.fetch_posts(text, uuid, uuid, timestamp, uuid, integer) to authenticated;


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
  where p.created_at > timezone('utc', now()) - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
  group by pr.id, pr.username, pr.display_name, pr.avatar_url
  order by post_count desc, max(p.created_at) desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

revoke all on function public.active_posters(integer, integer) from public, anon;
grant execute on function public.active_posters(integer, integer) to authenticated;


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


-- POSTS
alter table posts enable row level security;

drop policy if exists "Anyone can view public posts" on posts;
create policy "Anyone can view public posts"
on posts for select to authenticated
using (
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
using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

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
using (exists (select 1 from posts where id = post_id));

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

drop policy if exists "Anyone can view comments" on comments;
create policy "Anyone can view comments"
on comments for select to authenticated
using (exists (select 1 from posts where id = post_id));

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
using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- A post's owner can clear comments off their own post. Deleting cascades
-- to replies, comment likes and the comment's bell entry (FKs); the
-- retract triggers are security definer, so RLS is not involved.
drop policy if exists "Post owners can delete comments on their posts" on comments;
create policy "Post owners can delete comments on their posts"
on comments for delete to authenticated
using (exists (
  select 1 from posts p where p.id = comments.post_id and p.user_id = auth.uid()
));

revoke insert, update on comments from authenticated;
grant insert (user_id, post_id, parent_id, content) on comments to authenticated;


alter table comment_likes enable row level security;

drop policy if exists "Anyone can view comment likes" on comment_likes;
create policy "Anyone can view comment likes"
on comment_likes for select to authenticated
using (exists (select 1 from comments where id = comment_id));

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
with check (auth.uid() = follower_id);

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

-- Existing members can add people to a group (not to a DM), up to 50.
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
);

-- Users may update only their own row, and only last_read_at.
drop policy if exists "Users can update own membership" on conversation_members;
create policy "Users can update own membership"
on conversation_members for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and is_conversation_member(conversation_id));

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
grant update (last_read_at, hidden_at) on conversation_members to authenticated;


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
grant insert (conversation_id, sender_id, content, image_url) on messages to authenticated;


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
using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Admins can resolve reports" on reports;
create policy "Admins can resolve reports"
on reports for update to authenticated
using (exists (select 1 from profiles where id = auth.uid() and is_admin = true))
with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  and (resolved_by is null or resolved_by = auth.uid())
);

revoke all on reports from anon, authenticated;
grant select on reports to authenticated;
grant insert (reporter_id, target_type, target_id, reason) on reports to authenticated;
grant update (resolved_at, resolved_by) on reports to authenticated;


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
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
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
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
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
--     posts feeds the [new posts] banner; the rest drive chat and the bell.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['posts', 'notifications', 'messages', 'conversation_members', 'conversations'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
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

-- 7b. Private broadcast channels for typing indicators: topic typing:{conversation_id}.
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
