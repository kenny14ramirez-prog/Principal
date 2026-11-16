-- Tabla de cuentas de soporte técnico
CREATE TABLE IF NOT EXISTS public.crozzo_soporte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT,
  permisos JSONB DEFAULT '{}'::jsonb,
  activo BOOLEAN DEFAULT true,
  creado_por TEXT DEFAULT 'KENNY',
  creado_en TIMESTAMPTZ DEFAULT now(),
  ultimo_acceso TIMESTAMPTZ
);

-- Tabla de auditoría (si no existe)
CREATE TABLE IF NOT EXISTS public.crozzo_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accion TEXT NOT NULL,
  usuario TEXT,
  detalle TEXT,
  fecha TIMESTAMPTZ DEFAULT now(),
  tipo TEXT DEFAULT 'general',
  dispositivo TEXT
);

-- RLS: bloquear acceso desde clientes
ALTER TABLE crozzo_soporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE crozzo_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_client_access_soporte" ON crozzo_soporte
  FOR ALL TO anon, authenticated USING (false);

CREATE POLICY "no_client_access_audit" ON crozzo_audit
  FOR ALL TO anon, authenticated USING (false);

-- Función para verificar contraseña de soporte
CREATE OR REPLACE FUNCTION public.verify_soporte_password(p_username TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash
  FROM crozzo_soporte
  WHERE username = UPPER(p_username)
    AND activo = true;

  IF v_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN (crypt(p_password, v_hash) = v_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_soporte_password(TEXT, TEXT) TO anon, authenticated;
