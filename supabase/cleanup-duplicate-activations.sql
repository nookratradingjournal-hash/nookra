-- ── One-time cleanup: remove duplicate device activations ────────────────────
-- Run this in the Supabase SQL Editor to remove stale activations caused by
-- the same machine registering with different device IDs (port-specific localStorage).
--
-- This keeps only the most recently seen activation per license.
-- Safe for single-device usage. If you have legitimate multi-device activations,
-- review the SELECT output first before running the DELETE.

-- Step 1: View current activations to confirm duplicates
SELECT a.id, a.device_id, a.device_name, a.activated_at, a.last_seen_at, l.license_key
FROM activations a
JOIN licenses l ON l.id = a.license_id
ORDER BY l.license_key, a.last_seen_at DESC;

-- Step 2: Delete all but the most recently seen activation per license
DELETE FROM activations
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY license_id ORDER BY last_seen_at DESC) AS rn
    FROM activations
  ) ranked
  WHERE rn > 1
);
