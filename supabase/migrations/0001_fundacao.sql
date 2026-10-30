-- Fase 2 — Fundação: tabelas, colunas comuns de sincronização, travas, numeração oficial e RLS.
-- Espelha as regras do servidor de demonstração (src/sync/servidor-demo.ts).
-- ATENÇÃO: preparado, ainda não executado em um projeto Supabase real.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Perfis e funções auxiliares de permissão
-- ---------------------------------------------------------------------------
create type papel as enum ('dono', 'secretaria', 'mecanico');

create table funcionarios (
  id uuid primary key,
  nome text not null,
  cpf text,
  telefone text,
  funcao text not null default '',
  especialidades text[] default '{}',
  admissao date,
  ativo boolean not null default true
);

create table perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel papel not null,
  funcionario_id uuid references funcionarios (id),
  ativo boolean not null default true
);

create or replace function meu_papel() returns papel
  language sql stable security definer set search_path = public as
$$ select papel from perfis where id = auth.uid() and ativo $$;

create or replace function meu_funcionario() returns uuid
  language sql stable security definer set search_path = public as
$$ select funcionario_id from perfis where id = auth.uid() and ativo $$;

-- ---------------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------------
create table oficina_config (
  id text primary key default 'oficina',
  nome text not null, documento text, telefone text, email text, endereco text, cidade text, pix text,
  valor_hora numeric(12,2) not null default 0,
  garantia_texto text
);

create table funcionarios_salario (
  id uuid primary key,
  funcionario_id uuid not null references funcionarios (id),
  salario numeric(12,2) not null
);

create table clientes (
  id uuid primary key,
  tipo text not null check (tipo in ('PF', 'PJ')),
  nome text not null, fantasia text, documento text not null, ie text, contato text, telefone text not null, email text,
  cep text, endereco text, cidade text, uf text,
  modalidade text not null, forma_pagamento text not null, condicao text not null, dia_fechamento int,
  limite_credito numeric(12,2), desconto_padrao numeric(5,2), valor_contrato numeric(12,2),
  exige_pedido boolean not null default false,
  ativo boolean not null default true,
  observacoes text
);

create table veiculos (
  id uuid primary key,
  cliente_id uuid not null references clientes (id),
  placa text not null, tipo text not null, marca text not null, modelo text not null,
  ano int, chassi text, frota text, km int, horimetro int
);

create table servicos_catalogo (
  id uuid primary key,
  descricao text not null, categoria text not null, valor numeric(12,2) not null default 0,
  tempo_estimado_min int, garantia_dias int
);

-- ---------------------------------------------------------------------------
-- Ordens de serviço (cada parte em tabela própria)
-- ---------------------------------------------------------------------------
create sequence os_numero_seq;

create table os (
  id uuid primary key,
  numero int unique,
  numero_provisorio text not null,
  status text not null check (status in ('rascunho','orcamento','aprovado','execucao','aguardando','finalizada','faturada','cancelada')),
  cliente_id uuid not null references clientes (id),
  local text not null, tipo text not null, solicitante text,
  relato text not null default '', diagnostico text not null default '',
  desconto_pct numeric(5,2) not null default 0,
  forma_pagamento text not null, pedido_numero text, aprovado_por text,
  vencimento timestamptz, aberta_em timestamptz not null, finalizada_em timestamptz, faturada_em timestamptz, pago_em timestamptz,
  motivo_cancelamento text,
  travada boolean not null default false
);

create table os_veiculos (id uuid primary key, os_id uuid not null references os (id), veiculo_id uuid not null references veiculos (id), km int);
create table os_mecanicos (id uuid primary key, os_id uuid not null references os (id), funcionario_id uuid not null references funcionarios (id));
create table os_itens (
  id uuid primary key, os_id uuid not null references os (id),
  tipo text not null, descricao text not null, qtd numeric(12,3) not null default 1,
  custo numeric(12,2) not null default 0, preco numeric(12,2) not null default 0, ordem int not null default 0
);
create table os_fotos (id uuid primary key, os_id uuid not null references os (id), imagem text not null, legenda text);
create table os_assinaturas (
  id uuid primary key, os_id uuid not null references os (id), papel text not null, nome text not null,
  imagem text not null, offline boolean not null default false, data timestamptz not null
);
create table os_status_hist (
  id uuid primary key, os_id uuid not null references os (id), de text, para text not null,
  motivo text, usuario_nome text not null, data timestamptz not null
);

-- Sistema
create table sync_conflitos (id uuid primary key default gen_random_uuid(), tabela text not null, registro_id uuid not null, perdedor jsonb, vencedor jsonb, usuario_nome text);
create table auditoria (id uuid primary key default gen_random_uuid(), tabela text not null, registro_id uuid not null, acao text not null, usuario_nome text, antes jsonb, depois jsonb);

-- ---------------------------------------------------------------------------
-- Colunas comuns de sincronização em todas as tabelas
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['oficina_config','perfis','funcionarios','funcionarios_salario','clientes','veiculos','servicos_catalogo',
    'os','os_veiculos','os_mecanicos','os_itens','os_fotos','os_assinaturas','os_status_hist','sync_conflitos','auditoria']
  loop
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
  end loop;
end $$;

-- updated_at pelo relógio do servidor, version incrementada, conflito registrado (last-write-wins)
create or replace function trg_sync_meta() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.version is distinct from old.version then
    insert into sync_conflitos (tabela, registro_id, perdedor, vencedor, usuario_nome)
    values (tg_table_name, old.id::uuid, to_jsonb(old), to_jsonb(new), (select nome from perfis where id = auth.uid()));
  end if;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  new.version := coalesce(case when tg_op = 'UPDATE' then old.version end, 0) + 1;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['oficina_config','perfis','funcionarios','funcionarios_salario','clientes','veiculos','servicos_catalogo',
    'os','os_veiculos','os_mecanicos','os_itens','os_fotos','os_assinaturas','os_status_hist']
  loop
    execute format('create trigger sync_meta before insert or update on %I for each row execute function trg_sync_meta()', t);
  end loop;
