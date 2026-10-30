# Planejamento v2 — Sistema de Gestão Bruno Mecânica Diesel

Fase 1 do `prompt-sistema-oficina-diesel.md`. **Nenhum código será escrito antes da sua aprovação.**

---

## 1. Ponto de partida (o que já existe — v1)

O esboço publicado (`t-toshibots.github.io/bruno-mecanica-diesel`) é um PWA React + Vite + Tailwind + Dexie com dados só no aparelho.

| Parte da v1 | Destino na v2 |
|---|---|
| Identidade visual, logo, ícones, layout (menu lateral + barra inferior) | **Mantido**, movido para `config/tema.ts` |
| PWA / funcionamento offline / instalação | **Mantido**, com aviso de nova versão |
| Telas (Painel, OS, Clientes, Financeiro, Configurações) | **Reaproveitadas como base** e ampliadas |
| Utilitários (máscaras, moeda, datas) | **Mantidos**, + validação de CPF/CNPJ/placa Mercosul |
| Banco local: IDs numéricos e OS com itens dentro de um único registro | **Refeito**: UUID, itens/fotos/apontamentos em tabelas separadas, exclusão lógica |
| Sincronização simulada | **Refeita**: sincronização real com Supabase |
| Login falso | **Refeito**: Supabase Auth com 3 perfis, login offline |

Nenhuma funcionalidade da v1 será removida; todas passam a existir dentro da nova estrutura.

**Modo demonstração preservado:** se o app for publicado sem as chaves do Supabase, ele roda como hoje (dados fictícios no aparelho), com a opção de entrar como **Dono, Secretária ou Mecânico** para mostrar as permissões ao cliente. Assim o link de apresentação continua funcionando durante todo o desenvolvimento.

---

## 2. Arquitetura

```
 Celular / PC (PWA)                                   Nuvem (Supabase, plano gratuito)
┌─────────────────────────────────────┐              ┌──────────────────────────────┐
│ Telas React (por perfil)            │              │ Auth (login, perfis)         │
│        │ lê/grava sempre local      │              │ PostgreSQL + RLS             │
│        ▼                            │   push/pull  │  - triggers updated_at,      │
│ IndexedDB (Dexie)  ◄── motor de ────┼─────────────►│    auditoria, nº da OS       │
│  dados + outbox +       sincronização│   (HTTPS)   │  - funções sync_push / pull  │
│  fila de fotos                       │              │ Storage (fotos, assinaturas,│
│ Service Worker (app offline)        │              │  anexos de NF/comprovantes) │
│ PDF gerado no aparelho (pdfmake)    │              └──────────────────────────────┘
└─────────────────────────────────────┘
```

- **Toda gravação vai primeiro para o IndexedDB.** A tela nunca espera a internet.
- O servidor é a fonte oficial para: número da OS, `updated_at`, permissões (RLS), auditoria e travas.
- Regras de negócio (totais, preços por cliente, vencimentos, permissões) ficam em `domain/`, em funções puras e testadas, usadas igualmente nas telas e nos testes.

---

## 3. Estrutura de pastas

```
MCB/
├─ src/
│  ├─ config/        tema.ts (nome, cores, logo, dados padrão da oficina) — trocar oficina = trocar só aqui
│  ├─ domain/        schemas Zod, cálculos (totais, descontos, tabela por cliente, vencimentos, garantia), permissões
│  ├─ db/            schema Dexie + migrações locais versionadas
│  ├─ sync/          outbox, push, pull, fila de fotos, numeração provisória, conflitos, gatilhos (online/foco/timer)
│  ├─ services/      cliente Supabase, auth/sessão offline, CEP (ViaCEP), CNPJ (BrasilAPI), log de erros
│  ├─ features/      clientes, veiculos, funcionarios, fornecedores, catalogo, os, historico, financeiro,
│  │                 relatorios, painel, configuracoes, usuarios
│  ├─ pdf/           orçamento, OS (com e sem valores), histórico do veículo, fechamento por cliente
│  ├─ components/    UI compartilhada (botões grandes, indicador de sync, assinatura, câmera…)
│  └─ demo/          dados fictícios e modo demonstração
├─ supabase/
│  ├─ migrations/    SQL versionado (tabelas, RLS, triggers, funções)
│  └─ seed.sql       dados fictícios para o ambiente de teste
├─ tests/            unit (Vitest) + e2e (Playwright, inclusive offline)
├─ README.md   DECISOES.md   PLANEJAMENTO.md
```

---

## 4. Modelo de dados

**Colunas comuns a todas as tabelas sincronizadas:** `id uuid` (gerado no aparelho), `created_at`, `updated_at` (definido pelo servidor), `deleted_at` (exclusão lógica), `created_by`, `updated_by`, `device_id`, `version` (inteiro incrementado a cada alteração).

### Usuários e equipe
| Tabela | Campos principais |
|---|---|
| `perfis` | user_id (Auth), nome, papel (`dono` / `secretaria` / `mecanico`), funcionario_id, ativo |
| `funcionarios` | nome, cpf, telefone, função, especialidades[], admissão, ativo |
| `funcionarios_salario` | funcionario_id, salário, vigência — **tabela separada, RLS só Dono** |

