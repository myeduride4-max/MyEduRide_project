# Supabase database setup

## New database (recommended)

1. Create a Supabase project.
2. Open **SQL Editor** → **New query**.
3. Copy and run the entire contents of [`schema.sql`](./schema.sql) in one go.
4. Configure your app `.env` with the project URL and keys.

That is all you need. **Do not** run files under `migrations/` — they are kept only as history; everything is merged into `schema.sql`.

## What `schema.sql` includes

- All tables, indexes, RLS policies, triggers, and comments
- Realtime publication for live gate/dismissal updates
- Platform school seed (`00000000-0000-0000-0000-000000000001`)
- `photos` storage bucket and service-role policy

Merged changes (formerly separate migrations):

| Change | Purpose |
|--------|---------|
| `schools.approval_status` | School registration approval workflow |
| `school_classes` unique on `(school_id, name, section)` | Multiple classes with same name, different arm |
| `dismissal_requests.dismissal_date` | One dismissal per student per calendar day (Lagos) |

## Existing database

If you already ran an older schema, compare your DB to `schema.sql` or use the archived migration SQL in git history. **Do not** re-run the full `schema.sql` on production data without a backup.

## App auth note

`user_profiles.id` references `auth.users`. Users are created by the app via the Supabase Admin API, not by inserting into `user_profiles` directly.
