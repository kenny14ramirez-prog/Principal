-- Tabla de dispositivos bloqueados (honeypot)
CREATE TABLE IF NOT EXISTS public.crozzo_blocked_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  bloqueado_en TIMESTAMPTZ DEFAULT now(),
  motivo TEXT DEFAULT 'honeypot_intrusion',
  intentos INTEGER DEFAULT 1,
  ultimo_intento TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fingerprint)
);

-- RLS: bloquear acceso desde clientes (solo service_role puede escribir)
ALTER TABLE crozzo_blocked_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_client_read_blocked" ON crozzo_blocked_devices
  FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "no_client_write_blocked" ON crozzo_blocked_devices
  FOR ALL TO anon, authenticated USING (false);

-- Función para verificar si un dispositivo está bloqueado
CREATE OR REPLACE FUNCTION public.check_device_blocked(p_fingerprint TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM crozzo_blocked_devices
    WHERE fingerprint = p_fingerprint
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_device_blocked(TEXT) TO anon, authenticated;

-- Función para registrar un dispositivo bloqueado
CREATE OR REPLACE FUNCTION public.register_blocked_device(
  p_fingerprint TEXT,
  p_user_agent TEXT,
  p_motivo TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO crozzo_blocked_devices (fingerprint, user_agent, motivo)
  VALUES (p_fingerprint, p_user_agent, COALESCE(p_motivo, 'honeypot_intrusion'))
  ON CONFLICT (fingerprint) DO UPDATE SET
    intentos = crozzo_blocked_devices.intentos + 1,
    ultimo_intento = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_blocked_device(TEXT, TEXT, TEXT) TO anon, authenticated;
