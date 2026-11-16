-- Función para registrar un dispositivo nuevo (con aprobación automática si es el primero)
CREATE OR REPLACE FUNCTION public.registrar_dispositivo_kenny(
  p_username TEXT,
  p_fingerprint TEXT,
  p_nombre TEXT,
  p_ubicacion TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_aprobado BOOLEAN;
BEGIN
  -- Verificar que el usuario existe
  IF NOT EXISTS (SELECT 1 FROM crozzo_superadmins WHERE username = UPPER(p_username) AND activo = true) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Contar dispositivos ya registrados para este usuario
  SELECT COUNT(*) INTO v_count
  FROM crozzo_mfa_dispositivos
  WHERE username = UPPER(p_username);

  -- Si es el primer dispositivo, aprobar automáticamente
  v_aprobado := (v_count = 0);

  -- Insertar o actualizar el dispositivo
  INSERT INTO crozzo_mfa_dispositivos (username, fingerprint, nombre, aprobado, creado_en, ultimo_uso)
  VALUES (UPPER(p_username), p_fingerprint, COALESCE(p_nombre, 'Dispositivo ' || (v_count + 1)), v_aprobado, now(), now())
  ON CONFLICT (username, fingerprint) DO UPDATE SET
    nombre = COALESCE(p_nombre, crozzo_mfa_dispositivos.nombre),
    aprobado = v_aprobado OR crozzo_mfa_dispositivos.aprobado,
    ultimo_uso = now();

  -- También actualizar el secreto TOTP con el fingerprint
  INSERT INTO crozzo_mfa_secrets (username, totp_secret, dispositivo_fingerprint, dispositivo_aprobado)
  VALUES (UPPER(p_username), encode(gen_random_bytes(20), 'base64'), p_fingerprint, v_aprobado)
  ON CONFLICT (username) DO UPDATE SET
    dispositivo_fingerprint = p_fingerprint,
    dispositivo_aprobado = v_aprobado OR crozzo_mfa_secrets.dispositivo_aprobado,
    actualizado_en = now();

  IF v_aprobado THEN
    RETURN jsonb_build_object('ok', true, 'aprobado', true, 'mensaje', 'Dispositivo registrado y aprobado automáticamente.');
  ELSE
    RETURN jsonb_build_object('ok', true, 'aprobado', false, 'mensaje', 'Dispositivo registrado. Se requiere aprobación desde un dispositivo ya registrado.');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_dispositivo_kenny(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Función para listar dispositivos registrados (solo KENNY)
CREATE OR REPLACE FUNCTION public.listar_dispositivos_kenny(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispositivos JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crozzo_superadmins WHERE username = UPPER(p_username) AND activo = true) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fingerprint', fingerprint,
    'nombre', nombre,
    'aprobado', aprobado,
    'creado_en', creado_en,
    'ultimo_uso', ultimo_uso
  )), '[]'::jsonb) INTO v_dispositivos
  FROM crozzo_mfa_dispositivos
  WHERE username = UPPER(p_username);

  RETURN jsonb_build_object('ok', true, 'dispositivos', v_dispositivos);
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_dispositivos_kenny(TEXT) TO anon, authenticated;
