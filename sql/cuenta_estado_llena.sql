-- Estados de cuenta: disponible | llena (Netflix y el resto se llenan con max_puestos).
-- Ejecutar en el SQL Editor de Supabase.

ALTER TABLE public.plataforma
  ADD COLUMN IF NOT EXISTS max_puestos integer NOT NULL DEFAULT 5;

UPDATE public.plataforma
SET max_puestos = 5
WHERE lower(nombre_plat) LIKE '%netflix%';

ALTER TABLE public.cuenta DROP CONSTRAINT IF EXISTS cuenta_estado_check;

UPDATE public.cuenta
SET estado = CASE
  WHEN (
    SELECT count(*) FROM public.usuario_cuenta uc WHERE uc.id_cuenta = cuenta.id
  ) >= COALESCE(
    (SELECT p.max_puestos FROM public.plataforma p WHERE p.id = cuenta.id_plataforma),
    5
  ) THEN 'llena'
  ELSE 'disponible'
END
WHERE estado IN ('disponible', 'vendida', 'llena', 'vencida', 'suspendida');

ALTER TABLE public.cuenta
  ADD CONSTRAINT cuenta_estado_check
  CHECK (estado IN ('disponible', 'llena'));
--hecho