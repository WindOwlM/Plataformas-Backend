-- Permite marcar un puesto como cortado (ya se quitó del perfil de la plataforma).
ALTER TABLE public.usuario_cuenta DROP CONSTRAINT IF EXISTS usuario_cuenta_estado_check;

ALTER TABLE public.usuario_cuenta
  ADD CONSTRAINT usuario_cuenta_estado_check
  CHECK (estado IS NULL OR estado IN ('activa', 'cortado', 'inactiva'));
