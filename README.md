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
│   │   ├── usePageTitle.ts
│   │   └── timeAgo.ts
│   ├── styles/
│   │   ├── global.css
│   │   └── animations.css
│   ├── components/
│   │   ├── Navbar/
│   │   ├── SearchBar/
│   │   ├── NotificationBell/
│   │   ├── PostCard/
│   │   ├── CommentSection/
│   │   ├── ImageCollage/
│   │   ├── Lightbox/
│   │   ├── EditPostModal/
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
- Password complexity enforcement (uppercase, lowercase, digits)

**Posts**
- Create posts with text and up to 10 images
- Facebook-style image collage layout (1, 2, 3, 4+ images with overflow indicator)
- Edit post — update text, swap/add images, change visibility
- Delete post with confirmation modal
- Visibility settings: Public, Followers only, Private (enforced via RLS)
- Text truncation with "see more / see less"
- Real-time feed — banner appears when new posts are available

**Interactions**
- Like / unlike posts with animated heart
- Comment on posts with avatar display
- Nested comment replies (infinite depth, 3 levels of visual indent)
- Like individual comments
- Delete own comments or replies (admin can delete any)
- Follow / unfollow users

**Feed**
- All Posts tab and Following tab
- Sorted by newest first
- Skeleton loaders while fetching
- Staggered post entrance animations

**Profile**
- View any user's profile and post history
- Edit username and bio
- Upload profile picture via file upload or URL
- Clickable avatar opens fullscreen lightbox
- Follower / following counts
- Follow/unfollow directly from profile

**Search**
- Persistent search bar below navbar on all pages
- Real-time dropdown as you type (debounced, 300ms)
- Press Enter to go to full search results page

**Notifications**
- Bell icon in navbar with unread badge
- Notified when someone likes your post, comments, or follows you
- Dropdown preview of latest 5, links to full notifications page
- Real-time updates via Supabase subscriptions

**Photo Lightbox**
- Click any post image to expand fullscreen
- Keyboard navigation (← → arrows, Escape to close)
- Thumbnail strip for multi-image posts
- Built with React Portal to avoid z-index clipping

**Admin**
- Admin role via is_admin flag on profiles
- Admin can delete any post or comment
- Enforced server-side via Supabase RLS policies

**UI/UX**
- Warm editorial design system — Playfair Display + DM Sans
- Lucide React icons throughout
- Page transitions (fade + slide on route change)
- Staggered post entrance animations
- Like button bounce animation
- Navbar slide-down entrance
- Dropdown scale-in animations
- Empty state illustrations
- Mobile responsive layout
- Dark auth pages (Login + Register) with dot grid and decorative typography
- Page titles on every route
- Relative timestamps ("2h ago", "3d ago")
- Accessibility: respects prefers-reduced-motion

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Plain CSS with CSS custom properties |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Routing | React Router v6 |
| Icons | Lucide React |
| Deployment | Vercel |

## Database Tables

| Table | Purpose |
|---|---|
| profiles | Extended user info (username, bio, avatar, is_admin) |
| posts | Posts with text, image_url, and visibility setting |
| post_images | Multiple images per post (up to 10) |
| likes | Many-to-many: users and posts |
| comments | Comments with parent_id for nested replies |
| comment_likes | Likes on individual comments |
| follows | Follow relationships between users |
| notifications | Like, comment, follow events |

## Storage Buckets

| Bucket | Purpose |
|---|---|
| avatars | Profile pictures |
| post-images | Images attached to posts |

## Setup

### 1. Supabase (Backend)
The SQL files in backend/database/ have already been run.
If setting up fresh, run in order in the Supabase SQL Editor:
1. schema.sql
2. policies.sql

Also create two public storage buckets: avatars and post-images.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Fill in .env:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then:
```bash
npm run dev
```

App runs at http://localhost:5173.