-- ══════════════════════════════════════════════════════════════════════════════
-- Nookra — Supabase bootstrap (single file, paste-once)
--
-- HOW TO USE
--
-- 1. Create a Supabase project at https://supabase.com (free tier is fine).
--
-- 2. In the project dashboard, open SQL Editor → New query.
--
-- 3. Paste THIS ENTIRE FILE into the editor and click Run. Takes a few
--    seconds. No errors expected on a fresh project.
--
-- 4. Open Authentication → Users → Add user. Use the email you want to log
--    into the admin panel with. Copy the new user's UUID from the row.
--
-- 5. Back in SQL Editor, run this snippet (replace both placeholders):
--
--        INSERT INTO admins (user_id, email)
--        VALUES ('<UUID-from-step-4>', '<your-email>');
--
-- 6. Open Settings → API. Copy:
--      - Project URL          → VITE_SUPABASE_URL       in your .env
--      - anon (public) key    → VITE_SUPABASE_ANON_KEY  in your .env
--    (.env.example at the project root shows the exact variable names.)
--
-- 7. Sanity check — in SQL Editor:
--        SELECT count(*) FROM licenses;     -- 0
--        SELECT count(*) FROM admins;       -- 1 (you)
--
-- Done. The desktop app will talk to your Supabase project for license
-- validation, trial enforcement, and release-note fetches.
--
-- Concatenation order below (later sections reference earlier ones):
--   1. schema.sql            licenses, activations, trials + public RPCs
--   2. admin-auth.sql        admins table + is_admin() helper
--   3. admin-rpcs.sql        admin_* RPCs for the admin panel
--   4. updates-schema.sql    release-notes table + What's New RPCs
--   5. update-owner-name.sql update_license_owner_name() RPC
--
-- Idempotency: function definitions use CREATE OR REPLACE. The CREATE TABLE
-- statements do not — re-running this on a project that already has the
-- schema will error on the first table. For a re-run, drop the affected
-- tables first or paste only the sections you actually need.
-- ══════════════════════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Section: schema.sql
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════════════════════
-- Trading Journal — Licensing Schema
-- Run this in Supabase SQL Editor (supabase.com > your project > SQL Editor)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE licenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key text UNIQUE NOT NULL,
  email       text,
  owner_name  text,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'disabled', 'revoked')),
  max_devices int  NOT NULL DEFAULT 2,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE activations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id   uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_id    text NOT NULL,
  device_name  text NOT NULL DEFAULT 'Unknown Device',
  activated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(license_id, device_id)
);

CREATE TABLE trials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   text UNIQUE NOT NULL,
  device_name text NOT NULL DEFAULT 'Unknown Device',
  started_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Enable RLS with NO policies = anon key cannot read/write tables directly.
-- All access goes through SECURITY DEFINER functions below.

ALTER TABLE licenses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trials     ENABLE ROW LEVEL SECURITY;

-- ── RPC: activate_license ───────────────────────────────────────────────────
-- Validates a key, checks device limit, registers device.

CREATE OR REPLACE FUNCTION activate_license(
  p_license_key text,
  p_device_id   text,
  p_device_name text DEFAULT 'Unknown Device'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_license      licenses%ROWTYPE;
  v_device_count int;
  v_activation   activations%ROWTYPE;
BEGIN
  -- Look up the license
  SELECT * INTO v_license FROM licenses WHERE license_key = p_license_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid license key');
  END IF;

  IF v_license.status != 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This license is no longer valid. Please contact support.'
    );
  END IF;

  -- Check if this device is already activated on this license
  SELECT * INTO v_activation
  FROM activations
  WHERE license_id = v_license.id AND device_id = p_device_id;

  IF FOUND THEN
    -- Already registered — update last_seen and return success
    UPDATE activations SET last_seen_at = now() WHERE id = v_activation.id;
    RETURN jsonb_build_object(
      'success', true,
      'session', jsonb_build_object(
        'deviceId',    p_device_id,
        'licenseKey',  p_license_key,
        'status',      'active',
        'activatedAt', v_activation.activated_at,
        'expiresAt',   null
      )
    );
  END IF;

  -- Check device limit
  SELECT count(*) INTO v_device_count
  FROM activations WHERE license_id = v_license.id;

  IF v_device_count >= v_license.max_devices THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'This license is already in use on %s devices. Please deactivate one to continue.',
        v_license.max_devices
      )
    );
  END IF;

  -- Register the device
  INSERT INTO activations (license_id, device_id, device_name)
  VALUES (v_license.id, p_device_id, p_device_name);

  RETURN jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'deviceId',    p_device_id,
      'licenseKey',  p_license_key,
      'status',      'active',
      'activatedAt', now(),
      'expiresAt',   null
    )
  );
