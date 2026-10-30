# Prompt para o Claude Code — Sistema de Gestão para Mecânica Diesel (Offline-First) — v2

> Cole tudo abaixo da linha no Claude Code, dentro de uma pasta vazia do projeto.

---

## Contexto

Você vai desenvolver um sistema de gestão completo para um **mecânico diesel** que presta serviço de manutenção de veículos pesados (cavalos mecânicos, trucks, carretas, bitrens, rodotrens) para **transportadoras**. Muitos atendimentos acontecem em pátios de transportadoras, postos e estradas, **sem internet ou com sinal instável**. O sistema precisa funcionar 100% offline e sincronizar automaticamente quando a conexão voltar.

**Importante:** o sistema é da **oficina/mecânico** (o prestador de serviço), não da transportadora. As transportadoras são os **clientes** que a oficina cadastra no sistema para abrir orçamentos, OS e cobranças. O cadastro de clientes também deve aceitar outros tipos de cliente: **pessoa física** (caminhoneiro autônomo, com CPF) e empresas com frota própria (ex.: usinas, construtoras).

Usuários: o **dono**, uma **secretária** e os **mecânicos** (assalariados, salário fixo). Uso principal no **celular** (mecânicos, em campo) e no **computador** (secretária e dono, no escritório).

Nome provisório do sistema: **[NOME DO SISTEMA]** — Cliente: **[NOME DA OFICINA]**. Centralize nome, cores, logo e dados da oficina em um arquivo de configuração/tema. O código deve ser **reaproveitável para outras oficinas** no futuro (trocar marca e dados sem mexer na lógica), mas a primeira versão atende **uma única oficina** (não fazer multiempresa agora).

Idioma de toda a interface, mensagens e documentos: **português do Brasil**. Moeda em R$, datas dd/mm/aaaa, fuso America/Sao_Paulo, CPF/CNPJ e placas (padrão antigo e Mercosul) com máscara e validação.

## Forma de trabalho (obrigatório)

1. **Antes de escrever qualquer código**, me apresente: arquitetura, estrutura de pastas, modelo de dados (tabelas, campos e relacionamentos), estratégia de sincronização offline e de resolução de conflitos, e os riscos/limitações que você enxerga. **Aguarde minha aprovação.**
2. Se algum requisito estiver ambíguo ou conflitante, **pergunte antes de decidir**; quando decidir sozinho algo pequeno, registre a decisão em `DECISOES.md`.
3. Desenvolva **por fases** (listadas no fim). Ao terminar cada fase, pare, me diga o que foi feito, como testar (incluindo o teste offline) e aguarde minha confirmação.
4. Não remova nem reescreva funcionalidades já aprovadas sem me avisar.
5. Use Git com commits pequenos e descritivos por etapa.
6. Mantenha um `README.md` atualizado com instalação, variáveis de ambiente, deploy, criação do primeiro usuário Dono e como testar o modo offline.
7. Eu uso **Windows + VS Code**: os comandos e scripts devem funcionar nesse ambiente.

## Stack sugerida (pode propor alternativa justificando)

- **Frontend:** React + Vite + TypeScript, como **PWA instalável** (Android, iPhone e PC) usando `vite-plugin-pwa` (Workbox).
- **UI:** Tailwind CSS, mobile-first e responsivo para desktop. Botões e áreas de toque grandes (mão suja/luva), alto contraste para uso no sol, modo claro/escuro, poucos toques para as ações mais comuns.
- **Banco local:** IndexedDB via **Dexie.js**, com versionamento/migração do schema local.
- **Backend/nuvem:** **Supabase** (PostgreSQL, Auth, Storage para fotos/assinaturas, Row Level Security). Migrações SQL versionadas no repositório.
- **Validação:** Zod (mesmos schemas para formulários e dados sincronizados).
- **PDF:** geração no próprio dispositivo (pdfmake ou jsPDF) para funcionar offline.
- **Assinatura:** canvas (ex.: signature_pad).
- **Testes:** Vitest (unitários) e Playwright (fluxos principais, incluindo simulação offline).
- **Deploy:** build estático (Vercel ou Hostinger). Chaves só em variáveis de ambiente, nunca no código; somente a chave pública (anon) no frontend.

## Arquitetura offline-first (requisito crítico)

