-- ============================================
-- THE CHRONICLE — REAL-TIME CHAT
-- Run this whole file ONCE in the Supabase SQL Editor
-- (after schema.sql and policies.sql). Safe to re-run.
-- Covers: 1:1 + group conversations, messages (text/image),
-- read receipts, unread counts, private image bucket,
-- realtime (postgres_changes + private typing channels).
-- ============================================

-- --------------------------------------------
-- 1. TABLES
-- --------------------------------------------

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

-- Membership. last_read_at powers both unread counts and "Seen" receipts.
create table if not exists conversation_members (
  conversation_id uuid references conversations(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  joined_at timestamp default now(),
  last_read_at timestamp default now(),
  primary key (conversation_id, user_id)
);

-- A message has text, an image, or both.
-- image_url stores the STORAGE PATH inside the private chat-images bucket:
--   {conversation_id}/{sender_id}/{uuid}.{ext}
-- The client turns it into a signed URL when rendering.
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete cascade not null,
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

-- Indexes
create index if not exists idx_conversation_members_user on conversation_members(user_id);
create index if not exists idx_messages_conversation_created on messages(conversation_id, created_at desc, id desc);
create index if not exists idx_conversations_last_message on conversations(last_message_at desc);

-- Realtime note: with RLS on, DELETE payloads only ever contain the primary
-- key ({id} for messages; {conversation_id, user_id} for members) and are
-- not RLS-scoped. Keep the default replica identity so nothing more leaks.
alter table messages replica identity default;
alter table conversation_members replica identity default;

-- Chat tables are never read logged-out: strip the anon role entirely.
revoke all on table conversations, conversation_members, messages from anon;

-- --------------------------------------------
-- 2. HELPERS
-- security definer so policies on conversation_members can call them
-- without recursing into their own RLS.
-- --------------------------------------------
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = conv_id
      and user_id = auth.uid()
  );
$$;

-- Executable by anon too: it safely returns false when auth.uid() is null,
-- and Realtime evaluates policies for every subscriber role.
grant execute on function public.is_conversation_member(uuid) to anon, authenticated;

create or replace function public.conversation_member_count(conv_id uuid)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select count(*) from conversation_members where conversation_id = conv_id;
$$;

grant execute on function public.conversation_member_count(uuid) to anon, authenticated;

-- --------------------------------------------
-- 3. TRIGGERS
-- --------------------------------------------

-- On new message: bump conversation ordering and mark the sender as having
-- read their own message. greatest() guards against out-of-order commits.
create or replace function public.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- When the last member leaves (or is deleted), remove the empty conversation.
create or replace function public.on_member_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from conversations
    where id = old.conversation_id
      and not exists (
        select 1 from conversation_members where conversation_id = old.conversation_id
      );
  return old;
end;
$$;

revoke all on function public.on_member_delete() from public, anon, authenticated;

drop trigger if exists trg_on_member_delete on conversation_members;
create trigger trg_on_member_delete
after delete on conversation_members
for each row execute procedure public.on_member_delete();

