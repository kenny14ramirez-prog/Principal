-- Función para verificar contraseña de super admin
-- Se ejecuta con SECURITY DEFINER para acceder a la tabla bloqueada por RLS
CREATE OR REPLACE FUNCTION public.verify_superadmin_password(p_username TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash
  FROM crozzo_superadmins
  WHERE username = UPPER(p_username)
    AND activo = true;

  IF v_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Verificar contraseña con pgcrypto
  RETURN (crypt(p_password, v_hash) = v_hash);
END;
$$;

-- Permitir que anon y authenticated llamen a esta función
GRANT EXECUTE ON FUNCTION public.verify_superadmin_password(TEXT, TEXT) TO anon, authenticated;

-- Función para actualizar último acceso
CREATE OR REPLACE FUNCTION public.update_superadmin_last_access(p_username TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE crozzo_superadmins
  SET ultimo_acceso = now()
  WHERE username = UPPER(p_username);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_superadmin_last_access(TEXT) TO anon, authenticated;