END;
$$;

-- ── RPC: start_trial ────────────────────────────────────────────────────────
-- Creates a 24-hour trial or resumes an active one. One trial per device.

CREATE OR REPLACE FUNCTION start_trial(
  p_device_id   text,
  p_device_name text DEFAULT 'Unknown Device'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trial   trials%ROWTYPE;
  v_now     timestamptz := now();
  v_expires timestamptz;
BEGIN
  -- Check for existing trial on this device
  SELECT * INTO v_trial FROM trials WHERE device_id = p_device_id;

  IF FOUND THEN
    IF v_trial.expires_at > v_now THEN
      -- Still active — resume
      RETURN jsonb_build_object(
        'success', true,
        'session', jsonb_build_object(
          'deviceId',    p_device_id,
          'licenseKey',  null,
          'status',      'trial',
          'activatedAt', v_trial.started_at,
          'expiresAt',   v_trial.expires_at
        )
      );
    ELSE
      -- Expired
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Free trial already used on this device'
      );
    END IF;
  END IF;

  -- No trial exists — create new 24-hour trial
  v_expires := v_now + interval '24 hours';

  INSERT INTO trials (device_id, device_name, started_at, expires_at)
  VALUES (p_device_id, p_device_name, v_now, v_expires);

  RETURN jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'deviceId',    p_device_id,
      'licenseKey',  null,
      'status',      'trial',
      'activatedAt', v_now,
      'expiresAt',   v_expires
    )
  );
END;
$$;

-- ── RPC: validate_session ───────────────────────────────────────────────────
-- Checks if an existing session (paid or trial) is still valid.

CREATE OR REPLACE FUNCTION validate_session(
  p_license_key text DEFAULT NULL,
  p_device_id   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_license    licenses%ROWTYPE;
  v_activation activations%ROWTYPE;
  v_trial      trials%ROWTYPE;
  v_now        timestamptz := now();
BEGIN
  -- ── Paid license validation ──
  IF p_license_key IS NOT NULL THEN
    SELECT * INTO v_license FROM licenses WHERE license_key = p_license_key;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'status', 'invalid', 'error', 'License key not found');
    END IF;

    IF v_license.status IN ('revoked', 'disabled') THEN
      RETURN jsonb_build_object('success', false, 'status', 'revoked', 'error', 'This license is no longer valid. Please contact support.');
    END IF;

    -- Check device is still activated
    IF p_device_id IS NOT NULL THEN
      SELECT * INTO v_activation
      FROM activations
      WHERE license_id = v_license.id AND device_id = p_device_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'none', 'error', 'Device not activated on this license');
      END IF;

      UPDATE activations SET last_seen_at = now() WHERE id = v_activation.id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'active',
      'session', jsonb_build_object(
        'deviceId',    p_device_id,
        'licenseKey',  p_license_key,
        'status',      'active',
        'activatedAt', COALESCE(v_activation.activated_at, v_license.created_at),
        'expiresAt',   null
      )
    );
  END IF;

  -- ── Trial validation ──
  IF p_device_id IS NOT NULL THEN
    SELECT * INTO v_trial FROM trials WHERE device_id = p_device_id;

    IF FOUND THEN
      IF v_trial.expires_at > v_now THEN
        RETURN jsonb_build_object(
          'success', true,
          'status', 'trial',
          'session', jsonb_build_object(
            'deviceId',    p_device_id,
            'licenseKey',  null,
            'status',      'trial',
            'activatedAt', v_trial.started_at,
            'expiresAt',   v_trial.expires_at
          )
        );
      ELSE
        RETURN jsonb_build_object('success', false, 'status', 'trialExpired', 'error', 'Trial has expired');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', false, 'status', 'none', 'error', 'No active session');
END;
$$;

-- ── RPC: get_license_info ───────────────────────────────────────────────────
-- Returns license details + list of all activated devices.

