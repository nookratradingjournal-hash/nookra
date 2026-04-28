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
