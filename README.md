# The Chronicle — Mini Social Media App

A full-stack social media platform built with React + TypeScript + Vite + Supabase.

## Project Structure

```
mini-social/
├── frontend/          ← React + Vite + TypeScript app
└── backend/
    └── database/
        ├── schema.sql      ← Table definitions + trigger
        └── policies.sql    ← Row Level Security rules
```

## Features

**Auth**
- Register with live username availability check
- Login / Logout with session persistence
- Friendly error messages for common issues

**Posts**
- Create posts with text and/or image (file upload or URL)
- Delete your own posts
- Real-time feed — banner appears when new posts are available

**Interactions**
- Like / unlike posts
- Comment on posts, delete your own comments
- Follow / unfollow users

**Feed**
- All Posts tab — every post on the platform
- Following tab — only posts from users you follow
- Sorted by newest first

**Profile**
- View any user's profile and posts
- Edit your own username and bio
- Upload a profile picture (file upload or URL)
- Follower / following counts

**Search**
- Search bar below the navbar on every page
- Real-time dropdown as you type
- Press Enter to go to the full search results page

**Notifications**
- Bell icon in the navbar with unread badge
- Notified when someone likes your post, comments, or follows you
- Dropdown preview of latest 5, links to full notifications page
- Real-time updates via Supabase subscriptions

**Polish**
- Skeleton loaders on feed and profile
- Empty state illustrations on all pages
- Page titles on every route
- Mobile responsive

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Plain CSS with CSS variables |
| Backend | Supabase (Auth, Database, Storage, Realtime) |
| Routing | React Router v6 |

## Database Tables

| Table | Purpose |
|---|---|
| `profiles` | Extended user info (username, bio, avatar) |
| `posts` | User posts with optional image |
| `likes` | Many-to-many: users ↔ posts |
| `comments` | Comments on posts |
| `follows` | Follow relationships between users |
| `notifications` | Like, comment, and follow notifications |

## Storage Buckets

| Bucket | Purpose |
|---|---|
| `avatars` | Profile pictures |
| `post-images` | Images attached to posts |

## Setup

### 1. Supabase (Backend)
The SQL files in `backend/database/` have already been run.
If setting up fresh, run in order in the Supabase SQL Editor:
1. `schema.sql`
2. `policies.sql`

Also create two public storage buckets: `avatars` and `post-images`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Fill in `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then:
```bash
npm run dev
```

App runs at `http://localhost:5173`.
fix: better register errors, live username check, realtime feed updates
polish: skeleton loaders, empty states, page titles, mobile fixes
```
