# Bruno Mecânica Diesel — Sistema de OS

Esboço do sistema de Ordens de Serviço, clientes e financeiro da Bruno Mecânica Diesel.

- App web instalável no celular (PWA), funciona offline.
- Dados de demonstração salvos no próprio aparelho (IndexedDB).
- Publicação no GitHub Pages: `npm run deploy` (envia o build para a branch `gh-pages`).

## Rodar localmente

```bash
npm install
npm run dev
```

## Estrutura

- `src/data` — banco local (Dexie), dados de demonstração e repositórios (ponto de troca para o servidor na fase 2).
- `src/pages` — telas: Painel, OS, Clientes, Financeiro, Configurações.
- `src/components` — layout, cartões, gráfico, assinatura.
