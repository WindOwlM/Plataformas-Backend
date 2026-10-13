-- Ejecutar en el SQL Editor de Supabase (una vez).

CREATE TABLE IF NOT EXISTS public.usuario_por_ubicar (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  id_usuario uuid NOT NULL,
  id_cuenta_anterior uuid,
  id_plataforma uuid NOT NULL,
  pin character varying,
  vencimiento_usuario date,
  es_combo boolean DEFAULT false,
  valor_venta numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT usuario_por_ubicar_pkey PRIMARY KEY (id),
  CONSTRAINT fk_por_ubicar_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id),
  CONSTRAINT fk_por_ubicar_cuenta FOREIGN KEY (id_cuenta_anterior) REFERENCES public.cuenta(id) ON DELETE SET NULL,
  CONSTRAINT fk_por_ubicar_plataforma FOREIGN KEY (id_plataforma) REFERENCES public.plataforma(id)
);
--hecho