import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'

// Cache em memória: chave = "bucket::caminho", valor = { url, expiresAt }
const cache = new Map()
const pending = new Map() // evita duas buscas simultâneas pro mesmo arquivo

const DEFAULT_EXPIRES_IN = 3600  // segundos (1h) — mesmo padrão já usado no sistema
const SAFETY_MARGIN_MS   = 60_000 // renova um pouco antes de expirar de vez, pra nunca mostrar link quebrado

// Busca a URL assinada — usa o cache se já tiver uma válida, senão busca e guarda
export async function getSignedUrl(bucket, path, expiresIn = DEFAULT_EXPIRES_IN) {
  if (!path) return null
  const key = `${bucket}::${path}`

  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now() + SAFETY_MARGIN_MS) return cached.url

  if (pending.has(key)) return pending.get(key)

  const promise = supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
    .then(({ data, error }) => {
      pending.delete(key)
      if (error || !data) return null
      cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 })
      return data.signedUrl
    })
    .catch(() => { pending.delete(key); return null })

  pending.set(key, promise)
  return promise
}

// Limpa uma entrada específica — usar depois de trocar/remover um arquivo,
// pra próxima busca não devolver a URL antiga do cache
export function invalidateSignedUrl(bucket, path) {
  cache.delete(`${bucket}::${path}`)
}

// Hook pronto — substitui o padrão "useState + useEffect + createSignedUrl"
// que estava espalhado (e duplicado) em vários componentes
export function useSignedUrl(bucket, path, expiresIn) {
  const [url, setUrl] = useState(null)
  useEffect(() => startAutoRenew(bucket, path, expiresIn, setUrl), [bucket, path, expiresIn])
  return url
}

// Busca o link e agenda a renovação ~30s antes de vencer (aí o cache já
// considera o link velho e busca outro). Sem isso, tela aberta >1h ficava
// com imagem quebrada — achado 25/09 na tela de mídia, valia pra todas.
function startAutoRenew(bucket, path, expiresIn, setUrl) {
  let alive = true
  let timer = null
  if (!path) { setUrl(null); return }
  const ttlMs = (expiresIn || DEFAULT_EXPIRES_IN) * 1000
  const load = () => getSignedUrl(bucket, path, expiresIn).then(u => {
    if (!alive) return
    setUrl(u)
    const entry = cache.get(`${bucket}::${path}`)
    const wait = entry ? entry.expiresAt - Date.now() - 30_000 : ttlMs - 30_000
    timer = setTimeout(load, Math.max(wait, 30_000))
  })
  load()
  return () => { alive = false; if (timer) clearTimeout(timer) }
}

// Igual ao useSignedUrl (inclusive a renovação automática), e ainda se
// recupera se o link falhar mesmo assim (ex: PC hibernou e o timer atrasou).
// Achado 25/09 (Raphael, tela de mídia): as telas geravam o link 1x ao
// abrir e guardavam a string — com a aba aberta >1h o link expirava e a
// imagem aparecia quebrada. Aqui o <img>/<video> chama `onError`, que
// descarta o link do cache e busca um novo (até 2 tentativas por path).
export function useFreshSignedUrl(bucket, path, expiresIn) {
  const [url, setUrl] = useState(null)
  const retries = useRef(0)

  useEffect(() => {
    retries.current = 0
    return startAutoRenew(bucket, path, expiresIn, setUrl)
  }, [bucket, path, expiresIn])

  const onError = useCallback(async () => {
    if (!path || retries.current >= 2) return
    retries.current += 1
    invalidateSignedUrl(bucket, path)
    setUrl(await getSignedUrl(bucket, path, expiresIn))
  }, [bucket, path, expiresIn])

  return [url, onError, retries.current >= 2]
}