- Todo dado é gravado **primeiro no IndexedDB**; a interface nunca espera a internet.
- IDs em **UUID gerado no cliente**.
- Fila de sincronização (**outbox**) com cada criação/edição/exclusão pendente, processada em ordem, com reenvio automático e espera progressiva em caso de falha. Disparos: evento `online`, abertura do app, retorno do app ao primeiro plano, checagem periódica e Background Sync quando disponível.
- **Atenção ao iPhone:** o iOS não suporta Background Sync e pode apagar dados de PWAs pouco usados. Sincronizar sempre que o app abrir/voltar ao foco, pedir `navigator.storage.persist()`, e avisar o usuário quando houver pendências antigas não enviadas.
- **Nunca apagar dado local que ainda não foi sincronizado**, nem no logout (bloquear logout com pendências, ou exigir confirmação explícita).
- Sincronização **bidirecional**: envia pendências e baixa alterações de outros usuários (`updated_at` do servidor + `last_sync_at` por dispositivo). O mecânico baixa apenas o necessário para ele (suas OS, cadastros básicos e histórico recente), para economizar dados e espaço.
- **Itens, fotos e apontamentos da OS são registros separados** (não um JSON único da OS), para que mecânico e secretária editem partes diferentes da mesma OS sem sobrescrever um ao outro.
- Conflitos no mesmo registro: last-write-wins com registro do conflito em log visível ao Dono. **Exceção:** OS finalizada/assinada ou período financeiro fechado fica travado; só o Dono reabre, com motivo.
- Exclusão sempre **lógica** (`deleted_at`).
- **Numeração de OS offline:** número provisório local (ex.: `P-<dispositivo>-0007`) substituído pelo número sequencial oficial gerado no servidor ao sincronizar. PDF gerado offline mostra o número provisório; ao sincronizar, permitir regerar com o número oficial.
- **Fotos e assinaturas:** comprimidas no dispositivo (máx. ~1600px, JPEG ~70%), guardadas como Blob no IndexedDB e enviadas ao Storage na sincronização, com fila própria e barra de progresso. Após confirmar o envio, o dispositivo pode liberar as fotos antigas (mantendo miniatura).
- Indicador sempre visível: **Online / Offline / Sincronizando (X pendências)**, botão "Sincronizar agora" e tela de detalhes das pendências e erros.
- **Login offline:** após o primeiro login online, o app abre offline com a sessão em cache, respeitando o perfil, e renova o token ao reconectar sem perder dados.
- **Atualização do app:** quando houver nova versão do PWA, avisar e atualizar só depois de sincronizar.

## Perfis de usuário e permissões

1. **Dono (administrador):** acesso total — financeiro, relatórios, configurações, usuários, preços, reabrir OS, cancelar OS faturada, ver log de auditoria e conflitos.
2. **Secretária:** cadastros (clientes, veículos, mecânicos — sem salário — fornecedores, serviços), orçamentos e OS, contas a receber e a pagar (exceto salários), emissão de PDFs e envio ao cliente. **Não** vê lucro/margem, salários nem configurações do sistema.
3. **Mecânico:** vê apenas as OS atribuídas a ele; registra serviços executados, peças usadas, apontamento de horas (iniciar/pausar/finalizar), km/horímetro, fotos, observações e coleta a assinatura. **Não** vê valores financeiros nem dados de outros mecânicos. Pode abrir um **chamado/OS rascunho** em campo (atendimento emergencial na estrada), que a secretária completa e precifica depois.

Aplicar as permissões na interface **e** no banco (RLS no Supabase). Usuário desativado perde acesso na próxima sincronização.

**Auditoria:** registrar quem criou/alterou/cancelou cada OS e lançamento financeiro, com data/hora e valor anterior.

## Módulos

### 1. Cadastros
- **Clientes (empresas e pessoas para quem a oficina presta serviço — principalmente transportadoras):** tipo (pessoa jurídica ou física), razão social/nome, nome fantasia, CNPJ ou CPF (preencher endereço automaticamente pelo CEP e, quando online, dados pelo CNPJ via API pública), inscrição estadual, contatos (responsável de frota, financeiro, telefone/WhatsApp, e-mail), endereço, condição de pagamento padrão (à vista, 15/30 dias, faturamento mensal com dia de fechamento), se exige **número de pedido/autorização** para faturar, observações.
- **Tabela de preços por cliente:** valor de mão de obra (por serviço ou valor hora) e deslocamento podem ser diferentes por transportadora; se não houver, usa o padrão.
- **Veículos:** placa, tipo (cavalo, truck, toco, carreta, bitrem, rodotrem, etc.), marca, modelo, ano, chassi, frota/nº interno, km/horímetro atual, cliente vinculado. Permitir trocar o cliente dono do veículo mantendo o histórico.
- **Mecânicos/funcionários:** nome, CPF, telefone, função, especialidades, salário fixo mensal (visível só ao Dono), data de admissão, ativo/inativo, usuário de acesso vinculado.
- **Fornecedores** (autopeças, retíficas, torneiros, etc.): nome, CNPJ/CPF, contato.
- **Catálogo de serviços:** descrição, categoria (motor, freio, suspensão, elétrica, câmbio, diferencial, embreagem, arrefecimento, injeção, revisão…), valor padrão de mão de obra, tempo estimado, prazo de garantia.