-- --------------------------------------------
-- 4. RPC: create_conversation(member_ids, group_name)
-- Creates a conversation with the caller + member_ids.
-- For a DM (one other member, no name) it returns the existing DM if one exists.
-- Returns the conversation id.
-- --------------------------------------------
create or replace function public.create_conversation(member_ids uuid[], group_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
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

  -- Reuse existing DM between the two users.
  -- Advisory lock on the ordered pair prevents two simultaneous calls
  -- (A messages B while B messages A) from creating duplicate DMs.
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
      return conv_id;
    end if;
  end if;

  insert into conversations (is_group, name, created_by)
  values (is_grp, clean_name, me)
  returning id into conv_id;

  insert into conversation_members (conversation_id, user_id)
  select conv_id, m from unnest(others || me) as m;

  return conv_id;
end;
$$;

revoke all on function public.create_conversation(uuid[], text) from public, anon;
grant execute on function public.create_conversation(uuid[], text) to authenticated;

-- --------------------------------------------
-- 5. RPC: get_conversations()
-- The caller's conversation list, newest activity first, with the last
-- message, unread count, and member list (with last_read_at for "Seen").
-- security invoker: normal RLS applies.
-- --------------------------------------------
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
        and m.sender_id <> auth.uid()
        and m.created_at > me.last_read_at
    ) as unread_count,
    (
      select jsonb_agg(
        jsonb_build_object(
          'user_id', cm.user_id,
          'username', p.username,
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
  order by c.last_message_at desc;
$$;

revoke all on function public.get_conversations() from public, anon;
grant execute on function public.get_conversations() to authenticated;

-- --------------------------------------------
-- 6. RPC: mark_conversation_read(conv_id)
-- Uses server time so it always compares correctly with message timestamps.
-- --------------------------------------------
create or replace function public.mark_conversation_read(conv_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update conversation_members
    set last_read_at = now()
    where conversation_id = conv_id
      and user_id = auth.uid();
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- --------------------------------------------
-- 7. ROW LEVEL SECURITY
-- --------------------------------------------

-- CONVERSATIONS
alter table conversations enable row level security;

drop policy if exists "Members can view their conversations" on conversations;
create policy "Members can view their conversations"
on conversations for select to authenticated
using (is_conversation_member(id));

-- Only groups can be edited (renamed) and only by members.
drop policy if exists "Members can rename groups" on conversations;
create policy "Members can rename groups"
on conversations for update to authenticated
using (is_group and is_conversation_member(id))
with check (is_group and is_conversation_member(id));

-- Column lock-down: members may only change the name.
revoke update on conversations from authenticated;
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

-- Column lock-down: adders cannot forge joined_at / last_read_at.
revoke insert on conversation_members from authenticated;
grant insert (conversation_id, user_id) on conversation_members to authenticated;

-- Users may update only their own row, and only last_read_at.
drop policy if exists "Users can update own membership" on conversation_members;
create policy "Users can update own membership"
on conversation_members for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and is_conversation_member(conversation_id));

revoke update on conversation_members from authenticated;
grant update (last_read_at) on conversation_members to authenticated;

-- Leave a GROUP. DMs cannot be left (that would orphan a one-person DM).
drop policy if exists "Users can leave conversations" on conversation_members;
drop policy if exists "Users can leave groups" on conversation_members;
create policy "Users can leave groups"
on conversation_members for delete to authenticated
using (
  user_id = auth.uid()
  and exists (select 1 from conversations c where c.id = conversation_id and c.is_group = true)
);

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

-- Column lock-down: id and created_at are always server-generated.
revoke insert on messages from authenticated;
grant insert (conversation_id, sender_id, content, image_url) on messages to authenticated;

drop policy if exists "Senders can delete own messages" on messages;
create policy "Senders can delete own messages"
on messages for delete to authenticated
using (sender_id = auth.uid());

-- No update: messages are immutable in v1.

-- --------------------------------------------
-- 8. STORAGE: chat-images bucket (PRIVATE)
-- Path convention: {conversation_id}/{sender_id}/{uuid}.{ext}
-- Only conversation members can read (via signed URLs); uploads go into
-- the uploader's own folder inside a conversation they belong to.
-- --------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images', 'chat-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

drop policy if exists "Anyone can view chat images" on storage.objects;
drop policy if exists "Users can upload chat images to own folder" on storage.objects;
drop policy if exists "Members can read chat images" on storage.objects;
drop policy if exists "Members can upload chat images" on storage.objects;
drop policy if exists "Users can delete own chat images" on storage.objects;

create policy "Members can read chat images"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
);

create policy "Members can upload chat images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "Users can delete own chat images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- --------------------------------------------
-- 9. REALTIME
-- --------------------------------------------

-- 9a. postgres_changes: add chat tables to the publication
--     (RLS scopes INSERT/UPDATE events to members). Idempotent.
do $$
declare t text;
begin
  foreach t in array array['messages', 'conversation_members', 'conversations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 9b. Private broadcast channels for typing indicators: topic "typing:{conversation_id}".
--     Only members can join/send. (Realtime Authorization — realtime.messages RLS.)
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
