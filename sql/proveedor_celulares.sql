-- Ejecutar en el SQL Editor de Supabase (una vez).

ALTER TABLE public.proveedor
  ADD COLUMN IF NOT EXISTS celulares text[] DEFAULT '{}';
--hecho
