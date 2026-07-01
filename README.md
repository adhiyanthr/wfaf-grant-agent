# GrantEquity App Setup

## Structure

- **`index.html`** — Landing page (static)
- **`src/`** — React app source code (builds to `_app/`)
  - `main.tsx` — App entry point
  - `App.tsx` — Main router
  - `pages/` — Page components (Login, Matches, Profile)
  - `lib/` — Utilities (Supabase client, auth functions)
  - `components/` — Reusable components (Nav)
  - `index.css` — Styling
- **`package.json`** — Dependencies and build scripts
- **`vite.config.ts`** — Build configuration
- **`vercel.json`** — Deployment configuration

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

Create a `.env.local` file in the root directory:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these from your Supabase project:
- Go to **Settings** → **API**
- Copy the Project URL and Anon Key

### 3. Configure Supabase Auth

In your Supabase dashboard:

1. Go to **Authentication** → **URL Configuration**
2. Add these redirect URLs:
   - `https://grantequity.org/matches` (production)
   - `http://localhost:5173/matches` (local development)

### 4. Run locally

```bash
npm run dev
```

Visit `http://localhost:5173`

### 5. Build for production

```bash
npm run build
```

This builds:
- The React app to `_app/` (served at `/login`, `/matches`, `/profile`)
- Keeps `index.html` at the root (landing page)

## Deployment

The app is deployed to Vercel. To deploy:

1. Make sure all changes are committed
2. Push to your deployment branch
3. Vercel will automatically build and deploy

Make sure these environment variables are set in Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Features

- **Magic link authentication** — Users sign in with their email
- **Protected routes** — Matches and profile pages require authentication
- **Grant dashboard** — Shows matching grants with fit scores
- **User profile** — Displays organization information

## Database

The app queries the `organizations` table to fetch user organization data. This table is created and populated via the signup form on the landing page.

## Key files to understand

- `src/lib/supabase.ts` — Supabase client initialization
- `src/lib/auth.ts` — Authentication functions (magic link)
- `src/pages/Login.tsx` — Magic link sign-in flow
- `src/pages/Matches.tsx` — Grant dashboard (currently uses sample data)
- `vercel.json` — Routes `/login`, `/matches`, `/profile` to the app