### Cadastros
| Tabela | Campos principais |
|---|---|
| `clientes` | tipo PF/PJ, razão social/nome, fantasia, CPF/CNPJ, IE, endereço completo + CEP, condição de pagamento (à vista/15/30/mensal + dia de fechamento), forma preferida, **exige nº de pedido**, observações |
| `cliente_contatos` | cliente_id, nome, papel (frota / financeiro / outro), telefone/WhatsApp, e-mail |
| `cliente_precos` | cliente_id, servico_id (opcional), valor hora, valor por serviço, deslocamento fixo, valor por km |
| `veiculos` | placa, tipo (cavalo, truck, toco, carreta, bitrem, rodotrem…), marca, modelo, ano, chassi, nº frota, km, horímetro, cliente_id |
| `veiculo_clientes_hist` | veiculo_id, cliente_id, de, até — troca de dono mantendo histórico |
| `fornecedores` | nome, CPF/CNPJ, tipo (autopeças, retífica, torno…), contato |
| `servicos_catalogo` | descrição, categoria, valor padrão, tempo estimado, prazo de garantia (dias) |

### Orçamentos e OS (cada parte é um registro separado)
| Tabela | Campos principais |
|---|---|
| `os` | numero (oficial, servidor), numero_provisorio, status, cliente_id, solicitante/motorista, local (oficina / pátio / estrada) + endereço + GPS, defeito, diagnóstico, previsão, início/fim, desconto (valor ou %), forma/condição de pagamento, nº do pedido, os_origem_id (retorno em garantia), travada |
| `os_veiculos` | os_id, veiculo_id, km e horímetro de entrada — **vários veículos por OS** |
| `os_mecanicos` | os_id, funcionario_id |
| `os_itens` | os_id, os_veiculo_id, tipo (mão de obra / peça / terceiro / deslocamento / socorro), servico_id, descrição, código, qtd, **custo** (só Dono), preço de venda, origem (oficina/cliente), fornecedor_id, garantia em dias |
| `os_apontamentos` | os_id, funcionario_id, início, fim (iniciar/pausar/finalizar) |
| `os_fotos` | os_id, item_id, momento (antes/durante/depois), legenda, caminho no Storage, miniatura |
| `os_assinaturas` | os_id, papel (mecânico/cliente), nome, documento, data/hora, feita offline (sim/não), caminho |
| `os_aprovacoes` | os_id, quem aprovou, meio (WhatsApp/telefone/e-mail/assinatura), data, nº do pedido |
| `os_status_hist` | os_id, de, para, motivo, usuário, data |

### Financeiro
| Tabela | Campos principais |
|---|---|
| `contas_receber` | cliente_id, origem (OS ou fechamento mensal), descrição, nº da NF, anexo da NF |
| `receber_os` | conta_id, os_id — várias OS em uma cobrança mensal |
| `receber_parcelas` | conta_id, nº, valor, vencimento, juros/multa |
| `receber_baixas` | parcela_id, valor, data, forma, caixa_id — baixa total ou parcial |
| `contas_pagar` | fornecedor_id, categoria, descrição, valor, vencimento, recorrência, pago em, caixa_id, anexo, os_item_id, funcionario_id (salário/vale) |
| `categorias_financeiras` | nome, tipo (receita/despesa) |
| `caixas` + `transferencias` | contas (banco, dinheiro) com saldo e transferências |
| `periodos_fechados` | mês, fechado por, data — trava alterações retroativas |

### Sistema
`oficina_config` (dados, PIX, textos de garantia, valor hora padrão, numeração inicial), `auditoria` (tabela, registro, ação, usuário, data, antes, depois), `sync_conflitos`, `log_erros`.

---

## 5. Sincronização offline e conflitos

1. **Gravação local + outbox:** cada criação/edição/exclusão grava o registro no Dexie e adiciona um item na fila (tabela, id, operação, `version` base).
2. **Envio (push):** a fila é enviada em ordem, em lotes, para a função `sync_push` do servidor. Falha → nova tentativa com espera progressiva (5s, 15s, 1min, 5min…).
3. **Disparos:** evento `online`, abertura do app, volta ao primeiro plano, a cada 60s quando online, Background Sync (Android) e o botão **"Sincronizar agora"**.
4. **Recebimento (pull):** por tabela, busca registros com `updated_at` > último sincronismo do aparelho (relógio do servidor, não do celular). A RLS já filtra: o mecânico só baixa as OS dele, cadastros básicos e histórico recente.
5. **Conflito no mesmo registro:** vale a última gravação recebida pelo servidor (last-write-wins); a versão perdida vai para `sync_conflitos`, visível ao Dono. Como itens, fotos e apontamentos são registros separados, mecânico e secretária mexendo em partes diferentes da mesma OS **não** entram em conflito.
6. **Travas:** OS finalizada/assinada e período fechado são recusados pelo servidor. O aparelho mostra o erro em português, desfaz a alteração local e só o Dono reabre, informando o motivo.
7. **Número da OS:** offline recebe `P-<aparelho>-0007`; o servidor atribui o número oficial sequencial ao receber, e o aparelho atualiza. PDFs feitos offline mostram o provisório, com opção de regerar.
8. **Fotos e assinaturas:** comprimidas (máx. 1600px, JPEG 70%), guardadas como Blob, enviadas por fila própria com barra de progresso. Após confirmação, o aparelho pode liberar o original e manter a miniatura.
9. **Proteções:** nada pendente é apagado do aparelho, nem no logout (bloqueado com pendências); `navigator.storage.persist()` é solicitado; aviso de pendências com mais de 24h; atualização do app só depois de sincronizar.
10. **Login offline:** depois do primeiro login online, a sessão e o perfil ficam no aparelho; o app abre offline e renova o token ao reconectar.

