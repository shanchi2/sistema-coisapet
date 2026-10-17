// Relógio do jogo (17/10): usa a HORA DO SERVIDOR sempre que consegue falar
// com ele (cada resposta da game-api traz `now`). Assim adiantar/atrasar o
// relógio do celular não "engana" o pet. Sem internet, cai no relógio do
// aparelho (offset 0) — o jogo continua funcionando.
let offset = 0

export const now = () => Date.now() + offset

export function setServerNow(serverMs) {
  if (Number.isFinite(serverMs)) offset = serverMs - Date.now()
}
