# CoisaPet — Contexto para o Claude Code

Este arquivo é lido automaticamente por qualquer sessão do Claude Code aberta
nesta pasta. Como a pasta vive dentro do OneDrive, ele acompanha o Raphael
entre os PCs de casa, escritório e notebook — use-o para dar continuidade
entre máquinas, já que o histórico de conversa do Claude Code **não** sincroniza
sozinho entre computadores diferentes.

## O que é o projeto

Sistema web interno de gestão da CoisaPet: React 18 + Vite + Tailwind CSS +
Supabase (banco, auth, edge functions). Múltiplos módulos internos (estoque,
produtos, pedidos, produção, financeiro, RH, etc.) mais alguns sites
estáticos publicados à parte (`site/`, `site-app/`, `equipe/`, `links/`).

Detalhes de stack, como rodar localmente e estrutura de pastas: ver `README.md`.

## Estado do versionamento (importante)

- Repositório git **local** iniciado em 2026-08-24. Antes disso não havia
  histórico de versões — só o estado atual dos arquivos.
- **Ainda não há remoto configurado** (nenhum GitHub/GitLab). Isso significa
  que, por enquanto, o `git log` só existe na máquina onde cada commit foi
  feito — o `.git` sincroniza entre os PCs via OneDrive, mas isso **não é
  recomendado como estratégia principal**: sync em tempo real (OneDrive/
  Dropbox) pode corromper o `.git` se duas máquinas gravarem ao mesmo tempo
  ou se o sync pegar o repo no meio de um commit.
- Recomendado: configurar um remoto privado (GitHub, por ex.) e trabalhar
  com `git pull` no início da sessão e `git push` ao final de mudanças
  relevantes, em vez de depender do OneDrive para isso.
- `.env.local` e `.claude/settings.local.json` ficam fora do versionamento
  de propósito (segredos e config local por máquina).
- A pasta `jogar fora/` (backups/descartes) também está fora do git.

## Como usar este arquivo entre máquinas

Para decisões e contexto que não ficam óbvios só de olhar o código/diff
(motivação de uma mudança, algo pendente, combinado com o Raphael), registre
um item breve na seção "Notas de sessão" abaixo. Para "o que mudou no
código", prefira `git log` / `git diff` — é a fonte da verdade.

## Notas de sessão

- **2026-08-24** — Repositório git inicializado localmente e criado este
  `CLAUDE.md` para dar continuidade entre os PCs de casa/escritório/notebook.
  Ainda falta configurar um remoto (GitHub) para sync real entre máquinas.
