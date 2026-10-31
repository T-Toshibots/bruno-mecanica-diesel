# Decisões

Registro das decisões tomadas durante o desenvolvimento (regra 2 do prompt).

## Decididas com o usuário (30/10/2026)

- **Sem Supabase por enquanto:** a v2 roda em **modo demonstração**, com um servidor simulado no próprio navegador. O motor de sincronização é o mesmo que falará com o Supabase; basta trocar o transporte (`src/sync/transporte.ts`).
- **Hospedagem:** GitHub Pages (grátis, link já em uso).
- **Nome do sistema:** "Bruno Mecânica Diesel".

## Decididas na Fase 2

1. **Servidor simulado** (`src/sync/servidor-demo.ts`) aplica as mesmas regras do SQL (`supabase/migrations/0001_fundacao.sql`): permissões por perfil, OS travada, numeração oficial, auditoria e registro de conflitos. Limitação: não sincroniza entre aparelhos diferentes; isso só com o Supabase.
2. **Banco local novo** (`bmd-v2`). O banco da v1 (`bruno-mecanica`) é apagado na abertura, porque só tinha dados fictícios. IDs passaram a ser UUID gerado no aparelho.
3. **Nomes de campos em snake_case** (`cliente_id`, `updated_at`), iguais às colunas do PostgreSQL, para a sincronização não precisar de conversão.
4. **`version` = última versão conhecida do servidor.** Edição local não incrementa; o servidor compara a versão recebida com a dele para detectar conflito (last-write-wins, com o registro perdedor guardado em `sync_conflitos`).
5. **Fila de envio guarda só a referência** (tabela + id). No envio vai o estado atual do registro; várias edições do mesmo registro viram um único envio.
6. **Espera progressiva** entre tentativas: 5s, 15s, 1min, 5min, 15min. "Sincronizar agora" ignora a espera.
7. **OS travada** (finalizada/faturada/cancelada): a secretária ainda pode faturar e registrar recebimento (`status`, `faturada_em`, `vencimento`, `pago_em`, `forma_pagamento`, `pedido_numero`); o resto só o Dono, reabrindo com motivo.
8. **Valores protegidos no servidor:** o mecânico recebe itens com preço e custo zerados e o servidor ignora preço/custo enviados por ele; a secretária recebe custo zerado. No Supabase isso é feito por trigger + view `os_itens_publico`.
9. **Troca de usuário no mesmo aparelho:** ao entrar outro usuário (sem pendências), os dados locais são trocados pelos que ele pode ver. Sair com pendências exige confirmação explícita, e os dados ficam no aparelho.
10. **Status da OS da v2 adotados já na Fase 2:** Chamado → Orçamento → Aprovado → Em execução → Aguardando peça → Finalizada → Faturada, além de Cancelada (com motivo). As telas completas de aprovação e apontamento ficam para a Fase 4.
11. **Fotos ficam como texto (data URL) em registros separados** (`os_fotos`) nesta fase. A fila própria com Blob, envio ao Storage e barra de progresso fica para a Fase 4.
12. **Background Sync não implementado ainda:** com o servidor simulado não há o que enviar em segundo plano. Fica para quando o Supabase for ligado (exige service worker próprio). Os gatilhos ativos são: abertura, gravação, volta da internet, volta ao primeiro plano, a cada 60s e o botão manual.
13. **Tema escuro como padrão** (identidade da marca), com tema claro de alto contraste para uso no sol e opção "seguir o sistema".
14. **Login da demonstração por escolha de perfil**, sem senha, para mostrar as permissões. Com o Supabase, entra e-mail e senha.

## Decididas na Fase 3

15. **Tabela de preços por cliente** em `cliente_precos`: uma linha geral (hora técnica, deslocamento fixo ou por km) e linhas por serviço. Ordem de prioridade: preço do cliente → catálogo/padrão da oficina. A OS aplica sozinha ao escolher o serviço e mostra "Tabela de preços do cliente aplicada".
16. **Deslocamento padrão** (fixo e por km) passou a fazer parte dos dados da oficina (Configurações).
17. **Troca de dono do veículo** fecha o período no `veiculo_clientes_hist` e abre outro. As OS antigas continuam com o cliente da época.
18. **Catálogo de serviços e equipe/salários saíram de Configurações** e foram para **Cadastros** (mais completos). Nada foi removido: só mudou de lugar. A secretária cadastra mecânicos, mas o campo de salário só aparece para o Dono.
19. **Mecânico não recebe preços nem fornecedores**, mas recebe os contatos dos clientes (para falar com o responsável de frota em campo).
20. **CPF/CNPJ e placa não podem repetir** (checado na tela; no Supabase, índice único).
21. **Importação:** uma linha por veículo, clientes agrupados pelo CPF/CNPJ. Colunas reconhecidas por vários nomes ("Razão Social", "CNPJ", "Nº Frota"…). CSV com `;` ou `,`, em UTF-8 ou Windows-1252 (Excel antigo), ou `.xlsx`. Linhas com erro são mostradas e ignoradas. Clientes importados entram como frotista/boleto/30 dias (PJ) ou avulso/Pix/à vista (PF) e podem ser ajustados depois. Placa já cadastrada não é duplicada.
22. **Leitura de Excel** com `read-excel-file`, carregada só na tela de importação para não pesar o app.
23. **CEP (ViaCEP) e CNPJ (BrasilAPI)** só com internet; offline aparece "preencha manualmente". O CEP busca sozinho ao sair do campo, se o endereço estiver vazio.
24. **Dados de demonstração versionados** (`VERSAO_SEED`): aparelhos com a demo antiga recriam a demonstração na abertura, só se não houver pendências. Ao recriar, a sessão é encerrada (os usuários ganham novos IDs).

