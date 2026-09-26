# The Chronicle — Mini Social Media App

A full-stack social media platform built with React + TypeScript + Vite + Supabase.

## Project Structure

```
mini-social/
├── frontend/          ← React + Vite + TypeScript app
└── backend/
    └── database/
        └── schema.sql   ← The whole database: tables, triggers, RPCs, RLS, storage, realtime
```

## Frontend Structure

```
frontend/
├── src/
│   ├── lib/
│   │   ├── supabaseClient.ts
│   │   ├── chat.ts             ← Conversation helpers and chat constants
│   │   ├── timeAgo.ts          ← Relative time + UTC-safe timestamp parsing
│   │   ├── errors.ts           ← Supabase error to one readable line
│   │   ├── authErrors.ts       ← Auth error text to one readable line
│   │   ├── search.ts           ← Escapes % and _ for ilike patterns
│   │   ├── names.ts            ← displayName(): display name, else handle
│   │   ├── session.ts          ← Tells apart Logout from an expired session
│   │   ├── useScrollLock.ts    ← Counted body scroll lock shared by modals
│   │   ├── posts.ts            ← fetchPosts(): one RPC for feed, profile, single post
│   │   ├── usePostList.ts      ← Paged post list with keyset load-more
│   │   ├── storage.ts          ← Best-effort cleanup of post and avatar files
│   │   ├── pages.ts            ← One import() per page, shared by lazy routes and prefetching
│   │   ├── reloadOnce.ts       ← Guarded one-shot reload when a deploy swapped the chunks
│   │   ├── useCooldown.ts      ← Client-side submission rate limiting
│   │   └── usePageTitle.ts
│   ├── context/
│   │   ├── ToastContext.ts     ← success / error / info toasts, useToast()
│   │   ├── ToastProvider.tsx
│   │   ├── ChatContext.ts      ← Conversation list, popups, chat actions
│   │   ├── ChatProvider.tsx
│   │   ├── PresenceContext.ts  ← Who is online right now
│   │   └── PresenceProvider.tsx
│   ├── styles/
│   │   ├── global.css
│   │   └── animations.css
│   ├── components/
│   │   ├── AuthLayout/             ← Art panel + form column shared by the auth pages
│   │   ├── PasswordForm/           ← New-password form shared by reset and settings
│   │   ├── ErrorBoundary/          ← Recovery card instead of a blank page; reloads once after a deploy swaps chunks
│   │   ├── LoadingScreen/          ← The ✦ shown by the auth gate and while a page chunk loads
│   │   ├── Toaster/                ← Toast stack, top-centre under the navbar
│   │   ├── Navbar/
│   │   ├── MobileNav/              ← Bottom tab bar for phones
│   │   ├── SearchBar/
│   │   ├── NotificationBell/
│   │   ├── PostCard/
│   │   ├── ComposePost/            ← Post composer, shared by feed and own profile
│   │   ├── LoadMore/               ← Scroll sentinel + button at the end of a paged list
│   │   ├── CommentSection/
│   │   ├── ImageCollage/
│   │   ├── Lightbox/
│   │   ├── EditPostModal/
│   │   ├── ConfirmModal/
│   │   ├── FollowersModal/
│   │   ├── EmptyState/
│   │   ├── ChatDock/               ← Floating chat popups
│   │   ├── ChatPopup/
│   │   ├── ChatThread/
│   │   ├── MessageBubble/
│   │   ├── ConversationList/
│   │   ├── ConversationInfoModal/
│   │   ├── NewChatModal/
│   │   ├── UserPicker/
│   │   ├── SidebarWidget/          ← Shared shell for feed sidebar cards
│   │   ├── ProfileCard/
│   │   ├── QuickLinks/
│   │   ├── WhoToFollow/
│   │   ├── RecentChats/
│   │   ├── ActiveThisWeek/
│   │   └── OnlineNow/
│   └── pages/
│       ├── Login/
│       ├── Register/
│       ├── ForgotPassword/         ← Emails a reset link
│       ├── ResetPassword/          ← Sets the new password from that link
│       ├── Feed/
│       ├── Profile/
│       ├── Post/
│       ├── Search/
│       ├── Notifications/
│       ├── Messages/
│       ├── Settings/               ← Change email, change password, delete account
│       └── NotFound/               ← Real 404 instead of a silent bounce
```

## Features

**Auth**
- Register with live username availability check
- Login / Logout with session persistence
- Friendly error messages for common issues
- Password complexity enforcement (uppercase, lowercase, digits)
- Forgot password: emailed reset link, then a new-password form; a signed-in user can open /reset-password to change theirs
- Unconfirmed email: Login and Register offer a one-click resend of the confirmation email
- Settings page: change email, change password, delete account (type your handle to confirm). Deleting removes your profile, posts, comments, likes, follows, notifications and photos; messages you sent stay as [Deleted user]

