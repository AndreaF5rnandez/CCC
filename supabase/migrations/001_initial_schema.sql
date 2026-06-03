create extension if not exists "pgcrypto";

create type insumo_tipo as enum ('material', 'mano_de_obra', 'equipo');
create type obra_estado as enum ('activa', 'pausada', 'finalizada');

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  unidad_medida text not null,
  tipo insumo_tipo not null,
  precio_unitario numeric(14, 2) not null check (precio_unitario >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  unidad_medida text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table obras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cliente text not null,
  direccion text not null,
  fecha_inicio date not null,
  estado obra_estado not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table receta_insumos (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references recetas(id) on delete cascade,
  insumo_id uuid not null references insumos(id) on delete cascade,
  cantidad numeric(14, 4) not null check (cantidad > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receta_id, insumo_id)
);

create table mediciones (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  receta_id uuid not null references recetas(id),
  descripcion text not null,
  dim1 numeric(14, 4),
  dim2 numeric(14, 4),
  dim3 numeric(14, 4),
  cantidad_calculada numeric(18, 4) generated always as (
    coalesce(dim1, 1) * coalesce(dim2, 1) * coalesce(dim3, 1)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dim1 is not null or dim2 is not null or dim3 is not null)
);

create index idx_insumos_tipo on insumos(tipo);
create index idx_receta_insumos_receta_id on receta_insumos(receta_id);
create index idx_receta_insumos_insumo_id on receta_insumos(insumo_id);
create index idx_obras_estado on obras(estado);
create index idx_mediciones_obra_id on mediciones(obra_id);
create index idx_mediciones_receta_id on mediciones(receta_id);

create trigger set_insumos_updated_at
before update on insumos
for each row
execute function set_updated_at();

create trigger set_recetas_updated_at
before update on recetas
for each row
execute function set_updated_at();

create trigger set_obras_updated_at
before update on obras
for each row
execute function set_updated_at();

create trigger set_receta_insumos_updated_at
before update on receta_insumos
for each row
execute function set_updated_at();

create trigger set_mediciones_updated_at
before update on mediciones
for each row
execute function set_updated_at();

-- Las politicas de seguridad RLS de Supabase se van a configurar en una migracion separada.
