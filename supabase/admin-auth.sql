-- ══════════════════════════════════════════════════════════════════════════════
-- Admin Authorization Layer — Run this BEFORE admin-rpcs.sql / updates-schema.sql
--
-- Defines:
--   1. `admins` table           — the source of truth for who may call admin RPCs
--   2. `is_admin()` helper      — used inside every admin_* function body
--
-- Every admin_* RPC in admin-rpcs.sql and updates-schema.sql calls is_admin()
-- as its first statement and raises 'unauthorized' if the caller is not listed
-- in `admins`. Those same files also REVOKE EXECUTE from public at the bottom,
-- so the anon key (which ships in the client bundle) cannot even reach the
-- functions. The two checks are independent defences: either alone would stop
-- an anon caller, but both together guarantee no misconfiguration slips past.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── admins table ────────────────────────────────────────────────────────────
-- One row per Supabase Auth user who may invoke admin RPCs. Keyed on
-- auth.users.id so revoking access is as simple as DELETE FROM admins.

CREATE TABLE IF NOT EXISTS admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS with no policies = anon/authenticated cannot read/write the table
-- directly. Only SECURITY DEFINER functions (is_admin() below) and the
-- service role can see rows.
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- ── is_admin() helper ───────────────────────────────────────────────────────
-- Returns true iff the calling JWT's auth.uid() is present in admins.
-- SECURITY DEFINER so it can read `admins` past RLS; STABLE so Postgres can
-- memoize the result within a single query.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION is_admin() FROM public;
GRANT  EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ── How to grant admin access ───────────────────────────────────────────────
-- 1. Create the admin's account via Supabase dashboard → Authentication → Users
--    (or let them sign up through the admin panel sign-in form).
-- 2. Copy the user's UUID from the Users table.
-- 3. Insert into admins:
--
--      INSERT INTO admins (user_id, email)
--      VALUES ('<user-uuid>', '<email>');
--
-- To revoke admin access:
--
--      DELETE FROM admins WHERE user_id = '<user-uuid>';
