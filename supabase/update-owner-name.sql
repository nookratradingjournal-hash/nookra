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