### 2. Orçamentos e Ordens de Serviço
- Status: **Rascunho/Chamado → Orçamento → Aprovado → Em execução → Aguardando peça → Finalizada → Faturada**, além de **Cancelada** (com motivo obrigatório). Toda mudança de status fica registrada no histórico da OS.
- **Aprovação do orçamento:** registrar quem aprovou na transportadora, como (WhatsApp, telefone, e-mail, assinatura), data/hora e **número do pedido/autorização** quando o cliente exigir.
- Campos: cliente, veículo(s) — permitir **mais de um veículo na mesma OS** (ex.: cavalo + carreta) com cada item vinculado ao seu veículo —, km/horímetro na entrada, local do atendimento (oficina / pátio do cliente / estrada, com endereço e GPS opcional com permissão do usuário), motorista/solicitante, defeito relatado, diagnóstico, mecânico(s) responsável(is), datas/horas de início e fim, previsão de entrega.
- **Mão de obra:** itens do catálogo ou avulsos, usando a tabela de preços do cliente.
- **Peças/materiais:** descrição, código/referência, quantidade, **custo** (visível só ao Dono) e **preço de venda**, origem (fornecida pela oficina ou pelo cliente), fornecedor. Peça comprada para a OS pode gerar automaticamente uma conta a pagar ao fornecedor.
- **Serviços de terceiros** (retífica, torno, solda) com custo e preço de venda.
- Deslocamento/visita técnica (valor fixo ou por km) e socorro/atendimento fora de horário como itens cobráveis.
- Desconto (valor ou %), total geral, forma e condição de pagamento.
- **Fotos** (antes/durante/depois) com legenda, vinculadas à OS ou a um item.
- **Assinaturas:** do mecânico responsável e do motorista/responsável do cliente na finalização, com nome, documento, data/hora. Registrar se a assinatura foi feita offline.
- **Garantia:** cada serviço tem prazo de garantia; OS de **retorno em garantia** vinculada à OS original, sem cobrança por padrão.
- Converter orçamento aprovado em OS com um toque; **duplicar OS**; busca rápida por placa, frota, cliente, número, mecânico ou status; filtros por período.

### 3. Histórico por veículo
- Linha do tempo de todas as OS da placa: serviços, peças trocadas, km/horímetro, mecânico e datas, com fotos.
- Busca pela placa ou nº de frota direto na tela inicial.
- Alerta se o mesmo serviço foi feito no mesmo veículo dentro do prazo de garantia (possível retorno).
- PDF do histórico do veículo para enviar à transportadora.

### 4. PDFs (gerados offline)
- **Orçamento** e **Ordem de Serviço**: logo e dados da oficina, dados do cliente e veículo(s), itens, totais, fotos selecionadas, assinaturas, nº do pedido do cliente, termos de garantia configuráveis e **QR Code/chave PIX** para pagamento.
- Versão da OS **sem valores** para o mecânico/motorista (comprovante de serviço executado).
- **Relatório de fechamento por cliente** (todas as OS de um período, para faturamento mensal da transportadora), com totais por veículo.
- Botão **"Enviar pelo WhatsApp"** usando Web Share API (com o PDF anexado) e fallback para download + link `wa.me` com mensagem pronta.
- Layout em A4, legível também na tela do celular.

