# The Chronicle — Mini Social Media App

[![CI](https://github.com/ShanPla/mini-social-app/actions/workflows/ci.yml/badge.svg)](https://github.com/ShanPla/mini-social-app/actions/workflows/ci.yml)

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
├── e2e/                    ← Playwright smoke tests (signed out, no Supabase writes)
├── public/                 ← Icons, og.png, robots.txt, manifest.webmanifest
├── vercel.json             ← Security headers (CSP), caching, SPA rewrite
├── src/
│   ├── lib/
│   │   ├── supabaseClient.ts
│   │   ├── blocks.ts           ← Block, unblock, save and unsave calls
│   │   ├── mentions.ts         ← @mention parsing, mirrored from the database
│   │   ├── mentionCache.ts     ← Batched @username to profile lookups
│   │   ├── reactions.ts        ← Chat reaction emoji list (matches the CHECK in schema.sql)
│   │   ├── replies.ts          ← Preview text for a quoted chat message
│   │   ├── postImages.ts       ← Signed display URLs for post photos, renewed before they expire
│   │   ├── searchProfiles.ts   ← People search through the search_profiles RPC
│   │   ├── profileStats.ts     ← Post, follower and following counts for a profile
│   │   ├── redirect.ts         ← Safe return-to-page after login
│   │   ├── navActive.ts        ← Which nav link matches the current path
│   │   ├── logout.ts           ← Shared logout: marks it intentional, wipes drafts
│   │   ├── useUnreadNotifications.ts ← Live unread count for the bell
│   │   ├── useMediaQuery.ts    ← Live result of a CSS media query
│   │   ├── chat.ts             ← Conversation helpers and chat constants
│   │   ├── timeAgo.ts          ← Relative time + UTC-safe timestamp parsing
│   │   ├── errors.ts           ← Supabase error to one readable line
│   │   ├── authErrors.ts       ← Auth error text to one readable line
│   │   ├── search.ts           ← Escapes % and _ for ilike patterns
│   │   ├── names.ts            ← displayName(): display name, else handle
│   │   ├── session.ts          ← Tells apart Logout from an expired session
│   │   ├── theme.ts            ← Light / dark / system preference, kept on the device
│   │   ├── drafts.ts           ← Unsent post, comment and message text kept in localStorage
│   │   ├── clipboard.ts        ← Copy to clipboard with a fallback
│   │   ├── images.ts           ← Shrinks big photos in the browser before upload
│   │   ├── menuKeys.ts         ← Arrow, Home and End focus movement for menus and lists
│   │   ├── submitShortcut.ts   ← Ctrl/Cmd+Enter to send
│   │   ├── useDialog.ts        ← Dialog role, focus trap, Escape and focus return for modals
│   │   ├── useObjectUrls.ts    ← Preview URLs that are revoked when no longer used
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
│   │   └── animations.css          ← Keyframes shared across components (one copy of each)
│   ├── components/
│   │   ├── AuthLayout/             ← Art panel + form column shared by the auth pages
│   │   ├── PasswordForm/           ← New-password form shared by reset and settings
│   │   ├── PasswordInput/          ← Password field with show/hide and a Caps Lock warning
│   │   ├── CharCount/              ← Counter that appears and warns as a text limit nears
│   │   ├── MentionInput/           ← Text field with an @mention suggestion list
│   │   ├── MentionText/            ← Text with @mentions turned into profile links
│   │   ├── ReportModal/            ← Report a post, comment or person with a reason
│   │   ├── BlockedList/            ← Blocked people with an Unblock button (Settings)
│   │   ├── LegalPage/              ← Shared shell for the Privacy and Terms pages
│   │   ├── PostSkeletons/          ← Placeholder cards while posts load
│   │   ├── ChatComposer/           ← Message box with image attach, reply bar and send
│   │   ├── ReactionPicker/         ← Emoji row and Reply for a chat message
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
│   ├── main.tsx                    ← Entry: theme init, stale-chunk reload, Vercel Analytics and Speed Insights
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
│       ├── Settings/               ← Change email, change password, theme, blocked people, delete account
│       ├── AdminReports/           ← Admin-only list of reports at /admin/reports
│       ├── Privacy/
│       ├── Terms/
│       └── NotFound/               ← Real 404 instead of a silent bounce
```

## Features

**Auth**
- Show / hide password toggle and a Caps Lock warning on every password field
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
- Drafts are kept on the device: an unsent post, comment or message survives a reload or a closed tab
- Ctrl+Enter (Cmd+Enter on a Mac) sends a post, comment or message
- Character counters appear and warn as a limit nears
- Compose from the feed or straight from your own profile page
- @mention people in posts and comments: a suggestion list appears as you type, and the mention links to the profile
- Save posts to a private Saved tab on your own profile
- Edited posts carry an [edited] marker
- Report a post, a comment or a person

**Interactions**
- Like / unlike posts with animated heart
- Comment on posts with avatar display
- Nested comment replies (infinite depth, 3 levels of visual indent)
- Like individual comments
- Delete own comments or replies (admin can delete any)
- Follow / unfollow users
- Followers / following modal listing both sides of a profile
- Block a person from their profile: neither of you sees the other's posts, comments or likes, follows are removed and direct messages stop. Manage blocked people in Settings

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
- React to a message with one of six emoji, and reply to (quote) a specific message
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
- Notified when someone likes your post, comments, follows you, mentions you, sends you a chat message, or adds you to a group
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
- Admin role via is_admin flag on profiles, private to the database (i_am_admin tells you about yourself)
- Copy link on every post (the post options menu): copies /post/:id, and for followers-only or private posts the toast says who can open it
- Admin can delete any post or comment
- Enforced server-side via Supabase RLS policies
- Reports page at /admin/reports lists open and resolved reports; only admins can open it

**Performance**
- One RPC (fetch_posts) serves the feed, a profile and a single post: like and comment counts plus your own like, never every like row
- Who to follow and Active this week are ranked in Postgres (suggested_follows, active_posters) instead of pulling tables to the browser
- Following feed filters by follows inside the query, so it never sends your follow list back up as a URL
- Comment likes, replies and deletes update the thread in place instead of refetching every comment
- Chat image links are signed for an hour and quietly re-signed before they expire, so a popup left open all day never shows broken images
- Deleting a post, removing images from one, or replacing an avatar also removes the files from storage
- Pictures are shrunk in the browser before upload (lib/images.ts): the longest edge is capped at 2048 px for posts, 1600 for chat and 1024 for avatars, so a 12 MB phone photo goes up as roughly 1 MB. Transparency is kept, GIFs and small pictures go up untouched, and resized photos lose their hidden metadata, location included
- Code splitting: every page is its own chunk loaded on first visit, the chat tree loads only when a popup or /messages is opened, and React and Supabase sit in separate long-lived vendor chunks so a deploy only invalidates app code. First load went from one 540 kB file to a 30 kB shell plus vendors
- The landing page's code downloads while the session is checked, and hovering a navbar link fetches its page early, so the first click rarely waits
- After a deploy, a tab still holding the old page list reloads itself once instead of showing a broken page; hashed assets are cached for a year on Vercel

**Security**
- Row Level Security on every table; the app is login-only, so the anon key has no table access
- Private and followers-only posts hide their images, likes and comments too, not just the post row
- Post photos live in a private bucket and are shown through signed URLs, so a photo is readable only by people who can see its post
- Blocks are enforced in RLS in both directions, and the blocked person cannot see that a block exists
- Reports are one per reporter per target; reporter and admins only can read them
- Column-level grants: clients cannot touch ids, timestamps, ownership or is_admin
- Notifications are written only by database triggers, so they cannot be forged or spammed
- Server-side rate limits on posts, comments and messages, on top of the client cooldowns
- Uploads are limited to images, 5 MB, and the uploader's own folder
- Response headers set in vercel.json: a Content-Security-Policy (scripts only from the app itself plus the hashed theme script, connections only to the app's Supabase project and Vercel's vitals endpoint), X-Frame-Options DENY, nosniff, a strict referrer policy and a locked-down Permissions-Policy. Images allow any https source because an avatar can be set from a URL
- Dependency hygiene: CI fails on a high or critical advisory in production dependencies (npm audit), and Dependabot opens grouped weekly update pull requests

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
- Dark mode: follows the device by default; Settings offers System, Light or Dark and the navbar has a sun and moon switch. The choice is kept on the device (lib/theme.ts), applied by a small script in index.html before the first paint so a dark page never flashes white, and synced across open tabs. Every colour is a CSS variable in styles/global.css with a dark value, and every text colour in the dark theme meets 4.5:1
- Lucide React icons throughout
- Installable: a web app manifest with 192 and 512 px icons plus a maskable one; robots.txt keeps search engines to the public pages
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
- Every piece of text meets the 4.5:1 contrast minimum in both themes, and meaningful icons (notification types, toast icons) meet 3:1
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
| Deployment | Vercel (root directory set to frontend), with Vercel Analytics and Speed Insights for page views and web vitals |
| Tests | Vitest (unit), Playwright (browser smoke) |

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
| notifications | Like, comment, follow, mention, group-add and chat message events |
| conversations | A DM or a named group |
| conversation_members | Membership plus last_read_at, which powers unread counts and Seen |
| messages | Text and/or image, immutable, deletable by the sender; kept when the sender's account is deleted; reply_to_id points at a quoted message |
| message_reactions | One emoji reaction per person per message |
| saved_posts | Private bookmarks |
| blocks | Who blocked whom (the blocker reads their own rows only) |
| reports | Reports on posts, comments, users and messages, with open/resolved state |
| rate_events | Log behind the server-side rate limits |

## Storage Buckets

| Bucket | Visibility | Purpose |
|---|---|---|
| avatars | Public | Profile pictures |
| post-images | Private | Images attached to posts, read through signed URLs |
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

### 3. Checks

Every push and pull request runs the production dependency audit, lint, the unit tests, the type check and a production build on GitHub Actions (`.github/workflows/ci.yml`). The same checks locally:
```bash
cd frontend
npm run lint
npm test          # vitest run
npm run test:watch  # while working
npm run e2e       # Playwright smoke tests in the installed Chrome (not run in CI)
npm run e2e:live   # signed-in tests in e2e-live: real database, throwaway accounts, Confirm email off, not in CI
npm run build     # type check, then production build
```
The unit tests cover the pure helpers in `src/lib` (names, relative times, search escaping, error messages, chat titles and previews, storage paths, drafts, theme preference, page routing, stale-chunk reload, menu keys, mentions, reactions, profile stats, safe redirects, nav matching, the intentional sign-out flag, post photo URLs) and check that the hash in the Content-Security-Policy still matches the inline theme script in index.html. The e2e smoke tests build the app, serve it with `vite preview` and check the signed-out pages (login, register, 404, redirect, robots.txt); they need Chrome installed and never sign in. Anything else that needs a browser is checked by scripted runs instead. Test config lives in `vitest.config.ts`, separate from `vite.config.ts` because Vitest carries its own copy of Vite, and `playwright.config.ts`.
`frontend/package-lock.json` is committed: CI installs from it with `npm ci`, so after adding or upgrading a package, commit the updated lockfile too.

Page views and web vitals are collected by Vercel Analytics and Speed Insights; they only report when the app runs on Vercel.

## Licence

MIT, see [LICENSE](LICENSE). Copyright 2026 Shan Platon.
