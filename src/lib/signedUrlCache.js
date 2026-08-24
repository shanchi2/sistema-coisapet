import { useState, useEffect } from 'react'
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
  useEffect(() => {
    let alive = true
    if (!path) { setUrl(null); return }
    getSignedUrl(bucket, path, expiresIn).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [bucket, path, expiresIn])
  return url
}
