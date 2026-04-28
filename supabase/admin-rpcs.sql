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