CREATE OR REPLACE FUNCTION get_license_info(p_license_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_license licenses%ROWTYPE;
  v_devices jsonb;
BEGIN
  SELECT * INTO v_license FROM licenses WHERE license_key = p_license_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'License not found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'deviceId', a.device_id,
    'deviceName', a.device_name,
    'activatedAt', a.activated_at,
    'lastSeenAt', a.last_seen_at
  ) ORDER BY a.activated_at), '[]'::jsonb)
  INTO v_devices
  FROM activations a
  WHERE a.license_id = v_license.id;

  RETURN jsonb_build_object(
    'success', true,
    'ownerName', v_license.owner_name,
    'maxDevices', v_license.max_devices,
    'deviceCount', jsonb_array_length(v_devices),
    'devices', v_devices
  );
END;
$$;

-- ── RPC: deactivate_device ──────────────────────────────────────────────────
-- Removes a device activation from a license key.

CREATE OR REPLACE FUNCTION deactivate_device(
  p_license_key text,
  p_device_id   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_license licenses%ROWTYPE;
BEGIN
  SELECT * INTO v_license FROM licenses WHERE license_key = p_license_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'License not found');
  END IF;

  DELETE FROM activations
  WHERE license_id = v_license.id AND device_id = p_device_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── RPC: check_trial_status ─────────────────────────────────────────────────
-- Quick check: has this device used a trial? Is it still active?

CREATE OR REPLACE FUNCTION check_trial_status(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trial trials%ROWTYPE;
  v_now   timestamptz := now();
BEGIN
  SELECT * INTO v_trial FROM trials WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('used', false, 'active', false);
  END IF;

  RETURN jsonb_build_object(
    'used',      true,
    'active',    v_trial.expires_at > v_now,
    'startedAt', v_trial.started_at,
    'expiresAt', v_trial.expires_at
  );
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Section: admin-auth.sql
-- ╚══════════════════════════════════════════════════════════════════════════╝

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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Section: admin-rpcs.sql
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════════════════════
-- Admin RPC Functions — Run in Supabase SQL Editor (AFTER admin-auth.sql)
-- These power the internal admin panel for managing licenses, trials, devices.
--
-- Authorization model (defence-in-depth):
--   1. Function body calls is_admin() first. Callers whose auth.uid() is not
--      in the `admins` table get a 42501 (insufficient_privilege) error.
--   2. EXECUTE is revoked from public at the bottom of this file — the anon
--      key (shipped in the client bundle) cannot even invoke the function.
-- Run supabase/admin-auth.sql BEFORE this file so `is_admin()` exists.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── admin_dashboard_stats ───────────────────────────────────────────────────
-- Returns summary counts for the admin dashboard.

CREATE OR REPLACE FUNCTION admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'totalLicenses',    (SELECT count(*) FROM licenses),
    'activeLicenses',   (SELECT count(*) FROM licenses WHERE status = 'active'),
    'disabledLicenses', (SELECT count(*) FROM licenses WHERE status IN ('disabled', 'revoked')),
    'totalDevices',     (SELECT count(*) FROM activations),
    'activeTrials',     (SELECT count(*) FROM trials WHERE expires_at > v_now),
    'expiredTrials',    (SELECT count(*) FROM trials WHERE expires_at <= v_now),
    'totalTrials',      (SELECT count(*) FROM trials)
  );
END;
$$;

-- ── admin_list_licenses ─────────────────────────────────────────────────────
-- Returns all licenses with device counts.

CREATE OR REPLACE FUNCTION admin_list_licenses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
    FROM (
      SELECT
        l.id,
        l.license_key,
        l.email,
        l.owner_name,
        l.status,
        l.max_devices,
        l.created_at,
        (SELECT count(*) FROM activations a WHERE a.license_id = l.id) AS device_count
      FROM licenses l
    ) t
  ), '[]'::jsonb);
END;
$$;

-- ── admin_list_trials ───────────────────────────────────────────────────────
-- Returns all trials with computed status.

CREATE OR REPLACE FUNCTION admin_list_trials()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.started_at DESC)
    FROM (
      SELECT
        tr.id,
        tr.device_id,
        tr.device_name,
        tr.started_at,
        tr.expires_at,
        CASE WHEN tr.expires_at > v_now THEN 'active' ELSE 'expired' END AS status
      FROM trials tr
    ) t
  ), '[]'::jsonb);
END;
$$;

-- ── admin_list_activations ──────────────────────────────────────────────────
-- Returns all device activations with their linked license info.

