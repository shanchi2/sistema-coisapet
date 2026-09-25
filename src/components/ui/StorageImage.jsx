import { useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { useFreshSignedUrl } from '../../lib/signedUrlCache'

// <img> de arquivo em bucket privado do Supabase que renova o link
// assinado sozinho quando ele vence (ver useFreshSignedUrl). Usar no
// lugar de <img src={signedUrl}> guardado em estado.
export function StorageImage({ bucket, path, alt = '', className = '', ...rest }) {
  const [url, onError, gaveUp] = useFreshSignedUrl(bucket, path)
  const [failed, setFailed] = useState(false)

  if (!path) return null
  if (failed && gaveUp) {
    return (
      <span className={`${className} flex flex-col items-center justify-center gap-1 bg-slate-50 text-slate-300`}>
        <ImageOff size={18} />
        <span className="text-[9px] font-semibold text-slate-400">Indisponível</span>
      </span>
    )
  }
  if (!url) {
    return <span className={`${className} flex items-center justify-center bg-slate-50`}><Loader2 size={14} className="animate-spin text-slate-300" /></span>
  }
  return (
    <img src={url} alt={alt} className={className} {...rest}
      onError={() => { setFailed(true); onError() }}
      onLoad={() => setFailed(false)} />
  )
}