**Posts**
- Create posts with text and up to 10 images
- Facebook-style image collage layout (1, 2, 3, 4+ images with overflow indicator)
- Edit post — update text, swap/add images, change visibility
- Delete post with confirmation modal
- Visibility settings: Public, Followers only, Private (enforced via RLS)
- Text truncation with "see more / see less"
- Real-time feed — banner appears when new posts are available
- Cooldown between submissions to stop accidental double posts
- Compose from the feed or straight from your own profile page

**Interactions**
- Like / unlike posts with animated heart
- Comment on posts with avatar display
- Nested comment replies (infinite depth, 3 levels of visual indent)
- Like individual comments
- Delete own comments or replies (admin can delete any)
- Follow / unfollow users
- Followers / following modal listing both sides of a profile

**Profile**
- View any user's profile and post history
- Edit handle, bio and an optional display name (capitals and spaces allowed), shown everywhere with the lowercase handle beneath it
- Upload profile picture via file upload or URL
- Clickable avatar opens fullscreen lightbox
- Follower / following counts, follow and message buttons
- Publish straight from your own profile

**Feed**
- Three-column layout: quick navigation, posts, discovery widgets
- All Posts tab and Following tab
- Sorted by newest first, 20 at a time; scrolling near the end loads the next page (keyset, so a new post never shifts the pages)
- Skeleton loaders while fetching
- Staggered post entrance animations
- Left column: mini profile card (avatar, online dot, bio, post/follower/following counts) and quick links
- Right column: Online now, Who to follow, Recent chats, Active this week
- Columns collapse progressively — left drops at 1000px, both hide at 680px

**Messaging**
- Direct messages and group conversations
- Dedicated /messages page (list + thread) and floating popups on desktop, up to 3 at once
- Minimize a chat to a bubble, or close it
- Typing indicator over a private Supabase broadcast channel
- Seen receipts driven by each member's last_read_at
- Send images, stored in a private bucket and served through short-lived signed URLs
- Unsend your own messages, which also removes the uploaded file
- Messages outlive their author: a deleted account shows as [Deleted user], the thread stays intact
- Create groups and add members. The creator renames the group and can remove members; if the creator leaves, the longest-standing member takes over
- Being added to a group shows in the bell, with a link straight into the chat
- Hide a direct message from your list; it returns on its own the moment either side writes again
- Unread badge on the quick links and the mobile tab bar
- Cooldown between sends

**Presence**
- Supabase Presence channel tracks who is online
- Green dot on avatars across the feed sidebar and chat

**Search**
- Persistent search bar below navbar on all pages
- Real-time dropdown as you type (debounced, 300ms)
- Press Enter to go to full search results page

**Notifications**
- Bell icon in navbar with unread badge
- Notified when someone likes your post, comments, follows you, sends you a chat message, or adds you to a group
- Chat notifications collapse to one unread entry per conversation, so a burst of messages never floods the bell
- Reading a conversation clears its bell entry; leaving a group deletes it
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

**Performance**
- One RPC (fetch_posts) serves the feed, a profile and a single post: like and comment counts plus your own like, never every like row
- Who to follow and Active this week are ranked in Postgres (suggested_follows, active_posters) instead of pulling tables to the browser
- Following feed filters by follows inside the query, so it never sends your follow list back up as a URL
- Comment likes, replies and deletes update the thread in place instead of refetching every comment
- Chat image links are signed for an hour and quietly re-signed before they expire, so a popup left open all day never shows broken images
- Deleting a post, removing images from one, or replacing an avatar also removes the files from storage
- Code splitting: every page is its own chunk loaded on first visit, the chat tree loads only when a popup or /messages is opened, and React and Supabase sit in separate long-lived vendor chunks so a deploy only invalidates app code. First load went from one 540 kB file to a 30 kB shell plus vendors
- The landing page's code downloads while the session is checked, and hovering a navbar link fetches its page early, so the first click rarely waits
- After a deploy, a tab still holding the old page list reloads itself once instead of showing a broken page; hashed assets are cached for a year on Vercel

**Security**
- Row Level Security on every table; the app is login-only, so the anon key has no table access
- Private and followers-only posts hide their images, likes and comments too, not just the post row
- Column-level grants: clients cannot touch ids, timestamps, ownership or is_admin
- Notifications are written only by database triggers, so they cannot be forged or spammed
- Server-side rate limits on posts, comments and messages, on top of the client cooldowns
- Uploads are limited to images, 5 MB, and the uploader's own folder