## Decididas na Fase 4

25. **Vários veículos por OS** (`os_veiculos`), com km e horímetro de cada um. Cada item pode apontar para um veículo (`os_veiculo_id`); sem vínculo, vale para a OS toda. No detalhe, os itens aparecem agrupados por veículo.
26. **Peças:** código/referência, origem (oficina ou cliente; peça do cliente fica com preço e custo zero) e fornecedor. **Terceiros** (retífica, torno, solda) são itens do tipo "terceiro" com custo e preço. A conta a pagar automática da peça comprada fica para a **Fase 7 (Financeiro)**.
27. **Horas trabalhadas** (`os_apontamentos`): cada mecânico inicia e pausa as próprias horas. Iniciar numa OS aprovada já a coloca "Em execução". Ao finalizar, as horas em andamento são encerradas (o mecânico só encerra as dele).
28. **Finalização pede a assinatura do mecânico** (obrigatória) e a do cliente/motorista (opcional, se ele não estiver presente), com nome, documento, data/hora e registro de assinatura feita offline. As assinaturas são gravadas **antes** da mudança de status, porque a OS finalizada fica travada.
29. **Assinaturas continuam como imagem dentro do registro** (são pequenas, ~10–20 KB). Só as fotos vão para o Storage.
30. **Fotos:** arquivo completo (1600px, JPEG 70%) numa fila própria (`arquivos`), enviada depois dos registros, com barra de progresso. O registro leva uma miniatura de ~240px que aparece mesmo offline. A foto completa vem do aparelho ou é baixada com internet. O botão "Liberar espaço" (Sincronização) apaga do aparelho as fotos já enviadas. Fotos têm momento (antes/durante/depois) e legenda. O vínculo da foto a um item específico ficou no modelo (`item_id`), sem tela ainda.
31. **Aprovação** (`os_aprovacoes`): quem aprovou, como, data/hora e nº do pedido (obrigatório se o cliente exigir). A opção "Já iniciar a execução" converte o orçamento em OS com um toque.
32. **Garantia:** o prazo vem do catálogo para cada item de mão de obra. A OS de **retorno em garantia** fica vinculada à original (`os_origem_id`), com os itens de garantia copiados com preço zero, e já nasce "Aprovada". Ao lançar um serviço já feito no mesmo veículo dentro do prazo, aparece o alerta "Possível retorno em garantia".
33. **Duplicar OS** copia cliente, veículos, mecânicos e itens (sem fotos nem assinaturas) para um novo orçamento.
34. **Rascunho automático** do formulário da OS no aparelho, só depois que algo é alterado. Ao reabrir, aparece "Rascunho recuperado" com a opção de descartar.
35. **GPS opcional** no atendimento fora da oficina (pede permissão), com link para o mapa.
36. **Correções feitas nesta fase:**
    - textos longos alargavam a página no celular e escondiam o botão Salvar (agora há regra global para itens de grade e proteção contra rolagem lateral);
    - o botão Salvar da OS virou barra fixa acima da navegação inferior;
    - uma sincronização em andamento do usuário anterior impedia o novo usuário de baixar os dados dele;
    - ao trocar de usuário, o app volta ao Painel.
37. **Primeiro acesso precisa de internet** até o app ficar guardado no aparelho. A tela Sincronização mostra "App guardado neste aparelho" quando já dá para usar offline.

## Ajustes após a Fase 4 (pedido do usuário, 30/10/2026)

38. **Botão "Trocar perfil"** no topo (no celular, tocando no nome do perfil): alterna entre Dono, Secretária e Mecânicos sem precisar sair. Antes de trocar, envia as pendências; se não der (sem internet), a troca é bloqueada para nada ficar para trás.
39. **Atualização do app:** aparelhos que abriram a primeira versão (tela "Usuário e Senha") ficavam presos nela, porque aquela versão não mostrava o aviso de "nova versão". Agora o service worker novo assume assim que é instalado e a primeira versão recarrega sozinha para a nova (testado simulando a troca de versão). Nas versões novas, a tela aberta continua igual até o usuário tocar em "Sincronizar e atualizar"; se fechar e abrir o app, já abre na versão nova. Nenhum dado se perde, porque tudo fica no IndexedDB e a fila de envio continua de uma versão para a outra.
