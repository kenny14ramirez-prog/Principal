-- Tabla de códigos de desbloqueo
CREATE TABLE IF NOT EXISTS public.crozzo_unlock_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMPTZ DEFAULT now(),
  usado_en TIMESTAMPTZ,
  usado_por TEXT
);

-- RLS: bloquear acceso desde clientes
ALTER TABLE crozzo_unlock_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_client_access_unlock_codes" ON crozzo_unlock_codes
  FOR ALL TO anon, authenticated USING (false);

-- Insertar código de desbloqueo (hash bcrypt)
INSERT INTO crozzo_unlock_codes (code_hash)
VALUES (crypt('CROZZO-UNLOCK-2026', gen_salt('bf')))
ON CONFLICT DO NOTHING;

-- Función para verificar código de desbloqueo
CREATE OR REPLACE FUNCTION public.verify_unlock_code(p_code TEXT, p_fingerprint TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code_hash TEXT;
  v_valid BOOLEAN;
BEGIN
  -- Verificar si el código es válido
  SELECT code_hash INTO v_code_hash
  FROM crozzo_unlock_codes
  WHERE activo = true
  LIMIT 1;

  IF v_code_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_active_code');
  END IF;

  v_valid := (extensions.crypt(p_code, v_code_hash) = v_code_hash);

  IF v_valid THEN
    -- Marcar código como usado
    UPDATE crozzo_unlock_codes
    SET usado_en = now(), usado_por = p_fingerprint
    WHERE code_hash = v_code_hash AND activo = true;

    -- Eliminar dispositivo bloqueado
    DELETE FROM crozzo_blocked_devices
    WHERE fingerprint = p_fingerprint;

    RETURN jsonb_build_object('ok', true, 'mensaje', 'Desbloqueo exitoso');
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_code', 'mensaje', 'Código incorrecto');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_unlock_code(TEXT, TEXT) TO anon, authenticated;
