# Mini Social Media App

A full-stack social media platform built with React + TypeScript + Supabase.

## Project Structure

```
mini-social/
├── frontend/        ← React + Vite + TypeScript app
└── backend/
    └── database/
        ├── schema.sql    ← Table definitions + trigger
        └── policies.sql  ← Row Level Security rules
```

## Setup

### 1. Supabase (Backend)
The SQL files in `backend/database/` have already been run on Supabase.
If setting up fresh, run them in this order in the Supabase SQL Editor:
1. `schema.sql`
2. `policies.sql`

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env   # fill in your Supabase URL and anon key
npm run dev
```

## Features
- Register / Login / Logout
- Create and delete posts
- Like and unlike posts
- Comment on posts
- Follow / unfollow users
- Feed: All Posts or Following only
- User profiles with bio editing
