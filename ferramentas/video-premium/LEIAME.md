# Vídeo premium (Full HD, câmera, vinhetas, trilha)

1. **Narração:** coloque o áudio completo e corte nas 10 cenas em `falas/` (`01-abertura.wav` … `10-fechamento.wav`)
   e escreva `falas/duracoes.txt` (`id segundos` por linha). Pontos de corte usados no áudio de 30/10/2026:
   `0 10.53 21.24 31.54 40.53 47.87 54.06 61.07 69.47 76.13 89.39` (s).
2. **Trilha e efeitos** (sintetizados, sem direitos autorais): `node sons.cjs 170`
3. **Servidores:** `npm run build && npx vite preview --port 4173` e `node servidor.cjs <arquivo com o caminho desta pasta>` (porta 4174).
4. **Gravar:** `node gravar.cjs` (captura de tela 1920×1080 em `quadros/` + `linha.json`).
5. **Montar:** `node montar.cjs ../../apresentacao/apresentacao-premium.mp4`

Requisitos: `npm i --no-save ffmpeg-static`. As falas exibidas nas legendas ficam em `gravar.cjs` (`FALAS`).
