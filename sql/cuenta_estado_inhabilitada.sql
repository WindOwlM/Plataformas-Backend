-- Ejecutar en el SQL Editor de Supabase (una vez).
-- Permite inhabilitar una cuenta sin borrarla.

ALTER TABLE public.cuenta DROP CONSTRAINT IF EXISTS cuenta_estado_check;

ALTER TABLE public.cuenta
  ADD CONSTRAINT cuenta_estado_check
  CHECK (estado IN ('disponible', 'llena', 'inhabilitada', 'vendida'));
--hecho
