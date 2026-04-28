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

