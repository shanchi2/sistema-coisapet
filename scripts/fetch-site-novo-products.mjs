// Script pontual (não faz parte do app) — baixa uma curadoria de fotos reais
// de produto do bucket privado "product-photos" e salva localmente em
// site-novo/assets/products/, pro site novo não depender de signed URLs
// que expiram em 1h. Rodar uma vez: `node scripts/fetch-site-novo-products.mjs`.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

const SUPABASE_URL = 'https://lcybmdiqxmbqeuyeuhdj.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjeWJtZGlxeG1icWV1eWV1aGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjYyMjMsImV4cCI6MjA4OTAwMjIyM30.gAFVxdM6TMuse27UiASfFiw0NwfdcGhvck7AUv9EXPM'

const supabase = createClient(SUPABASE_URL, ANON_KEY)

// slug de saída -> { nome pra exibir, categoria, path do storage, preço }
const CURATED = [
  { slug: 'alimentador-interativo',   category: 'Acessórios',      photo_url: 'products/1777460700819-aphsl3l49dd.webp', name: 'Alimentador Interativo', price: 46.90 },
  { slug: 'banheira-banho-areia',     category: 'Acessórios',      photo_url: 'products/1777461276355-mucz68iukw.webp',   name: 'Banheira de Banho de Areia', price: 39.90 },
  { slug: 'bebedouro-ceramica',       category: 'Acessórios',      photo_url: 'products/1777463344478-12gf5krcqib.webp',  name: 'Bebedouro Comedouro Cerâmica', price: 14.90 },
  { slug: 'labirinto-playground',     category: 'Brinquedos',      photo_url: 'products/1777461392157-bkjajpob31c.webp',  name: 'Brinquedo Labirinto Playground', price: 29.90 },
  { slug: 'caixa-escavacao-dig-box',  category: 'Brinquedos',      photo_url: 'products/1777461707319-uh9goiwc7ej.webp',  name: 'Caixa de Escavação Dig Box', price: 44.90 },
  { slug: 'comedouro-interativo',     category: 'Acessórios',      photo_url: 'products/1777463431864-zzxvxghazz.webp',   name: 'Comedouro Interativo', price: 26.90 },
  { slug: 'divisoria-terrario',       category: 'Terrários',       photo_url: 'products/1777463539133-7m8i9p2vbi5.webp',  name: 'Divisória Muro de Contenção', price: 39.90 },
  { slug: 'enriquecimento-fibra-coco',category: 'Insumos Naturais',photo_url: 'products/1777561362825-tfvj7z8y0ug.webp',  name: 'Enriquecimento Ambiental — Fibra de Côco', price: 19.90 },
  { slug: 'escada-com-esconderijo',   category: 'Tocas',           photo_url: 'products/1777464513146-c1b2vrvc7gl.webp',  name: 'Escada Especial com Esconderijo', price: 24.90 },
  { slug: 'labirinto-com-visor',      category: 'Tocas',           photo_url: 'products/1777465118232-mhzwzf4w3n.webp',  name: 'Labirinto Esconderijo com Visor', price: 109.90 },
  { slug: 'pedras-seixo-de-rio',      category: 'Insumos Naturais',photo_url: 'products/1777466469354-jfxw0vn1vah.webp',  name: 'Pedras Seixo de Rio', price: 21.90 },
  { slug: 'plataforma-elevada-dupla', category: 'Brinquedos',      photo_url: 'products/1777467464816-lrhy80tukj.webp',   name: 'Plataforma Elevada Dupla', price: 49.90 },
]

const OUT_DIR = path.resolve('site-novo/assets/products')
fs.mkdirSync(OUT_DIR, { recursive: true })

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} pra ${url}`)); return }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', reject)
  })
}

const manifest = []
for (const item of CURATED) {
  const { data, error } = await supabase.storage.from('product-photos').createSignedUrl(item.photo_url, 3600)
  if (error) { console.error(`ERRO signed url ${item.slug}:`, error.message); continue }
  const ext = path.extname(item.photo_url) || '.webp'
  const outFile = path.join(OUT_DIR, `${item.slug}${ext}`)
  await download(data.signedUrl, outFile)
  console.log(`OK: ${item.slug}${ext}`)
  manifest.push({ ...item, file: `${item.slug}${ext}` })
}

fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\nPronto: ${manifest.length}/${CURATED.length} fotos baixadas em ${OUT_DIR}`)