**Feedback**
- Toast confirmations on saves: profile, photo, post published, updated, deleted
- Every failed write says so, with the server's own message for rate limits
- Error boundary per route: a render crash shows a recovery card, not a blank page
- An expired session says so instead of silently dropping you on the sign-in page
- Partial image uploads report how many failed instead of silently dropping them
- Comment counter on a card tracks the thread as you post and delete
- A post opened from a notification shows its comments straight away
- Notifications page marks read only what it showed you; older unread ones wait

**UI/UX**
- Warm editorial design system — Playfair Display + DM Sans
- Lucide React icons throughout
- Page transitions (fade + slide on route change)
- Staggered post entrance animations
- Like button bounce animation
- Navbar slide-down entrance
- Dropdown scale-in animations
- Empty state illustrations
- Messages link with unread badge in the navbar on every page; bottom tab bar below 680px (Feed, Messages, Profile)
- Native lazy loading on every image; chat threads page their history
- Dark auth pages (Login + Register) with dot grid and decorative typography
- Page titles on every route
- Every new page opens at the top; back and forward keep your place
- Unknown addresses get a 404 page with a way back, not a silent redirect to the feed
- Link previews: title, description and Open Graph tags in index.html, with a 1200x630 card at public/og.png. The absolute host in og:url and og:image is stamped in at build time by the site-url plugin in vite.config.ts (Vercel supplies the production domain, with a fallback for local builds).
- Site icon: a Playfair Display C on the ink tile with the accent rule, as public/favicon.svg (tabs in current browsers), public/favicon.ico (16 and 32 px, older clients and Safari) and public/apple-touch-icon.png (180 px, iOS home screens)
- Phone-sized rules on every screen, including the post page, cards, comment threads, the bell dropdown and the search bar; chat popups go one-at-a-time on tablets
- Relative timestamps ("2h ago", "3d ago"), parsed as UTC to match Postgres
- Accessibility: respects prefers-reduced-motion

**Accessibility**
- A visible focus ring for keyboard users on every control (focus-visible only, so mouse clicks look the same as before); inside scrolling lists and dropdowns the ring is drawn inward so it is never cut off
- Every icon-only button has a spoken name, and like buttons announce whether they are pressed
- Every form field has a label tied to it, or a name of its own where the design shows none; the handle rule on Register and the profile editor is read out with the field
- Image tiles, the bell's entries, the photo pickers and the profile photo are real buttons, so Tab and Enter reach everything the mouse can
- Hover-only controls (unsend a message, close a chat bubble) also appear on keyboard focus
- Secondary grey text meets the 4.5:1 contrast minimum on every background
- Every dialog is announced as one, takes focus when it opens, keeps Tab inside, closes on Escape and hands focus back to the control that opened it; stacked dialogs close one at a time (lib/useDialog.ts)
- Post options is a real menu (arrow keys, Home, End, Escape back to the button); the bell panel works the same way and closes when you Tab out; search suggestions are a combobox, so arrows pick a person while typing continues

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | Plain CSS with CSS custom properties |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Routing | React Router v7 |
| Icons | Lucide React |
| Deployment | Vercel (root directory set to frontend) |

## Database Tables

| Table | Purpose |
|---|---|
| profiles | Extended user info (username, display_name, bio, avatar, is_admin) |
| posts | Posts with text, image_url, and visibility setting |
| post_images | Multiple images per post (up to 10) |
| likes | Many-to-many: users and posts |
| comments | Comments with parent_id for nested replies |
| comment_likes | Likes on individual comments |
| follows | Follow relationships between users |
| notifications | Like, comment, follow and chat message events |
| conversations | A DM or a named group |
| conversation_members | Membership plus last_read_at, which powers unread counts and Seen |
| messages | Text and/or image, immutable, deletable by the sender; kept when the sender's account is deleted |

## Storage Buckets

| Bucket | Visibility | Purpose |
|---|---|---|
| avatars | Public | Profile pictures |
| post-images | Public | Images attached to posts |
| chat-images | Private | Chat attachments, read through signed URLs by members only |

## Setup

### 1. Supabase (Backend)
Run backend/database/schema.sql in the Supabase SQL Editor. One file, the whole backend.

It is idempotent: a fresh install and an upgrade are the same action. After any
schema change, edit the file and run it again. It also creates and configures all
three storage buckets, so there is nothing to click in the dashboard.

One dashboard setting is needed for password reset. In Authentication → URL
Configuration, add the reset page to the Redirect URLs:

```
http://localhost:5173/reset-password
https://your-deployment.vercel.app/reset-password
```

Without it Supabase sends the reset link to the Site URL instead; the app still
steers that landing to the form, but only if the Site URL points at this app.

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
