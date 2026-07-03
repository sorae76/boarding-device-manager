# OAc Device Management - Phase 2 Auth Shell Completion

## Project

- Supabase project: `dormdevice-db`
- Project ref: `haakvegrtyeyedqidgte`
- Supabase URL: `https://haakvegrtyeyedqidgte.supabase.co`

## Initial Tenant and Admin

- First `school_id`: `42bc3608-5424-4437-bfe3-6b44829f192e`
- First admin email: `matthewn@olivetacademy.org`

## Git State

- Current branch: `master`
- Phase 2 Auth Shell stabilization has been pushed to `origin/master`.

## Phase Commits

### Phase 1

- Commit: `1b4e9c9ad4b5d298bdf7a58b2f17ed67748621c6`
- Message: `Add Phase 1 schema and RLS artifacts`

### Phase 2

- Commit: `f1d22209fc0856dfc991ca4ca9cd8f3056ce80f0`
- Message: `Add Phase 2 app foundation and Supabase auth shell`

### Phase 2 Auth Stabilization

- Commit: `dd0d13f`
- Message: `Fix Supabase OAuth session handling and grants`

## Phase 2 Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Manual browser auth test passed.

## Production Verification

- Production URL: `https://boarding-device-manager.vercel.app`
- Vercel production deployment works.
- Google OAuth sign-in works.
- `/auth/callback` works.
- `/app/dashboard` loads after sign-in.
- Authenticated user context shows `Olivet Academy` and `Super Admin`.
- Supabase environment variables are configured in Vercel.
- Supabase Auth Site URL and Redirect URLs are configured.

## Auth Shell Behavior

- `/login` exists.
- `/app/dashboard` is protected.
- `/app/settings` is protected.
- Unauthenticated `/app/*` requests redirect to `/login?next=<path>`.
- `/auth/callback` exchanges a Supabase auth code for a session and redirects safely.
- Logout works and returns the user to `/login`.

## Vercel Environment Variables

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Tracked files must not include real secrets. `SUPABASE_SERVICE_ROLE_KEY` remains a server-only placeholder in `.env.example` and is not used by the current Phase 2 runtime code.

## Supabase Auth URL Settings

Production Site URL:

- `https://boarding-device-manager.vercel.app`

Production Redirect URL:

- `https://boarding-device-manager.vercel.app/auth/callback`

Local development Redirect URL:

- `http://localhost:3001/auth/callback`

Google OAuth provider redirect URI in Google Cloud should point to the Supabase Auth callback for project `haakvegrtyeyedqidgte`:

- `https://haakvegrtyeyedqidgte.supabase.co/auth/v1/callback`

## Grant SQL Note

The grant migration draft below must be applied to Supabase environments that do not already have the authenticated table grants required for session/profile loading:

- `supabase/migrations/20260615001000_grant_authenticated_session_lookup.sql`

The grant SQL is additive and is intended to allow existing RLS policies to evaluate. It does not weaken RLS and does not grant authenticated users broad write access.

## Explicitly Not Implemented Yet

- Device check-in/check-out.
- Device Time enforcement.
- QR scanning.
- Email sending.
- Overdue notice scheduling.
- Parent notifications.

## Recommended Next Phase

Phase 3 should focus on Data Model + Admin UI foundation before workflow implementation. Recommended scope:

- School/admin settings shell.
- Read-only data management foundations for dorms, students, contacts, and devices.
- Admin CRUD planning for tenant-scoped records.
- Supabase query helpers and typed data access patterns.
- No device workflow mutations until the admin/data foundation is approved.
