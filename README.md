# 🐹 CoisaPet — Sistema de Gestão Interna

Sistema web modular para gestão operacional da CoisaPet, desenvolvido com **React + Vite + Tailwind CSS + Supabase**.

---

## Stack tecnológica

| Tecnologia | Versão | Função |
|---|---|---|
| **Vite** | ^5.3 | Servidor de dev e build |
| **React** | ^18.3 | Interface — componentes e páginas |
| **Tailwind CSS** | ^3.4 | Estilização por classes utilitárias |
| **React Router** | ^6.23 | Navegação entre módulos |
| **Supabase** | ^2.43 | Banco de dados, autenticação e backend |
| **Lucide React** | ^0.383 | Ícones |
| **React Hot Toast** | ^2.4 | Notificações de feedback |

---

## Como rodar o projeto

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
# Copie o arquivo de exemplo
cp .env.example .env.local
```

Abra o `.env.local` e preencha com as credenciais do seu projeto Supabase:

```
Supabase → seu projeto → Settings → API
```

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

### 3. Configurar o banco de dados

No painel do Supabase, acesse **SQL Editor → New Query**, cole o conteúdo de `supabase/setup.sql` e clique em **Run**.

### 4. Criar o primeiro usuário admin

No painel do Supabase, crie um usuário em:
**Authentication → Users → Add user**

Depois, no SQL Editor, execute:

```sql
UPDATE public.profiles
SET
  role = 'admin',
  name = 'Seu Nome Aqui'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'seu@email.com'
);
```

### 5. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse: [http://localhost:5173](http://localhost:5173)

---

## Estrutura de pastas

```
coisapet-system/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── .env.example           ← copie para .env.local e preencha
├── .gitignore
├── supabase/
│   └── setup.sql          ← rode este SQL no Supabase
└── src/
    ├── index.css           ← estilos globais + Tailwind + Google Fonts
    ├── main.jsx            ← entry point React
    ├── App.jsx             ← rotas principais
    ├── lib/
    │   └── supabase.js     ← cliente Supabase
    ├── contexts/
    │   └── AuthContext.jsx ← autenticação global (login, logout, sessão)
    ├── hooks/              ← hooks customizados (próximas fases)
    ├── routes/
    │   └── ProtectedRoute.jsx ← guarda de rotas autenticadas
    ├── components/
    │   ├── layout/
    │   │   ├── Layout.jsx  ← estrutura base das páginas internas
    │   │   ├── Sidebar.jsx ← menu lateral
    │   │   └── Header.jsx  ← barra superior
    │   └── ui/
    │       ├── ComingSoonPage.jsx ← placeholder para módulos futuros
    │       └── LoadingSpinner.jsx ← spinner reutilizável
    └── modules/
        ├── auth/
        │   └── LoginPage.jsx
        ├── dashboard/
        │   └── DashboardPage.jsx
        ├── materials/      ← Fase 2
        ├── products/       ← Fase 3
        ├── orders/         ← Fase 4
        ├── production/     ← Fase 5
        ├── financial/      ← Fase 6
        └── employees/      ← Fase 7
```

---

## Módulos e progresso

| # | Módulo | Status |
|---|---|---|
| 1 | Autenticação + Layout base | ✅ Fase 1 — Completo |
| 2 | Matéria-Prima (CRUD + movimentações) | 🔜 Fase 2 |
| 3 | Produtos + Ficha Técnica (BOM) | 🔜 Fase 3 |
| 4 | Pedidos + validação de estoque | 🔜 Fase 4 |
| 5 | Produção + baixa de insumos | 🔜 Fase 5 |
| 6 | Financeiro básico | 🔜 Fase 6 |
| 7 | Funcionários + Ponto | 🔜 Fase 7 |
| 8 | Dashboard + Relatórios | 🔜 Fase 8 |

---

## Deploy (Hostinger)

```bash
# Gera a pasta dist/ com os arquivos estáticos
npm run build

# Suba o conteúdo de dist/ para o public_html da Hostinger
```

---

## Paleta de cores

| Cor | Uso | Hex principal |
|---|---|---|
| Rosa | Primária — ações, destaque, login | `#F43F5E` |
| Âmbar | Alertas, avisos, destaques secundários | `#F59E0B` |
| Azul céu | Informações, links | `#0EA5E9` |
| Slate escuro | Sidebar | `#1E293B` |
| Slate claro | Fundo das páginas | `#F8FAFC` |
