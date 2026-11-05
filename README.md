# UNCVRD® Tasks

Internal task manager for the UNCVRD team. Next.js (App Router) + Supabase (Postgres, Google auth, realtime), deployed on Vercel.

- Setup, Google OAuth and deploy steps: `docs/UNCVRD-Tasks_Setup-Guide_v1.md`
- Database schema and security rules: run `supabase/migrations/0001_init.sql`, then `0002_taskr_parity.sql`, in order, in the Supabase SQL Editor
- Seed users and projects: `data/*.csv` then `npm run seed`
- No Supabase keys = demo mode with sample data (`?demo=manager` for the manager view)
