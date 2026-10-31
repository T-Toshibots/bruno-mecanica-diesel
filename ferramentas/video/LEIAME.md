# Vídeo de apresentação

Gera o vídeo narrado do sistema (navegador percorrendo o app real + voz "Microsoft Maria", pt-BR).

Requisitos (uma vez): `npm i --no-save ffmpeg-static` e `npx playwright-core install ffmpeg`.

```bash
# 1. narração (Windows)
powershell -ExecutionPolicy Bypass -File ferramentas/video/narrar.ps1 ferramentas/video
# 2. servidores: app e palco
npm run build && npx vite preview --port 4173
node ferramentas/video/servidor.cjs <arquivo-texto-com-o-caminho-da-pasta-ferramentas/video>   # porta 4174
# 3. gravar e montar
node ferramentas/video/gravar.cjs
node ferramentas/video/montar.cjs apresentacao/apresentacao-bruno-mecanica-diesel.mp4
```

Para mudar falas ou cenas: edite `roteiro.json` (falas) e `gravar.cjs` (ações de cada cena).
