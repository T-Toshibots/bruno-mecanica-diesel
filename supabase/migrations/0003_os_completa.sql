-- Fase 4 — Orçamentos e OS: vários veículos, detalhes de itens, fotos no Storage, horas, aprovações e garantia.
-- ATENÇÃO: preparado, ainda não executado em um projeto Supabase real.

alter table os
  add column previsao_entrega date,
  add column endereco text,
  add column lat double precision,
  add column lng double precision,
  add column os_origem_id uuid references os (id);

alter table os_veiculos add column horimetro int;

alter table os_itens
  add column os_veiculo_id uuid references os_veiculos (id),
  add column servico_id uuid references servicos_catalogo (id),
  add column codigo text,
  add column origem text check (origem in ('oficina', 'cliente')),
  add column fornecedor_id uuid references fornecedores (id),
  add column garantia_dias int;

-- Fotos: o arquivo completo vai para o bucket "fotos-os"; o registro guarda a miniatura.
alter table os_fotos
  alter column imagem drop not null,
  add column item_id uuid references os_itens (id),
  add column momento text check (momento in ('antes', 'durante', 'depois')),
  add column arquivo_id uuid,
  add column miniatura text;

alter table os_assinaturas add column documento text;

create table os_apontamentos (
  id uuid primary key,
  os_id uuid not null references os (id),
  funcionario_id uuid not null references funcionarios (id),
  inicio timestamptz not null,
  fim timestamptz
);

create table os_aprovacoes (
  id uuid primary key,
  os_id uuid not null references os (id),
  aprovado_por text not null,
  meio text not null check (meio in ('whatsapp', 'telefone', 'email', 'assinatura', 'presencial')),
  pedido_numero text,
  data timestamptz not null,
  usuario_nome text not null
);

do $$
declare t text;
begin
  foreach t in array array['os_apontamentos', 'os_aprovacoes'] loop
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
    execute format('create policy escritorio on %I for all using (meu_papel() in (''dono'',''secretaria'')) with check (meu_papel() in (''dono'',''secretaria''))', t);
  end loop;
end $$;

-- Mecânico: lê aprovações das suas OS; aponta só as próprias horas
create policy mecanico_le on os_aprovacoes for select using (meu_papel() = 'mecanico' and os_do_mecanico(os_id));
create policy mecanico on os_apontamentos for all
  using (meu_papel() = 'mecanico' and os_do_mecanico(os_id))
  with check (meu_papel() = 'mecanico' and os_do_mecanico(os_id) and funcionario_id = meu_funcionario());

-- Storage das fotos (bucket privado). Caminho: <arquivo_id>
insert into storage.buckets (id, name, public) values ('fotos-os', 'fotos-os', false) on conflict do nothing;
create policy fotos_ler on storage.objects for select using (bucket_id = 'fotos-os' and meu_papel() is not null);
create policy fotos_enviar on storage.objects for insert with check (bucket_id = 'fotos-os' and meu_papel() is not null);
