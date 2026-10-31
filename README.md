# Bruno Mecânica Diesel — Sistema de Gestão

Sistema de ordens de serviço, clientes e financeiro para mecânica diesel pesada. Funciona **offline** e sincroniza quando a internet volta.

- Link da demonstração: https://t-toshibots.github.io/bruno-mecanica-diesel/
- Planejamento: [PLANEJAMENTO.md](PLANEJAMENTO.md) · Decisões: [DECISOES.md](DECISOES.md) · Requisitos: [prompt-sistema-oficina-diesel.md](prompt-sistema-oficina-diesel.md)

## Situação

| Fase | Situação |
|---|---|
| 1. Planejamento | ✅ aprovado |
| 2. Fundação (perfis, banco local, sincronização, testes) | ✅ em **modo demonstração** (sem Supabase) |
| 3. Cadastros (preços por cliente, contatos, fornecedores, equipe, catálogo, importação) | ✅ |
| 4. Orçamentos e OS (vários veículos, horas, fotos com fila própria, assinaturas, garantia, duplicar, rascunho) | ✅ |
| 5 a 9 | a fazer |

## Requisitos

- Windows + VS Code (também funciona em macOS/Linux)
- Node.js 20 ou mais novo
- Google Chrome (para os testes de ponta a ponta)

## Rodar localmente

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal e escolha um perfil para entrar (Dono, Secretária ou Mecânico).

## Testes

```bash
npm test            # unitários: cálculos, preços por cliente, importação, permissões, sincronização, conflitos, numeração offline
npm run test:e2e    # ponta a ponta no Chrome: chamado offline, permissões, importação, tabela de preços, fluxo completo da OS, rascunho, garantia
```

## Publicar

```bash
npm run deploy      # gera o build e envia para a branch gh-pages (GitHub Pages)
```

## Variáveis de ambiente

Nenhuma no modo demonstração. Quando o Supabase for ligado:

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | chave **anon** (pública). A chave `service_role` nunca vai para o código. |

O SQL do banco está em `supabase/migrations/` (preparado, ainda não executado em um projeto real).

## Importar clientes e veículos

Cadastros → **Importar** → **Baixar modelo**. Preencha no Excel (uma linha por veículo), salve como .xlsx ou CSV e envie. O sistema mostra uma prévia com os erros antes de gravar.

## Trocar a marca (outra oficina)

Edite apenas `src/config/tema.ts` (nome, cores, dados da oficina) e as imagens em `public/` (`logo.png`, `icon-*.png`).

## Como testar o modo offline

> Na primeira vez, abra o app com internet e espere a tela **Sincronização** mostrar "App guardado neste aparelho".

**No computador (demonstração):** tela **Sincronização** → **Simular sem internet**. Crie uma OS, veja o contador de pendências, desligue a simulação e veja a sincronização acontecer.

**No celular:**
1. Abra o link, entre e use o app uma vez com internet.
2. Instale: Android (Chrome) → menu ⋮ → **Instalar app**. iPhone (Safari) → Compartilhar → **Adicionar à Tela de Início**.
3. Ative o **modo avião**. O indicador no topo mostra **Offline**.
4. Entre como **Mecânico** → **Abrir chamado em campo** → preencha e salve. A OS aparece com número provisório `P-XXXX-0001` e "Não sincronizada".
5. Feche o app e abra de novo: a OS continua lá.
6. Desative o modo avião: o indicador mostra **Sincronizando** e a OS recebe o número oficial `OS 000xx`.
7. Saia e entre como **Secretária**: o chamado aparece em "Chamados para completar".

> Limitação do modo demonstração: o "servidor" fica no próprio navegador, então a sincronização entre **aparelhos diferentes** só funcionará com o Supabase.

## Estrutura

```
src/config      marca e dados da oficina
src/domain      tipos, cálculos, permissões, validações (regras de negócio puras)
src/db          banco local (Dexie/IndexedDB) e consultas
src/sync        fila de envio, sincronização, servidor de demonstração, sessão
src/features    telas por área (os, clientes, financeiro, painel, sincronização…)
src/components  componentes compartilhados
src/demo        dados fictícios
supabase/       migrações SQL
tests/          unit (Vitest) e e2e (Playwright)
```
