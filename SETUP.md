# GrantEquity Login & Dashboard Setup Guide

## What's been created

✅ **Complete React app** for login, dashboard, and user profile
- Magic link authentication via Supabase
- Grant matches dashboard with sample grants
- User profile showing organization information
- Proper routing and navigation

✅ **Build configuration** (Vite + TypeScript)
- Single `npm run build` to compile everything
- Output goes to `_app/` directory
- Landing page stays at `index.html` at root

## Quick Start

### 1. Install dependencies (already done)
```bash
npm install
```

### 2. Add your Supabase credentials

Edit `.env.local` and add your **actual** Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these from Supabase dashboard:
- Go to your project → **Settings** → **API**
- Copy **Project URL** and **Anon Key**

### 3. Configure Supabase Auth redirects

In your Supabase dashboard:
1. Go to **Authentication** → **URL Configuration**
2. Add these redirect URLs for magic links:
   - **Production:** `https://grantequity.org/matches`
   - **Local dev:** `http://localhost:5173/matches`

The user will be redirected here after clicking the magic link in their email.

### 4. Run locally
```bash
npm run dev
```
Opens at `http://localhost:5173`

Test flow:
1. Click "Sign in" link (top right or on landing page)
2. Enter any email address
3. Check your email (or Supabase logs for magic link)
4. Click the magic link
5. You should be redirected to `/matches`

### 5. Build for production
```bash
npm run build
```

This creates:
- `_app/index.html` — app entry point
- `_app/assets/` — compiled JS and CSS
- `index.html` — landing page (unchanged)

## Files Structure

```
grant_equity/
├── index.html                    # Landing page (static)
├── src/
│   ├── main.tsx                  # App entry point
│   ├── App.tsx                   # Main router
│   ├── index.css                 # Styling
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client setup
│   │   └── auth.ts               # Auth functions
│   ├── components/
│   │   └── Nav.tsx               # Navigation bar
│   └── pages/
│       ├── Login.tsx             # Magic link sign-in
│       ├── Matches.tsx           # Grant dashboard
│       ├── Profile.tsx           # User profile
│       └── NotFound.tsx           # 404 page
├── app-entry.html                # App HTML template (for build)
├── vite.config.ts                # Build configuration
├── tsconfig.json                 # TypeScript config
├── package.json                  # Dependencies
├── vercel.json                   # Deployment config
├── .env.local                    # Your secrets (don't commit!)
└── .env.example                  # Template for .env.local
```

## Deployment to Vercel

### 1. Connect your repository
1. Go to [vercel.com](https://vercel.com)
2. Click "Import Project"
3. Connect your GitHub repository
4. Select the `grant_equity` folder

### 2. Add environment variables
In Vercel project settings:
1. Go to **Settings** → **Environment Variables**
2. Add these variables:
   - `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `your-anon-key-here`

### 3. Configure custom domain
1. In Vercel, go to **Settings** → **Domains**
2. Add `grantequity.org`
3. Update DNS to point to Vercel

### 4. Deploy
Push to your main branch, Vercel will automatically build and deploy.

## Key Routes

- `/` — Landing page
- `/login` — Magic link sign-in
- `/matches` — Grant dashboard (protected)
- `/profile` — User profile (protected)

## Database

The app queries the `organizations` table created by the signup form:
```sql
id | email | name | state | county | created_at
```

The magic link ties to the user's email in Supabase Auth.

## Troubleshooting

### Magic link not working
- Check Supabase Auth → URL Configuration has correct redirect URLs
- Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are correct
- Check browser console for errors (F12)

### Login page shows but doesn't accept input
- Check that `.env.local` has valid Supabase credentials
- Make sure the app has internet connection to reach Supabase

### "Page not found" on `/login` or `/matches`
- Make sure `_app/` directory exists with `index.html`
- Verify `vercel.json` has the correct rewrites
- Rebuild: `npm run build`

## What's Next

### Grant data integration
The `/matches` page currently shows **sample grants**. To integrate real grant data:
1. Create a `grants` table in Supabase
2. Update `src/pages/Matches.tsx` to query from Supabase instead of SAMPLE_GRANTS
3. Add logic to match grants based on organization focus areas

### Email verification
Currently magic links work immediately. To add email verification:
1. Update `src/lib/auth.ts` to require email confirmation
2. Add `email_confirmed_at` check before allowing access to `/matches`

### Grant scoring
Add AI-powered grant matching by:
1. Store grant descriptions in Supabase
2. Call Claude API or your grant-scoring service
3. Display fit scores and reasoning on each grant card

## Environment Variables Explained

- `VITE_SUPABASE_URL` — Base URL of your Supabase project
- `VITE_SUPABASE_ANON_KEY` — Public key for Supabase JS client (safe to expose in frontend)

Never commit `.env.local` to git. Add to `.gitignore` (already done).

## Next Steps

1. ✅ App source code created
2. ⏭️ Add your Supabase credentials to `.env.local`
3. ⏭️ Test locally: `npm run dev`
4. ⏭️ Deploy to Vercel
5. ⏭️ Test magic link on live site
6. ⏭️ Integrate real grant data
