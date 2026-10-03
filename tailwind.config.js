import defaultColors from 'tailwindcss/colors'
import plugin from 'tailwindcss/plugin'

// ─────────────────────────────────────────────────────────────────────
// MODO ESCURO (03/10) — como funciona
//
// O sistema tem ~7.400 classes `slate-*` e outras ~5.000 coloridas em 167
// arquivos. Pôr `dark:` em cada uma seria inviável e frágil. Em vez disso,
// TODA cor da paleta vira uma variável CSS (`--c-slate-100`, etc.):
//   - no modo claro (:root) a variável tem EXATAMENTE o hex de sempre →
//     o visual claro não muda nem 1 pixel;
//   - com a classe `.dark` no <html>, as variáveis trocam de valor →
//     o sistema inteiro escurece sem mexer em nenhuma tela.
//
// Regras do modo escuro:
//   - cinzas (slate/gray) viram uma escala escura própria com fundo
//     #151515 (pedido do Raphael), cards #1C1C1C e texto claro;
//   - `white` (fundo de card) vira #1C1C1C; `text-white` é forçado de volta
//     pra branco em src/index.css (texto em botão colorido continua branco);
//   - cores (rosa, verde, âmbar...) espelham: fundos claros (50-300) viram
//     tons escuros puxados pro cinza do card, textos escuros (700-950) viram
//     tons claros — badge "verde claro com texto verde escuro" vira "verde
//     escuro com texto verde claro", que é o padrão de dark mode.
// Ajuste fino do que fica fora do Tailwind (hex fixo em style=, gráficos,
// toasts, sidebar): ver bloco "MODO ESCURO" em src/index.css.
// ─────────────────────────────────────────────────────────────────────

const custom = {
  // Rosa vibrante — cor principal (do "coisa" no logo)
  rose: {
    50:  '#FFF1F5', 100: '#FFE0EB', 200: '#FCA5B8', 300: '#FB7096', 400: '#F43F5E',
    500: '#E11D48', 600: '#BE123C', 700: '#9F1239', 800: '#881337', 900: '#4C0519', 950: '#2A0410',
  },
  // Âmbar dourado — cor de destaque (do "pet" no logo)
  amber: {
    50:  '#FFFBEB', 100: '#FEF3C7', 200: '#FDE68A', 300: '#FCD34D', 400: '#FBBF24',
    500: '#F59E0B', 600: '#D97706', 700: '#B45309', 800: '#92400E', 900: '#78350F', 950: '#451A03',
  },
  // Azul céu — cor de apoio (da borda do logo)
  sky: {
    50:  '#F0F9FF', 100: '#E0F2FE', 200: '#BAE6FD', 300: '#7DD3FC', 400: '#38BDF8',
    500: '#0EA5E9', 600: '#0284C7', 700: '#0369A1', 800: '#075985', 900: '#0C4A6E', 950: '#082F49',
  },
}

const CHROMATIC = ['rose', 'amber', 'sky', 'emerald', 'violet', 'indigo', 'orange', 'red', 'blue',
  'purple', 'yellow', 'pink', 'teal', 'green', 'cyan', 'lime', 'fuchsia']
const NEUTRAL = ['slate', 'gray']
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

// Escala escura dos cinzas: 50 = fundo da página, white = card, 100-300 =
// realces/bordas, 400-950 = textos (cada vez mais claros).
const NEUTRAL_DARK = {
  50: '#151515', 100: '#242424', 200: '#2E2E2E', 300: '#424242', 400: '#7A7A7A',
  500: '#9A9A9A', 600: '#B5B5B5', 700: '#CFCFCF', 800: '#E3E3E3', 900: '#EFEFEF', 950: '#F7F7F7',
}
const CARD_DARK = '#1C1C1C'

const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
}
const channels = (hex) => hexToRgb(hex).join(' ')
const mix = (hexA, hexB, wB) => {
  const a = hexToRgb(hexA), b = hexToRgb(hexB)
  return a.map((v, i) => Math.round(v * (1 - wB) + b[i] * wB)).join(' ')
}

const palette = (name) => custom[name] || defaultColors[name]

// Espelhamento das cores no escuro (ver comentário no topo)
function chromaticDark(p) {
  return {
    50:  mix(p[950], CARD_DARK, 0.55),
    100: mix(p[900], CARD_DARK, 0.45),
    200: mix(p[800], CARD_DARK, 0.35),
    300: mix(p[700], CARD_DARK, 0.25),
    400: channels(p[400]),
    500: channels(p[500]),
    600: channels(p[500]),
    700: channels(p[400]),
    800: channels(p[300]),
    900: channels(p[200]),
    950: channels(p[100]),
  }
}

const colorVar = (name, shade) => `rgb(var(--c-${name}-${shade}) / <alpha-value>)`

const themedColors = { white: 'rgb(var(--c-white) / <alpha-value>)' }
;[...NEUTRAL, ...CHROMATIC].forEach(name => {
  themedColors[name] = Object.fromEntries(SHADES.map(s => [s, colorVar(name, s)]))
})

const themeVars = plugin(({ addBase }) => {
  const light = { '--c-white': '255 255 255' }
  const dark  = { '--c-white': channels(CARD_DARK) }
  NEUTRAL.forEach(name => SHADES.forEach(s => {
    light[`--c-${name}-${s}`] = channels(palette(name)[s])
    dark[`--c-${name}-${s}`]  = channels(NEUTRAL_DARK[s])
  }))
  CHROMATIC.forEach(name => {
    const p = palette(name)
    const d = chromaticDark(p)
    SHADES.forEach(s => {
      light[`--c-${name}-${s}`] = channels(p[s])
      dark[`--c-${name}-${s}`]  = d[s]
    })
  })
  addBase({ ':root': light, '.dark': dark })
})

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Nunito Sans', 'sans-serif'],
        display: ['Nunito', 'sans-serif'],
      },
      colors: themedColors,
      boxShadow: {
        card:  '0 2px 12px rgba(0, 0, 0, 0.06)',
        modal: '0 8px 40px rgba(0, 0, 0, 0.12)',
        focus: '0 0 0 3px rgba(244, 63, 94, 0.15)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
    },
  },
  plugins: [themeVars],
}
