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

## Frontend Structure

```
frontend/
├── src/
│   ├── lib/
│   │   ├── supabaseClient.ts
│   │   └── usePageTitle.ts
│   ├── styles/
│   │   └── global.css
│   ├── components/
│   │   ├── Navbar/
│   │   ├── SearchBar/
│   │   ├── NotificationBell/
│   │   ├── PostCard/
│   │   ├── CommentSection/
│   │   ├── ImageCollage/
│   │   ├── ConfirmModal/
│   │   └── EmptyState/
│   └── pages/
│       ├── Login/
│       ├── Register/
│       ├── Feed/
│       ├── Profile/
│       ├── Post/
│       ├── Search/
│       └── Notifications/
```

## Features

**Auth**
- Register with live username availability check
- Login / Logout with session persistence
- Friendly error messages for common issues

**Posts**
- Create posts with text and/or images (up to 10, file upload or URL)
- Image collage layout — 1, 2, 3, or 4+ images with Facebook-style grid
- Text truncation with "see more / see less"
- Delete your own posts with confirmation modal
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
- Skeleton loaders while data fetches

**Search**
- Search bar below the navbar on every page
- Real-time dropdown as you type
- Press Enter to go to the full search results page

**Notifications**
- Bell icon in the navbar with unread badge
- Notified when someone likes your post, comments, or follows you
- Dropdown preview of latest 5, links to full notifications page
- Real-time updates via Supabase subscriptions

**Admin**
- Admin role via `is_admin` flag on profiles
- Admin can delete any post or comment
- Shield icon (🛡️) visible only to admin on others' content
- Confirmation modal before any deletion

**Polish**
- Skeleton loaders on feed and profile
- Empty state illustrations on all pages
- Page titles on every route
- Mobile responsive
- Dark panel auth pages (Login + Register)

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
| `profiles` | Extended user info (username, bio, avatar, is_admin) |
| `posts` | User posts with optional image |
| `post_images` | Multiple images per post (up to 10) |
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