end $$;

-- Número oficial, trava e regras de valores da OS
create or replace function trg_os_regras() returns trigger language plpgsql security definer set search_path = public as $$
declare livres text[] := array['status','faturada_em','vencimento','pago_em','forma_pagamento','pedido_numero',
  'updated_at','updated_by','device_id','version','created_at','created_by'];
begin
  if tg_op = 'INSERT' or new.numero is null then
    new.numero := coalesce(old.numero, nextval('os_numero_seq'));
  end if;
  if tg_op = 'UPDATE' and old.travada and meu_papel() <> 'dono' then
    if exists (select 1 from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
               where n.value is distinct from o.value and not (key = any (livres)))
       or not (new.status = old.status or (old.status = 'finalizada' and new.status = 'faturada')) then
      raise exception 'Esta OS está finalizada e travada. Só o Dono pode reabrir.';
    end if;
  end if;
  new.travada := new.status in ('finalizada', 'faturada', 'cancelada');
  insert into auditoria (tabela, registro_id, acao, usuario_nome)
  values ('os', new.id, case when tg_op = 'INSERT' then 'criou'
                             when new.status <> old.status then 'status: ' || old.status || ' → ' || new.status
                             else 'alterou' end,
          (select nome from perfis where id = auth.uid()));
  return new;
end $$;
create trigger os_regras before insert or update on os for each row execute function trg_os_regras();

create or replace function trg_itens_valores() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if meu_papel() = 'mecanico' then
    new.preco := coalesce(old.preco, 0);
    new.custo := coalesce(old.custo, 0);
  elsif meu_papel() = 'secretaria' then
    new.custo := coalesce(old.custo, 0);
  end if;
  if exists (select 1 from os where id = new.os_id and travada) and meu_papel() <> 'dono' then
    raise exception 'Esta OS está finalizada e travada. Só o Dono pode reabrir.';
  end if;
  return new;
end $$;
create trigger itens_valores before insert or update on os_itens for each row execute function trg_itens_valores();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
create or replace function os_do_mecanico(p_os uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from os_mecanicos m where m.os_id = p_os and m.funcionario_id = meu_funcionario() and m.deleted_at is null)
      or exists (select 1 from os o where o.id = p_os and o.created_by = auth.uid())
$$;

-- Leitura geral para quem está ativo
create policy leitura on oficina_config for select using (meu_papel() is not null);
create policy leitura on perfis for select using (meu_papel() is not null);
create policy leitura on funcionarios for select using (meu_papel() is not null);
create policy leitura on clientes for select using (meu_papel() is not null);
create policy leitura on veiculos for select using (meu_papel() is not null);
create policy leitura on servicos_catalogo for select using (meu_papel() is not null);

-- Só o Dono
create policy dono on funcionarios_salario for all using (meu_papel() = 'dono') with check (meu_papel() = 'dono');
create policy dono on oficina_config for all using (meu_papel() = 'dono') with check (meu_papel() = 'dono');
create policy dono on perfis for all using (meu_papel() = 'dono') with check (meu_papel() = 'dono');
create policy dono on sync_conflitos for select using (meu_papel() = 'dono');
create policy dono on auditoria for select using (meu_papel() = 'dono');

-- Cadastros: Dono e Secretária
create policy escritorio on clientes for all using (meu_papel() in ('dono','secretaria')) with check (meu_papel() in ('dono','secretaria'));
create policy escritorio on veiculos for all using (meu_papel() in ('dono','secretaria')) with check (meu_papel() in ('dono','secretaria'));
create policy escritorio on servicos_catalogo for all using (meu_papel() in ('dono','secretaria')) with check (meu_papel() in ('dono','secretaria'));
create policy escritorio on funcionarios for all using (meu_papel() in ('dono','secretaria')) with check (meu_papel() in ('dono','secretaria'));

-- OS: escritório vê tudo; mecânico só as dele e só cria rascunho
create policy escritorio on os for all using (meu_papel() in ('dono','secretaria')) with check (meu_papel() in ('dono','secretaria'));
create policy mecanico_le on os for select using (meu_papel() = 'mecanico' and os_do_mecanico(id));
create policy mecanico_cria on os for insert with check (meu_papel() = 'mecanico' and status = 'rascunho');
create policy mecanico_altera on os for update using (meu_papel() = 'mecanico' and os_do_mecanico(id))
  with check (status in ('rascunho','execucao','aguardando','finalizada'));

do $$
declare t text;
begin
  foreach t in array array['os_veiculos','os_mecanicos','os_itens','os_fotos','os_assinaturas','os_status_hist'] loop
    execute format('create policy escritorio on %I for all using (meu_papel() in (''dono'',''secretaria'')) with check (meu_papel() in (''dono'',''secretaria''))', t);
    execute format('create policy mecanico on %I for all using (meu_papel() = ''mecanico'' and os_do_mecanico(os_id)) with check (meu_papel() = ''mecanico'' and os_do_mecanico(os_id))', t);
  end loop;
end $$;

-- Mecânico e secretária leem os itens por esta view (sem custo; mecânico também sem preço).
create view os_itens_publico with (security_invoker = true) as
  select id, os_id, tipo, descricao, qtd, ordem, created_at, updated_at, deleted_at, version,
         case when meu_papel() = 'dono' then custo else 0 end as custo,
         case when meu_papel() = 'mecanico' then 0 else preco end as preco
  from os_itens;
