-- ============================================
-- THE CHRONICLE — CHAT NOTIFICATIONS IN THE BELL
-- Run this whole file ONCE in the Supabase SQL Editor,
-- AFTER schema.sql, policies.sql and chat.sql. Safe to re-run.
-- Adds the 'message' notification type so new chat messages reach the
-- notification bell, collapsed to one unread entry per conversation.
-- ============================================

-- --------------------------------------------
-- 1. NOTIFICATIONS SCHEMA
-- --------------------------------------------

-- Replace the type CHECK. The original was created inline, so its name is not
-- guaranteed: drop every single-column CHECK on `type`, whatever it is called.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'notifications'
       and con.contype = 'c'
       and con.conkey = array[
             (select attnum from pg_attribute
               where attrelid = rel.oid and attname = 'type' and not attisdropped)
           ]
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
end $$;

alter table notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'message'));

-- Message notifications point at a conversation instead of a post.
alter table notifications
  add column if not exists conversation_id uuid references conversations(id) on delete cascade;

-- Each type carries exactly one target. type is NOT NULL, so no NULL passthrough.
alter table notifications drop constraint if exists notifications_target_check;
alter table notifications add constraint notifications_target_check check (
  case when type = 'message'
    then conversation_id is not null and post_id is null
    else conversation_id is null
  end
);

-- Collapse key: at most ONE unread message notification per (user, conversation).
-- A burst of 50 chat messages therefore bumps a single bell entry.
create unique index if not exists idx_notifications_unread_message
  on notifications (user_id, conversation_id)
  where type = 'message' and is_read = false;

-- The bell and the notifications page both order by created_at desc.
create index if not exists idx_notifications_user_created
  on notifications (user_id, created_at desc);

-- Keeps the on-delete-cascade from a conversation off a sequential scan.
create index if not exists idx_notifications_conversation
  on notifications (conversation_id)
  where conversation_id is not null;

-- --------------------------------------------
-- 2. ROW LEVEL SECURITY
-- --------------------------------------------

-- Notifications are never read logged-out.
revoke all on table notifications from anon;

-- Message notifications come from the trigger in section 3 (security definer),
-- never from a client. Blocking type = 'message' here stops a user from
-- forging a bell entry for a conversation they are not even in.
drop policy if exists "Authenticated users can insert notifications" on notifications;
create policy "Authenticated users can insert notifications"
on notifications for insert
to authenticated
with check (auth.uid() = actor_id and type <> 'message');

-- with check stops a recipient from reassigning a row to someone else.
drop policy if exists "Users can update own notifications" on notifications;
create policy "Users can update own notifications"
on notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Column lock-down: is_read is the only field a client ever changes.
revoke update on notifications from authenticated;
grant update (is_read) on notifications to authenticated;

-- Leaving a group has to clear its bell entries: without this the entry would
-- link to a conversation the user can no longer read.
drop policy if exists "Users can delete own notifications" on notifications;
create policy "Users can delete own notifications"
on notifications for delete
to authenticated
using (auth.uid() = user_id);

-- --------------------------------------------
-- 3. FAN-OUT TRIGGER
-- Deliberately a SECOND trigger on messages rather than an edit to chat.sql's
-- on_message_insert(), so re-running either file never drops the other's work.
-- --------------------------------------------
create or replace function public.on_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- --------------------------------------------
-- 4. REALTIME
-- The bell listens to INSERT (new entry) and UPDATE (marked read elsewhere).
-- --------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'notifications'
     )
  then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

-- Default replica identity: UPDATE events carry the new row (all the bell
-- needs) and DELETE events carry only the primary key.
alter table notifications replica identity default;

-- PostgREST embeds notifications -> conversations, so refresh its schema cache.
notify pgrst, 'reload schema';
