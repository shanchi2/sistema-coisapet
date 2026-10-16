# MinhaCoisaPet

Jogo de cuidar de hamster da CoisaPet (2D pixel art, PWA). Projeto Vite
separado do sistema interno — tem o próprio `package.json`.

- `npm install` / `npm run dev` (dentro de `game/`)
- `src/sim.js` — regras (necessidades, tempo offline, ações, dicas)
- `src/art.js` — pixel art desenhada por código (paletas por espécie)
- `src/scene.js` — cena Phaser (gaiola, hamster, sujeira)
- `src/App.jsx` — interface React (boas-vindas, barras, botões)

Deploy: o workflow `deploy.yml` builda e manda `game/dist/` pra
`public_html/game/` (subdomínio `game.coisapet.com.br`).
