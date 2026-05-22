-- ============================================
-- MINI SOCIAL MEDIA APP — ROW LEVEL SECURITY
-- Run these after schema.sql
-- ============================================

-- PROFILES RLS
alter table profiles enable row level security;

create policy "Public profiles are viewable"
on profiles for select
using (true);

create policy "Users can update own profile"
on profiles for update
using (auth.uid() = id);

-- POSTS RLS
alter table posts enable row level security;

create policy "Anyone can view posts"
on posts for select
using (true);

create policy "Authenticated users can create posts"
on posts for insert
with check (auth.uid() = user_id);

create policy "Users can delete own posts"
on posts for delete
using (auth.uid() = user_id);

-- LIKES RLS
alter table likes enable row level security;

create policy "Anyone can view likes"
on likes for select
using (true);

create policy "Users can like posts"
on likes for insert
with check (auth.uid() = user_id);

create policy "Users can unlike their likes"
on likes for delete
using (auth.uid() = user_id);

-- COMMENTS RLS
alter table comments enable row level security;

create policy "Anyone can view comments"
on comments for select
using (true);

create policy "Users can add comments"
on comments for insert
with check (auth.uid() = user_id);

create policy "Users can delete own comments"
on comments for delete
using (auth.uid() = user_id);

-- FOLLOWS RLS
alter table follows enable row level security;

create policy "Anyone can view follows"
on follows for select
using (true);

create policy "Users can follow others"
on follows for insert
with check (auth.uid() = follower_id);

create policy "Users can unfollow"
on follows for delete
using (auth.uid() = follower_id);