### 5. Financeiro
- **Contas a receber:** geradas ao faturar a OS (individual) ou no **fechamento mensal** (agrupando várias OS do cliente em uma cobrança); vencimento pela condição do cliente; parcelas; baixa total ou parcial; juros/multa opcionais; forma de recebimento (PIX, boleto, transferência, dinheiro, cartão); campo para **nº da nota fiscal** e anexo do PDF/XML da NF.
- **Contas a pagar:** fornecedores de peças, serviços de terceiros, aluguel, combustível, ferramentas, impostos, etc., com categorias, recorrência e anexo de comprovante.
- **Salários fixos** dos mecânicos lançados automaticamente como despesa recorrente mensal (editável; visível só ao Dono), com espaço para adiantamentos/vales.
- **Contas/caixas** (ex.: banco, dinheiro) com saldo e transferência entre elas.
- **Fluxo de caixa:** realizado e previsto, diário/mensal.
- **Fechamento de mês:** o Dono pode travar um período para evitar alterações retroativas.
- Alertas de contas vencidas, a vencer e de clientes inadimplentes.
- **Fora do escopo agora:** emissão de nota fiscal (NFS-e/NF-e) e boleto bancário integrados. Deixe a arquitetura preparada para integrar uma API de emissão no futuro.

### 6. Painel e relatórios
- **Dono:** faturamento do mês vs. mês anterior, a receber, a pagar, saldo, margem, OS por status, OS paradas há muitos dias, OS aguardando peça.
- **Secretária:** painel operacional sem valores de lucro (OS do dia, pendências de aprovação, contas a receber vencendo).
- **Mecânico:** "Minhas OS" do dia e pendentes.
- Relatórios: faturamento por cliente/período, ranking de clientes, serviços mais executados, veículos com mais manutenções, produtividade por mecânico (OS e horas apontadas), margem por OS (mão de obra + lucro das peças − custos), inadimplência.
- Filtros por período e exportação em PDF e Excel/CSV.

### 7. Configurações
- Dados da oficina (nome, CNPJ, endereço, telefone, logo, chave PIX), texto de garantia, prazos padrão, valor hora padrão, numeração inicial de OS, categorias financeiras, gestão de usuários e perfis.
- **Backup:** exportação e importação completas em JSON (Dono), além de backup automático do Supabase documentado no README.
- **Importação inicial** de clientes e veículos por planilha CSV/Excel (para a oficina não cadastrar tudo à mão).

## Requisitos não funcionais
- Bom desempenho em celular Android intermediário e com 3G fraco.
- Formulários com rascunho salvo automaticamente (não perder dados se o app fechar ou a bateria acabar).
- Confirmação antes de ações destrutivas e "desfazer" quando possível.
- Validações claras e mensagens de erro em português, sem jargão técnico.
- **LGPD:** coletar só dados necessários de motoristas; aviso de privacidade simples; dados acessíveis apenas aos perfis autorizados.
- Monitoramento de erros (ex.: Sentry, plano gratuito) ou ao menos log de erros consultável pelo Dono.
- Seeds com dados fictícios (transportadoras, caminhões, OS, financeiro) para demonstração ao cliente.
- Código organizado, tipado e comentado nos pontos críticos (sincronização, permissões, cálculos).
- Testes automatizados para: sincronização e conflitos, numeração de OS offline, cálculo de totais/descontos/tabela por cliente, geração de contas a receber, fechamento mensal e regras de permissão (RLS).
- Documentar limites do plano gratuito do Supabase (armazenamento de fotos, pausa por inatividade) e quando migrar para o plano pago.

## Fases de entrega
1. **Planejamento** (aguardar aprovação).
2. **Fundação:** projeto, PWA instalável, Supabase + migrações, autenticação, perfis e RLS, layout base, banco local (Dexie), motor de sincronização com indicador de status e testes de sincronização.
3. **Cadastros:** clientes (com tabela de preços), veículos, mecânicos, fornecedores, catálogo de serviços e importação por planilha.
4. **Orçamentos e OS:** fluxo de status, aprovação, itens, terceiros, apontamento de horas, fotos, assinaturas, garantia, numeração offline.
5. **PDFs e WhatsApp.**
6. **Histórico por placa.**
7. **Financeiro:** receber, pagar, salários, caixas, fluxo de caixa, fechamento mensal.
8. **Painéis e relatórios.**
9. **Configurações, backup, auditoria, testes finais e guia de deploy e de uso** (passo a passo simples para o dono, a secretária e os mecânicos instalarem o app no celular).

Ao final de cada fase, inclua um roteiro de teste do **modo offline**: colocar o celular em modo avião, lançar dados, fechar e reabrir o app, religar a internet e conferir a sincronização em outro dispositivo (testar também dois usuários editando a mesma OS offline).

Comece pela etapa de planejamento e aguarde minha aprovação.