---

## 6. Permissões

| | Dono | Secretária | Mecânico |
|---|---|---|---|
| Cadastros | tudo | tudo, menos salários | só leitura do necessário |
| Orçamentos e OS | tudo, reabrir, cancelar faturada | criar, editar, precificar, PDFs | **só as OS atribuídas**; serviços, peças, horas, fotos, assinatura; abrir chamado/rascunho |
| Valores na OS | sim, incluindo custo/margem | preço de venda, sem custo/margem | **não vê valores** |
| Receber / pagar | tudo | sim, exceto salários | não |
| Relatórios de lucro, configurações, usuários, auditoria, conflitos | sim | não | não |

Aplicado **na interface e no banco (RLS)**. Usuário desativado perde o acesso na próxima sincronização.

---

## 7. Riscos e limitações

1. **iPhone:** sem Background Sync e pode apagar dados de PWA pouco usado. Mitigação: sincronizar ao abrir/voltar ao foco, armazenamento persistente e aviso de pendências antigas. Recomendação ao cliente: mecânicos com Android, se possível.
2. **Supabase gratuito:** 500 MB de banco, 1 GB de arquivos, e o projeto **pausa após 7 dias sem uso** (reativa manualmente). Fotos são o que mais consome: ~150 KB cada → cerca de 6.500 fotos em 1 GB. Sugestão: plano Pro (US$ 25/mês) quando entrar em uso real.
3. **Last-write-wins** pode descartar uma edição no mesmo campo; fica registrada no log de conflitos para o Dono recuperar.
4. **Relógio do celular errado:** a ordem de sincronização usa sempre o relógio do servidor.
5. **APIs públicas de CEP/CNPJ** têm limite de uso e só funcionam online; o cadastro funciona manualmente offline.
6. **Tamanho do app:** PDF com fontes embutidas e gráficos aumentam o download inicial (~1–1,5 MB compactado); será dividido por telas para abrir rápido em 3G.
7. **Repositório público:** a chave pública (anon) do Supabase fica visível por natureza; a segurança vem da RLS. Chave de serviço nunca vai para o código.
8. **Tamanho do escopo:** o prompt equivale a um sistema comercial completo. Estimativa: 8 fases, cada uma entregue e testada antes da próxima.

---

## 8. Fases de entrega

| Fase | Entrega | Resultado visível |
|---|---|---|
| 2 | Fundação: estrutura nova, Supabase + migrações, auth com 3 perfis, RLS, Dexie com UUID, motor de sincronização real, indicador e tela de pendências, testes de sincronização | Login real, dados aparecem em dois aparelhos |
| 3 | Cadastros completos + tabela de preços por cliente + importação CSV/Excel + CEP/CNPJ | Cadastro completo |
| 4 | Orçamentos e OS: novo fluxo de status, aprovação, vários veículos, terceiros, apontamento de horas, fotos com legenda, 2 assinaturas, garantia, numeração offline | OS completa em campo |
| 5 | PDFs (orçamento, OS com e sem valores, PIX/QR) + envio com PDF anexado pelo WhatsApp | Documentos para o cliente |
| 6 | Histórico por placa (linha do tempo, alerta de garantia, PDF) | Busca por placa na tela inicial |
| 7 | Financeiro: receber (parcelas, baixas, fechamento mensal), pagar, salários, caixas, fluxo de caixa, fechamento de mês | Financeiro real |
| 8 | Painéis por perfil e relatórios com exportação PDF/CSV | Painel do Dono, Secretária e Mecânico |
| 9 | Configurações, backup, auditoria, testes finais, guias de deploy e de uso | Pronto para uso |

Cada fase termina com: o que foi feito, como testar e o **roteiro de teste offline** (modo avião → lançar → fechar/reabrir → religar → conferir em outro aparelho → dois usuários na mesma OS).

---

## 9. Decisões que preciso de você

1. **Conta Supabase:** você cria o projeto gratuito em supabase.com e me passa a URL e a chave **anon** (pública)? Sem ela, a Fase 2 fica só no modo demonstração.
2. **Hospedagem:** manter o **GitHub Pages** (já funciona, grátis) ou migrar para Vercel/Hostinger como sugere o prompt?
3. **Nome do sistema:** o prompt deixa `[NOME DO SISTEMA]` em aberto. Sugestão: **"Bruno OS"** (oficina: Bruno Mecânica Diesel).
