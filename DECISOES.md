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
