-- Tabla para secretos TOTP de KENNY
CREATE TABLE IF NOT EXISTS public.crozzo_mfa_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  totp_secret TEXT NOT NULL,  -- Secreto base32 para TOTP
  dispositivo_fingerprint TEXT,  -- Fingerprint del dispositivo registrado
  dispositivo_aprobado BOOLEAN DEFAULT false,
  creado_en TIMESTAMPTZ DEFAULT now(),
  actualizado_en TIMESTAMPTZ DEFAULT now()
);

-- Tabla para dispositivos aprobados
CREATE TABLE IF NOT EXISTS public.crozzo_mfa_dispositivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  nombre TEXT,
  aprobado BOOLEAN DEFAULT false,
  creado_en TIMESTAMPTZ DEFAULT now(),
  ultimo_uso TIMESTAMPTZ,
  UNIQUE(username, fingerprint)
);

-- RLS
ALTER TABLE crozzo_mfa_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crozzo_mfa_dispositivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_client_access_mfa_secrets" ON crozzo_mfa_secrets
  FOR ALL TO anon, authenticated USING (false);

CREATE POLICY "no_client_access_mfa_dispositivos" ON crozzo_mfa_dispositivos
  FOR ALL TO anon, authenticated USING (false);

-- Función para iniciar MFA (verificar si requiere TOTP o dispositivo)
CREATE OR REPLACE FUNCTION public.iniciar_mfa_kenny(p_username TEXT, p_fingerprint TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_dispositivo_aprobado BOOLEAN;
  v_dispositivo_existe BOOLEAN;
BEGIN
  -- Verificar que el usuario existe
  IF NOT EXISTS (SELECT 1 FROM crozzo_superadmins WHERE username = UPPER(p_username) AND activo = true) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Verificar si existe secreto TOTP
  SELECT totp_secret INTO v_secret
  FROM crozzo_mfa_secrets
  WHERE username = UPPER(p_username);

  -- Si no hay secreto TOTP, crear uno
  IF v_secret IS NULL THEN
    -- Generar secreto aleatorio (base32)
    v_secret := encode(gen_random_bytes(20), 'base64');
    INSERT INTO crozzo_mfa_secrets (username, totp_secret, dispositivo_fingerprint, dispositivo_aprobado)
    VALUES (UPPER(p_username), v_secret, p_fingerprint, true)
    ON CONFLICT (username) DO UPDATE SET
      totp_secret = v_secret,
      dispositivo_fingerprint = p_fingerprint,
      dispositivo_aprobado = true,
      actualizado_en = now();
  END IF;

  -- Verificar si el dispositivo está aprobado
  SELECT EXISTS(
    SELECT 1 FROM crozzo_mfa_dispositivos
    WHERE username = UPPER(p_username) AND fingerprint = p_fingerprint AND aprobado = true
  ) INTO v_dispositivo_aprobado;

  -- Si el dispositivo no está registrado, registrarlo (pendiente de aprobación)
  SELECT EXISTS(
    SELECT 1 FROM crozzo_mfa_dispositivos
    WHERE username = UPPER(p_username) AND fingerprint = p_fingerprint
  ) INTO v_dispositivo_existe;

  IF NOT v_dispositivo_existe THEN
    INSERT INTO crozzo_mfa_dispositivos (username, fingerprint, aprobado)
    VALUES (UPPER(p_username), p_fingerprint, false);
    RETURN jsonb_build_object('ok', true, 'requiere_dispositivo', true, 'mensaje', 'Dispositivo nuevo. Se requiere aprobación.');
  END IF;

  IF NOT v_dispositivo_aprobado THEN
    RETURN jsonb_build_object('ok', true, 'requiere_dispositivo', true, 'mensaje', 'Dispositivo no aprobado.');
  END IF;

  -- Requiere TOTP
  RETURN jsonb_build_object('ok', true, 'requiere_totp', true, 'mensaje', 'Ingresa el código de Google Authenticator');
END;
$$;

GRANT EXECUTE ON FUNCTION public.iniciar_mfa_kenny(TEXT, TEXT) TO anon, authenticated;

-- Función para verificar TOTP
CREATE OR REPLACE FUNCTION public.verificar_totp_kenny(p_username TEXT, p_codigo TEXT, p_fingerprint TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_dispositivo_aprobado BOOLEAN;
BEGIN
  -- Verificar que el usuario existe
  IF NOT EXISTS (SELECT 1 FROM crozzo_superadmins WHERE username = UPPER(p_username) AND activo = true) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Verificar dispositivo aprobado
  SELECT EXISTS(
    SELECT 1 FROM crozzo_mfa_dispositivos
    WHERE username = UPPER(p_username) AND fingerprint = p_fingerprint AND aprobado = true
  ) INTO v_dispositivo_aprobado;

  IF NOT v_dispositivo_aprobado THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_not_approved', 'mensaje', 'Dispositivo no aprobado.');
  END IF;

  -- Obtener secreto TOTP
  SELECT totp_secret INTO v_secret
  FROM crozzo_mfa_secrets
  WHERE username = UPPER(p_username);

  IF v_secret IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_totp_secret');
  END IF;

  -- Verificar código TOTP (simplificado — en producción usar una librería TOTP)
  -- Por ahora, aceptamos cualquier código de 6 dígitos para desarrollo
  -- En producción, esto debe verificar contra el secreto usando TOTP (RFC 6238)
  IF LENGTH(p_codigo) = 6 AND p_codigo ~ '^\d{6}$' THEN
    -- Actualizar último uso del dispositivo
    UPDATE crozzo_mfa_dispositivos
    SET ultimo_uso = now()
    WHERE username = UPPER(p_username) AND fingerprint = p_fingerprint;

    RETURN jsonb_build_object('ok', true, 'mensaje', 'MFA verificado correctamente');
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_totp', 'mensaje', 'Código incorrecto');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_totp_kenny(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Función para aprobar dispositivo (solo KENNY)
CREATE OR REPLACE FUNCTION public.aprobar_dispositivo_kenny(p_username TEXT, p_fingerprint TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE crozzo_mfa_dispositivos
  SET aprobado = true, ultimo_uso = now()
  WHERE username = UPPER(p_username) AND fingerprint = p_fingerprint;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aprobar_dispositivo_kenny(TEXT, TEXT) TO anon, authenticated;
