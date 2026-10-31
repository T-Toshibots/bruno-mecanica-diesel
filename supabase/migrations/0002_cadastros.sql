-- Fase 3 — Cadastros: contatos, tabela de preços por cliente, histórico de dono do veículo e fornecedores.
-- ATENÇÃO: preparado, ainda não executado em um projeto Supabase real.

alter table oficina_config
  add column deslocamento_fixo numeric(12,2) not null default 0,
  add column valor_km numeric(12,2) not null default 0;

create table cliente_contatos (
  id uuid primary key,
  cliente_id uuid not null references clientes (id),
  nome text not null,
  papel text not null check (papel in ('frota', 'financeiro', 'outro')),
  telefone text,
  email text
);

-- Linha sem servico_id = valores gerais do cliente (hora técnica e deslocamento)
create table cliente_precos (
  id uuid primary key,
  cliente_id uuid not null references clientes (id),
  servico_id uuid references servicos_catalogo (id),
  valor numeric(12,2),
  valor_hora numeric(12,2),
  deslocamento_fixo numeric(12,2),
  valor_km numeric(12,2)
);

create table veiculo_clientes_hist (
  id uuid primary key,
  veiculo_id uuid not null references veiculos (id),
  cliente_id uuid not null references clientes (id),
  de timestamptz not null,
  ate timestamptz
);

create table fornecedores (
  id uuid primary key,
  nome text not null,
  tipo text not null,
  documento text,
  contato text,
  telefone text,
  email text,
  cidade text,
  observacoes text,
  ativo boolean not null default true
);

do $$
declare t text;
begin
  foreach t in array array['cliente_contatos','cliente_precos','veiculo_clientes_hist','fornecedores'] loop
    execute format('alter table %I
      add column created_at timestamptz not null default now(),
      add column updated_at timestamptz not null default clock_timestamp(),
      add column deleted_at timestamptz,
      add column created_by uuid,
      add column updated_by uuid,
      add column device_id text,
      add column version int not null default 0', t);
    execute format('create index on %I (updated_at)', t);
    execute format('alter table %I enable row level security', t);
    execute format('create trigger sync_meta before insert or update on %I for each row execute function trg_sync_meta()', t);
    -- Escrita: Dono e Secretária
    execute format('create policy escritorio on %I for all using (meu_papel() in (''dono'',''secretaria'')) with check (meu_papel() in (''dono'',''secretaria''))', t);
  end loop;
end $$;

-- Leitura do mecânico: contatos e histórico de veículos (sem preços e sem fornecedores)
create policy leitura on cliente_contatos for select using (meu_papel() is not null);
create policy leitura on veiculo_clientes_hist for select using (meu_papel() is not null);

create unique index clientes_documento_unico on clientes (regexp_replace(documento, '\D', '', 'g')) where deleted_at is null;
create unique index veiculos_placa_unica on veiculos (replace(placa, '-', '')) where deleted_at is null;
