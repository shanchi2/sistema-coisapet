import { useEffect, useRef } from 'react'

// Editor rich-text simples (contentEditable + toolbar) — extraído de
// ManualsPage.jsx (fase dos cartões impressos) pra reaproveitar aqui
// também no Gerador de Manual (aba Links). Produz/recebe HTML puro.
export function RichEditor({ value, onChange }) {
  const ref = useRef()
  const isUpdating = useRef(false)

  useEffect(() => {
    if (!ref.current) return
    if (isUpdating.current) return
    if (ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || ''
    }
  }, [value])

  function handleInput() {
    isUpdating.current = true
    onChange(ref.current.innerHTML)
    setTimeout(() => { isUpdating.current = false }, 0)
  }

  function exec(cmd, val = null) {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
    handleInput()
  }

  function applyFontSize(size) {
    ref.current?.focus()
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || sel.getRangeAt(0).collapsed) return
    try {
      const range = sel.getRangeAt(0)
      const frag  = range.extractContents()
      const span  = document.createElement('span')
      span.style.fontSize = size
      span.appendChild(frag)
      range.insertNode(span)
      range.selectNodeContents(span)
      sel.removeAllRanges()
      sel.addRange(range)
    } catch (e) {
      document.execCommand('fontSize', false, '3')
    }
    handleInput()
  }

  const COLORS = ['#F6F0E5', '#C9A87B', '#C5904A', '#ffffff', '#ff6b6b', '#51cf66', '#74c0fc']

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 flex-wrap p-2 bg-slate-800 border border-slate-600 rounded-xl">
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('bold') }}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-600 text-slate-200 font-black text-sm">B</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('italic') }}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-600 text-slate-300 italic text-sm">I</button>
        <div className="w-px h-5 bg-slate-600 mx-0.5"/>
        {[['P', '5.5px'], ['M', '7px'], ['G', '9px']].map(([lbl, sz]) => (
          <button key={lbl} type="button" onMouseDown={e => { e.preventDefault(); applyFontSize(sz) }}
            className="px-2 h-7 rounded-lg hover:bg-slate-600 text-slate-300 text-xs font-bold">{lbl}</button>
        ))}
        <div className="w-px h-5 bg-slate-600 mx-0.5"/>
        {COLORS.map(col => (
          <button key={col} type="button" onMouseDown={e => { e.preventDefault(); exec('foreColor', col) }}
            className="w-4 h-4 rounded-full border border-slate-500 hover:scale-110 transition-transform flex-shrink-0"
            style={{ background: col }}/>
        ))}
        <div className="w-px h-5 bg-slate-600 mx-0.5"/>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('removeFormat') }}
          className="px-2 h-7 rounded-lg text-[10px] font-bold text-slate-400 hover:bg-slate-600">Limpar</button>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={handleInput} onBlur={handleInput}
        style={{
          background: '#2e1609', color: '#C9A87B', fontFamily: 'Nunito,sans-serif',
          fontSize: '11px', lineHeight: 1.6, padding: '10px 12px',
          borderRadius: 12, border: '1.5px solid rgba(197,144,74,0.3)',
          minHeight: 100, outline: 'none', overflowY: 'auto', maxHeight: 220,
          whiteSpace: 'pre-wrap',
        }}/>
      <p className="text-xs text-slate-400">Selecione o texto e use a toolbar para formatar. <b>B</b>=negrito, <i>I</i>=itálico, P/M/G=tamanho</p>
    </div>
  )
}