CREATE OR REPLACE FUNCTION admin_list_activations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.activated_at DESC)
    FROM (
      SELECT
        a.id,
        a.device_id,
        a.device_name,
        a.activated_at,
        a.last_seen_at,
        l.license_key,
        l.owner_name,
        l.status AS license_status
      FROM activations a
      JOIN licenses l ON l.id = a.license_id
    ) t
  ), '[]'::jsonb);
END;
$$;

-- ── admin_update_license_status ─────────────────────────────────────────────
-- Activate, disable, or revoke a license.

CREATE OR REPLACE FUNCTION admin_update_license_status(
  p_license_key text,
  p_status      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('active', 'disabled', 'revoked') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;

  UPDATE licenses SET status = p_status WHERE license_key = p_license_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'License not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── admin_reset_license_devices ─────────────────────────────────────────────
-- Full reset: remove ALL device activations AND clear the owner name.
-- After reset the key behaves like a brand-new, never-activated license.

CREATE OR REPLACE FUNCTION admin_reset_license_devices(p_license_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_license licenses%ROWTYPE;
  v_count   int;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_license FROM licenses WHERE license_key = p_license_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'License not found');
  END IF;

  -- Remove all device activations
  DELETE FROM activations WHERE license_id = v_license.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Clear the owner name so the key acts brand-new on next activation
  UPDATE licenses SET owner_name = NULL WHERE id = v_license.id;

  RETURN jsonb_build_object('success', true, 'removedCount', v_count);
END;
$$;

-- ── admin_remove_activation ─────────────────────────────────────────────────
-- Remove a single device activation by its ID.

CREATE OR REPLACE FUNCTION admin_remove_activation(p_activation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM activations WHERE id = p_activation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Activation not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── admin_reset_trial ───────────────────────────────────────────────────────
-- Delete a trial record so the device can start a fresh trial.

CREATE OR REPLACE FUNCTION admin_reset_trial(p_trial_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM trials WHERE id = p_trial_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trial not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── admin_delete_license ────────────────────────────────────────────────────
-- Permanently delete a license and all its device activations.

CREATE OR REPLACE FUNCTION admin_delete_license(p_license_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_license licenses%ROWTYPE;
  v_count   int;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_license FROM licenses WHERE license_key = p_license_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'License not found');
  END IF;

  -- Delete all activations for this license first
  DELETE FROM activations WHERE license_id = v_license.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Then delete the license itself
  DELETE FROM licenses WHERE id = v_license.id;

  RETURN jsonb_build_object('success', true, 'deletedActivations', v_count);
END;
$$;

-- ── admin_create_license ────────────────────────────────────────────────────
-- Generate a new license key and insert it.

CREATE OR REPLACE FUNCTION admin_create_license(
  p_license_key text,
  p_owner_name  text DEFAULT NULL,
  p_email       text DEFAULT NULL,
  p_max_devices int  DEFAULT 2,
  p_status      text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_license licenses%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('active', 'disabled', 'revoked') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;

  INSERT INTO licenses (license_key, owner_name, email, max_devices, status)
  VALUES (p_license_key, p_owner_name, p_email, p_max_devices, p_status)
  RETURNING * INTO v_license;

  RETURN jsonb_build_object(
    'success', true,
    'license', jsonb_build_object(
      'id', v_license.id,
      'licenseKey', v_license.license_key,
      'ownerName', v_license.owner_name,
      'email', v_license.email,
      'maxDevices', v_license.max_devices,
      'status', v_license.status,
      'createdAt', v_license.created_at
    )
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'License key already exists');
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- ACL: revoke EXECUTE from public, grant to authenticated.
--
-- The in-body is_admin() check is the real authorization. The ACL is
-- defence-in-depth: it prevents the anon role (PostgREST's default role for
-- the anon key) from even reaching the function body.
-- ══════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION admin_dashboard_stats()                               FROM public;
REVOKE EXECUTE ON FUNCTION admin_list_licenses()                                 FROM public;
REVOKE EXECUTE ON FUNCTION admin_list_trials()                                   FROM public;
REVOKE EXECUTE ON FUNCTION admin_list_activations()                              FROM public;
REVOKE EXECUTE ON FUNCTION admin_update_license_status(text, text)               FROM public;
REVOKE EXECUTE ON FUNCTION admin_reset_license_devices(text)                     FROM public;
REVOKE EXECUTE ON FUNCTION admin_remove_activation(uuid)                         FROM public;
REVOKE EXECUTE ON FUNCTION admin_reset_trial(uuid)                               FROM public;
REVOKE EXECUTE ON FUNCTION admin_delete_license(text)                            FROM public;
REVOKE EXECUTE ON FUNCTION admin_create_license(text, text, text, int, text)     FROM public;

GRANT  EXECUTE ON FUNCTION admin_dashboard_stats()                               TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_list_licenses()                                 TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_list_trials()                                   TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_list_activations()                              TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_update_license_status(text, text)               TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_reset_license_devices(text)                     TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_remove_activation(uuid)                         TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_reset_trial(uuid)                               TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_delete_license(text)                            TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_create_license(text, text, text, int, text)     TO authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Section: updates-schema.sql
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════════════════════
-- Updates / Release Notes — Run in Supabase SQL Editor (AFTER admin-auth.sql)
-- Table + RPC functions for admin CRUD and user-facing read access.
--
-- Authorization model:
--   • admin_* functions call is_admin() first and have EXECUTE revoked from
--     public / granted only to authenticated. The anon key cannot invoke them.
--   • get_published_updates() is intentionally open — every user's Settings
--     panel reads it to render "What's New". It only exposes already-published
--     rows, so anon access is safe.
-- Run supabase/admin-auth.sql BEFORE this file so `is_admin()` exists.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS updates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  summary      text        DEFAULT '',
  body         text        DEFAULT '',
  version      text        DEFAULT '',
  status       text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS: block direct anon access — all access goes through SECURITY DEFINER RPCs
ALTER TABLE updates ENABLE ROW LEVEL SECURITY;

-- ── Admin: list all updates ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_list_updates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
    FROM (
      SELECT id, title, summary, body, version, status,
             published_at, created_at, updated_at
      FROM updates
    ) t
  ), '[]'::jsonb);
END;
$$;

-- ── Admin: create update ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_create_update(
  p_title   text,
  p_summary text DEFAULT '',
  p_body    text DEFAULT '',
  p_version text DEFAULT '',
  p_status  text DEFAULT 'draft'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row updates%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('draft', 'published') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;

  INSERT INTO updates (title, summary, body, version, status, published_at)
  VALUES (
    p_title, p_summary, p_body, p_version, p_status,
    CASE WHEN p_status = 'published' THEN now() ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('success', true, 'id', v_row.id);
END;
$$;

-- ── Admin: update (edit) ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_update_update(
  p_id      uuid,
  p_title   text,
  p_summary text,
  p_body    text,
  p_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE updates
  SET title = p_title,
      summary = p_summary,
      body = p_body,
      version = p_version,
      updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Update not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Admin: publish ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_publish_update(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE updates
  SET status = 'published',
      published_at = COALESCE(published_at, now()),
      updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Update not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Admin: unpublish ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_unpublish_update(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE updates
  SET status = 'draft',
      updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Update not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Admin: delete ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_delete_update(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM updates WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Update not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── User-facing: published updates only ─────────────────────────────────────
-- Intentionally open: every user's Settings panel reads this to render
-- "What's New". Only already-published rows are exposed.

CREATE OR REPLACE FUNCTION get_published_updates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.published_at DESC)
    FROM (
      SELECT id, title, summary, body, version, published_at
      FROM updates
      WHERE status = 'published'
    ) t
  ), '[]'::jsonb);
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- ACL: lock down the admin_* functions, leave get_published_updates open.
-- ══════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION admin_list_updates()                                  FROM public;
REVOKE EXECUTE ON FUNCTION admin_create_update(text, text, text, text, text)     FROM public;
REVOKE EXECUTE ON FUNCTION admin_update_update(uuid, text, text, text, text)     FROM public;
REVOKE EXECUTE ON FUNCTION admin_publish_update(uuid)                            FROM public;
REVOKE EXECUTE ON FUNCTION admin_unpublish_update(uuid)                          FROM public;
REVOKE EXECUTE ON FUNCTION admin_delete_update(uuid)                             FROM public;

GRANT  EXECUTE ON FUNCTION admin_list_updates()                                  TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_create_update(text, text, text, text, text)     TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_update_update(uuid, text, text, text, text)     TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_publish_update(uuid)                            TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_unpublish_update(uuid)                          TO authenticated;
GRANT  EXECUTE ON FUNCTION admin_delete_update(uuid)                             TO authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Section: update-owner-name.sql
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION update_license_owner_name(
  p_license_key text,
  p_owner_name  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE licenses SET owner_name = p_owner_name
  WHERE license_key = p_license_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'License not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
