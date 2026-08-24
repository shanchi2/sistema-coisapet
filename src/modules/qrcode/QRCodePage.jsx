import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { QrCode, Download, RefreshCw, Palette, Type, Image } from 'lucide-react'

// ─── Presets de cor ───────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { label: 'Clássico',     fg: '#000000', bg: '#FFFFFF' },
  { label: 'Invertido',    fg: '#FFFFFF', bg: '#000000' },
  { label: 'CoisaPet',     fg: '#6E3F25', bg: '#FFF8F0' },
  { label: 'Shopee',       fg: '#FA5230', bg: '#FFFFFF' },
  { label: 'Mercado Livre',fg: '#0A0080', bg: '#FEBF2C' },
  { label: 'Azul',         fg: '#1E3A8A', bg: '#EFF6FF' },
  { label: 'Verde',        fg: '#14532D', bg: '#F0FDF4' },
  { label: 'Roxo',         fg: '#4C1D95', bg: '#F5F3FF' },
]

const EXPORT_SIZE = 1500 // px

export function QRCodePage() {
  const [text,     setText]     = useState('')
  const [fgColor,  setFgColor]  = useState('#000000')
  const [bgColor,  setBgColor]  = useState('#FFFFFF')
  const [margin,   setMargin]   = useState(2)
  const [errorLvl, setErrorLvl] = useState('M')
  const [loading,  setLoading]  = useState(false)
  const [hasQR,    setHasQR]    = useState(false)

  const previewRef = useRef(null) // canvas de preview (pequeno)
  const exportRef  = useRef(null) // canvas de export (1500px), hidden

  // Gera o QR tanto no preview quanto no canvas de export
  async function generate(t, fg, bg, m, lvl) {
    if (!t.trim()) { setHasQR(false); return }
    setLoading(true)
    try {
      const opts = {
        errorCorrectionLevel: lvl,
        margin: m,
        color: { dark: fg, light: bg },
      }
      // Preview — renderiza no canvas visível
      if (previewRef.current) {
        await QRCode.toCanvas(previewRef.current, t, {
          ...opts,
          width: 320,
        })
      }
      // Export — renderiza no canvas oculto em alta resolução
      if (exportRef.current) {
        await QRCode.toCanvas(exportRef.current, t, {
          ...opts,
          width: EXPORT_SIZE,
        })
      }
      setHasQR(true)
    } catch (err) {
      console.error('Erro ao gerar QR:', err)
      setHasQR(false)
    } finally {
      setLoading(false)
    }
  }

  // Re-gera sempre que algum parâmetro muda
  useEffect(() => {
    const timer = setTimeout(() => {
      generate(text, fgColor, bgColor, margin, errorLvl)
    }, 300) // debounce de 300ms para não gerar a cada tecla
    return () => clearTimeout(timer)
  }, [text, fgColor, bgColor, margin, errorLvl])

  // Aplica preset de cor
  function applyPreset(preset) {
    setFgColor(preset.fg)
    setBgColor(preset.bg)
  }

  // Exporta o canvas de alta resolução como PNG
  function handleDownload() {
    if (!exportRef.current || !hasQR) return
    const link = document.createElement('a')
    link.download = `qrcode-coisapet-${Date.now()}.png`
    link.href = exportRef.current.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
            <QrCode size={20} strokeWidth={1.5} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-800">Gerador de QR Code</h1>
            <p className="text-sm text-gray-500">Gera QR Codes em alta resolução ({EXPORT_SIZE}×{EXPORT_SIZE}px)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── Coluna esquerda: configurações ── */}
          <div className="space-y-5">

            {/* Texto / URL */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Type size={15} strokeWidth={1.5} />
                Conteúdo
              </div>
              <textarea
                rows={4}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Cole uma URL, texto, número de telefone, email..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:border-slate-400 transition-colors"
              />
              <p className="text-xs text-gray-400">
                {text.length} caracteres
                {text.length > 500 && (
                  <span className="text-amber-500 ml-2">⚠ Textos longos geram QRs mais densos</span>
                )}
              </p>
            </div>

            {/* Cores */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Palette size={15} strokeWidth={1.5} />
                Cores
              </div>

              {/* Pickers manuais */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1.5">Cor do QR (foreground)</label>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                    <input
                      type="color"
                      value={fgColor}
                      onChange={e => setFgColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="text-sm font-mono text-gray-600">{fgColor.toUpperCase()}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1.5">Cor do fundo (background)</label>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={e => setBgColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="text-sm font-mono text-gray-600">{bgColor.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              {/* Presets */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Presets rápidos</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => applyPreset(preset)}
                      title={`${preset.fg} / ${preset.bg}`}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400 transition-all text-xs font-medium text-gray-600 hover:text-gray-800"
                    >
                      {/* Mini preview do preset */}
                      <span
                        className="w-4 h-4 rounded-sm border border-gray-200 shrink-0"
                        style={{ background: `linear-gradient(135deg, ${preset.fg} 50%, ${preset.bg} 50%)` }}
                      />
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Configurações avançadas */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Configurações avançadas</p>

              {/* Margem */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-500">Margem (módulos)</label>
                  <span className="text-xs font-mono font-semibold text-gray-700">{margin}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={6}
                  value={margin}
                  onChange={e => setMargin(Number(e.target.value))}
                  className="w-full accent-slate-700"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>Sem margem</span>
                  <span>Máxima</span>
                </div>
              </div>

              {/* Nível de correção de erro */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">
                  Nível de correção de erro
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { value: 'L', label: 'L', desc: '7%' },
                    { value: 'M', label: 'M', desc: '15%' },
                    { value: 'Q', label: 'Q', desc: '25%' },
                    { value: 'H', label: 'H', desc: '30%' },
                  ].map(lvl => (
                    <button
                      key={lvl.value}
                      onClick={() => setErrorLvl(lvl.value)}
                      className={`py-2 rounded-lg border text-xs font-semibold transition-all ${
                        errorLvl === lvl.value
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div>{lvl.label}</div>
                      <div className="font-normal opacity-70">{lvl.desc}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Nível maior = QR mais resistente a danos, mas mais denso. <strong>M</strong> é o ideal para a maioria dos casos.
                </p>
              </div>
            </div>
          </div>

          {/* ── Coluna direita: preview + export ── */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Image size={15} strokeWidth={1.5} />
                Preview
              </div>

              {/* Canvas de preview */}
              <div className="flex items-center justify-center rounded-xl overflow-hidden border border-gray-100"
                style={{ minHeight: 320, background: bgColor }}>
                {!text.trim() ? (
                  <div className="text-center py-12 px-6">
                    <QrCode size={48} strokeWidth={0.8} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-sm text-gray-400">Digite algo para gerar o QR Code</p>
                  </div>
                ) : loading ? (
                  <div className="text-center py-12">
                    <RefreshCw size={24} strokeWidth={1.5} className="mx-auto mb-2 text-gray-400 animate-spin" />
                    <p className="text-xs text-gray-400">Gerando...</p>
                  </div>
                ) : (
                  <canvas ref={previewRef} className="max-w-full" />
                )}
              </div>

              {/* Canvas oculto para export em alta resolução */}
              <canvas ref={exportRef} style={{ display: 'none' }} />

              {/* Informações do export */}
              {hasQR && (
                <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-500 space-y-0.5">
                  <p>📐 Resolução de export: <strong className="text-gray-700">{EXPORT_SIZE} × {EXPORT_SIZE}px</strong></p>
                  <p>🎨 Foreground: <strong className="font-mono text-gray-700">{fgColor.toUpperCase()}</strong> · Background: <strong className="font-mono text-gray-700">{bgColor.toUpperCase()}</strong></p>
                  <p>🛡 Correção de erro: <strong className="text-gray-700">Nível {errorLvl}</strong> · Margem: <strong className="text-gray-700">{margin}</strong></p>
                </div>
              )}

              {/* Botão de download */}
              <button
                onClick={handleDownload}
                disabled={!hasQR || loading}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm"
              >
                <Download size={16} strokeWidth={1.5} />
                Baixar PNG — {EXPORT_SIZE}×{EXPORT_SIZE}px
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
