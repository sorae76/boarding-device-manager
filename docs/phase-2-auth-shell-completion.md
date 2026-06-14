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
- Current status at Phase 2 completion: working tree clean
- Push status: no push yet

## Phase Commits

### Phase 1

- Commit: `1b4e9c9ad4b5d298bdf7a58b2f17ed67748621c6`
- Message: `Add Phase 1 schema and RLS artifacts`

### Phase 2

- Commit: `f1d22209fc0856dfc991ca4ca9cd8f3056ce80f0`
- Message: `Add Phase 2 app foundation and Supabase auth shell`

## Phase 2 Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Manual browser auth test passed.

## Auth Shell Behavior

- `/login` exists.
- `/app/dashboard` is protected.
- `/app/settings` is protected.
- Unauthenticated `/app/*` requests redirect to `/login?next=<path>`.
- `/auth/callback` exchanges a Supabase auth code for a session and redirects safely.
- Logout works and returns the user to `/login`.

## Explicitly Not Implemented Yet

- Device check-in/check-out.
- Device Time enforcement.
- QR scanning.
- Email sending.
- Production deployment.
