# UNCVRD Tasks: setup guide

Target URL: **https://uncvrd-tasks.vercel.app**

There are four parts. Do them in order. Each one says what you need to copy for the next one.

| Part | Where | You get |
|---|---|---|
| 1. Supabase project | supabase.com | Project URL, anon key, service role key, project ref |
| 2. Google OAuth client | console.cloud.google.com | Client ID, client secret |
| 3. Connect Google to Supabase | Supabase dashboard | Working Google sign-in |
| 4. Deploy | vercel.com (+ GitHub) | The live site |

---

## 1. Create the Supabase project

1. Sign in at https://supabase.com/dashboard and click **New project**.
2. Name: `uncvrd-tasks`. Region: **Southeast Asia (Singapore)**, the closest to Ho Chi Minh City.
3. Generate a database password and keep it in your password manager. The app never needs it.
4. When the project is ready, open **SQL Editor > New query**, paste all of `supabase/migrations/0001_init.sql`, and click **Run**. It creates the tables, the security rules, the @uncvrd.com sign-up gate and live updates.
5. Open **Project Settings > API** (it may be called **API Keys**) and copy:
   - **Project URL**, like `https://abcdefgh.supabase.co`. The `abcdefgh` part is your **project ref**.
   - **anon / publishable key**. Safe to put in the browser.
   - **service_role / secret key**. Only for seeding from your laptop. Never paste it into Vercel or commit it.

## 2. Create the Google OAuth client

1. Go to https://console.cloud.google.com, signed in with your @uncvrd.com account. Create a project named `UNCVRD Tasks`.
2. **APIs & Services > OAuth consent screen** (newer UI: **Google Auth Platform > Branding / Audience**):
   - User type / Audience: **Internal**. This only appears for Google Workspace domains, and it blocks anyone outside uncvrd.com at Google's end. If you only see External, pick it; the app still blocks other domains itself.
   - App name `UNCVRD Tasks`, support email, and the icon mark if you like.
   - Scopes: the defaults (`email`, `profile`, `openid`) are enough.
3. **Credentials > Create credentials > OAuth client ID**, type **Web application**:
   - Authorized JavaScript origins:
     - `https://uncvrd-tasks.vercel.app`
     - `http://localhost:3000`
   - Authorized redirect URIs:
     - `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**.

Google sends people back to **Supabase**, so the Supabase URL is the redirect URI here. The vercel.app address is added as an allowed redirect in step 3 below.

## 3. Connect Google to Supabase

1. Supabase > **Authentication > Sign In / Providers > Google**: turn it on and paste the Client ID and secret. Save.
2. Same page, **Email**: turn it off so Google is the only way in.
3. **Authentication > URL Configuration**:
   - Site URL: `https://uncvrd-tasks.vercel.app`
   - Redirect URLs (add both):
     - `https://uncvrd-tasks.vercel.app/**`
     - `http://localhost:3000/**`

Domain lock, three layers deep:
- Google: Internal consent screen, plus the `hd=uncvrd.com` hint on the sign-in button.
- Database: a trigger refuses to create any account whose email is not @uncvrd.com.
- App: the callback and every page request check the email again and sign out anyone else.

## 4. Seed users and projects

1. Fill in `data/users.csv` (`name,email,job_role,is_manager`) and `data/projects.csv` (`name,parent`). Leave `parent` empty for top-level projects. A child row like `Monthly Issue,TKL Fulfillment` shows as "TKL Fulfillment \ Monthly Issue".
2. Mark at least one person `is_manager` = `true`.
3. Create `.env.local` from `.env.example` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Run `npm install`, then `npm run seed`. It is safe to run again after edits.

People can be seeded before they ever sign in. Their first Google sign-in links to the seeded row by email, so tasks assigned in advance show up straight away. Anyone @uncvrd.com who signs in without a seeded row gets a plain member profile, which a manager can update later.

## 5. Deploy to Vercel

1. Push this folder to a private GitHub repo.
2. Go to https://vercel.com/new, import the repo and set **Project Name** to `uncvrd-tasks`. Vercel then serves it at `uncvrd-tasks.vercel.app`.
3. Add environment variables for Production, Preview and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_ALLOWED_DOMAIN` = `uncvrd.com`
4. Click **Deploy**. Open the site and sign in with Google.

### If `uncvrd-tasks` is taken

Vercel adds a random suffix when a name is taken, like `uncvrd-tasks-x7k2.vercel.app`. Rename the project under **Settings > General > Project Name** to one of these:

- `uncvrd-taskboard`
- `uncvrd-myday`
- `uncvrd-team-tasks`
- `uncvrd-ops-tasks`
- `uncvrd-studio-tasks`

Then put the new URL in three places in place of `uncvrd-tasks.vercel.app`: Google's JavaScript origins (step 2.3), Supabase's Site URL and Redirect URLs (step 3.3).

## Local development

```bash
npm install
```

```bash
npm run dev
```

Without Supabase keys in `.env.local` the app runs in **demo mode**, with sample data and no login. Add `?demo=manager` to the URL to see the manager view. Nothing is saved in demo mode.
