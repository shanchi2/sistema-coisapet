import { useEffect, useState } from 'react'
import {
  Megaphone, Power, Tag, Percent, Save, Sparkles, RefreshCw,
  MousePointerClick, Eye, TrendingUp, ExternalLink, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useBlogBanners } from './hooks/useBlogBanners'
import { DailyBars } from '../dashboard/widgets'

const fmtN = v => (Number(v) || 0).toLocaleString('pt-BR')
const PLAT_DOT = { Shopee: '#EE4D2D', 'Mercado Livre': '#F5A300' }

// Tabela pequena: nome · exibições · cliques · CTR
function StatTable({ title, rows, first }) {
  if (!rows?.length) return null
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 mb-2">{title}</p>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left font-semibold px-3 py-2"></th>
              <th className="text-right font-semibold px-3 py-2">Exibições</th>
              <th className="text-right font-semibold px-3 py-2">Cliques</th>
              <th className="text-right font-semibold px-3 py-2">CTR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-slate-700 max-w-[280px]">{first(r)}</td>
                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{fmtN(r.impressions)}</td>
                <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">{fmtN(r.clicks)}</td>
                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{r.ctr == null ? '—' : `${r.ctr.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const BANNER_FN_URL = 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/blog-banner'
const PERIODS = [7, 30, 90]

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 w-full text-left px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors"
    >
      <div>
        <p className="text-sm font-bold text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <div className={`w-11 h-6 rounded-full shrink-0 transition-colors relative ${checked ? 'bg-rose-500' : 'bg-slate-300'}`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </div>
    </button>
  )
}

export function BlogBannersPage() {
  const { loading, fetchSettings, fetchCategories, updateSettings, fetchStats } = useBlogBanners()
  const [settings, setSettings] = useState(null)
  const [categories, setCategories] = useState([])
  const [stats, setStats] = useState(null)
  const [period, setPeriod] = useState(30)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => { load() }, [])
  useEffect(() => { if (settings) loadStats() }, [period]) // eslint-disable-line

  async function load() {
    const [s, c] = await Promise.all([fetchSettings(), fetchCategories()])
    setSettings(s)
    setCategories(c)
    loadStats()
  }

  async function loadStats() {
    setStats(await fetchStats(period))
  }

  function patch(fields) {
    setSettings(s => ({ ...s, ...fields }))
  }

  async function save() {
    await updateSettings({
      active: settings.active,
      coupon_code: settings.coupon_code,
      discount_label: settings.discount_label,
      category_ids: settings.category_ids,
      include_rodinhas: settings.include_rodinhas,
      show_on_ml: settings.show_on_ml,
      show_on_shopee: settings.show_on_shopee,
      show_coupon: settings.show_coupon !== false,
    })
  }

  function toggleCategory(id) {
    const set = new Set(settings.category_ids || [])
    set.has(id) ? set.delete(id) : set.add(id)
    patch({ category_ids: [...set] })
  }

  async function sortearPreview() {
    setPreviewLoading(true)
    try {
      const res = await fetch(BANNER_FN_URL, { method: 'POST' })
      const data = await res.json()
      if (!data.available) { toast.error(data.reason || 'Nenhum banner disponível.'); setPreview(null); return }
      setPreview(data)
    } catch {
      toast.error('Erro ao buscar prévia.')
    } finally {
      setPreviewLoading(false)
    }
  }

  if (!settings) {
    return <div className="p-6 text-sm text-slate-400">Carregando…</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-rose-50 flex items-center justify-center">
          <Megaphone className="text-rose-500" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-display font-bold text-slate-800">Banners do Blog</h1>
          <p className="text-sm text-slate-400">Banner promocional sorteado no meio dos posts — produto, plataforma e texto mudam a cada visualização.</p>
        </div>
      </div>

      {/* Status */}
      <div className="card">
        <Toggle
          checked={!!settings.active}
          onChange={v => patch({ active: v })}
          label={settings.active ? 'Sorteio geral ligado' : 'Sorteio geral desligado'}
          hint={settings.active ? 'Posts no modo "Sorteio geral" mostram um produto sorteado das categorias abaixo.' : 'Posts no modo "Sorteio geral" não mostram banner.'}
        />
        <p className="text-[11px] text-slate-400 mt-2">Cada post escolhe o próprio banner no editor do post (bloco <b>Banners deste post</b>): sorteio geral, produtos escolhidos ou sem banner. Posts com <b>produtos escolhidos</b> mostram o banner mesmo com o sorteio desligado.</p>
      </div>

      {/* Configuração */}
      <div className="card space-y-4">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Tag size={15} className="text-rose-400" /> Cupom e desconto</h2>
        <Toggle checked={settings.show_coupon !== false} onChange={v => patch({ show_coupon: v })}
          label={settings.show_coupon !== false ? 'Divulgar cupom nos banners' : 'Só banners (sem cupom)'}
          hint="Padrão do blog — cada post pode trocar (Divulgar cupom / Só banner) no editor." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Código do cupom</label>
            <input className="input mt-1" value={settings.coupon_code || ''} onChange={e => patch({ coupon_code: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Texto do desconto (ex: "5%", "R$10")</label>
            <input className="input mt-1" value={settings.discount_label || ''} onChange={e => patch({ discount_label: e.target.value })} />
          </div>
        </div>
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">Confirme que esse cupom existe de verdade no Mercado Livre e na Shopee antes de ativar — o texto do banner promete esse desconto pro cliente.</p>
        </div>

        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 pt-2"><Percent size={15} className="text-rose-400" /> Quais produtos entram no sorteio</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categories.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={(settings.category_ids || []).includes(c.id)} onChange={() => toggleCategory(c.id)} className="accent-rose-500" />
              {c.name}
            </label>
          ))}
        </div>
        <Toggle
          checked={!!settings.include_rodinhas}
          onChange={v => patch({ include_rodinhas: v })}
          label="Incluir Rodinhas"
          hint="Rodinhas ficam na categoria Acessório junto com outras coisas — por isso é uma opção separada (identifica pelo SKU ROD-)."
        />

        <h2 className="text-sm font-bold text-slate-700 pt-2">Plataformas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Toggle checked={!!settings.show_on_ml} onChange={v => patch({ show_on_ml: v })} label="Mercado Livre" />
          <Toggle checked={!!settings.show_on_shopee} onChange={v => patch({ show_on_shopee: v })} label="Shopee" />
        </div>

        <button onClick={save} disabled={loading} className="btn-primary flex items-center gap-2 mt-2">
          <Save size={15} /> Salvar configuração
        </button>
      </div>

      {/* Prévia */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Sparkles size={15} className="text-rose-400" /> Prévia</h2>
          <button onClick={sortearPreview} disabled={previewLoading} className="btn-secondary flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} className={previewLoading ? 'animate-spin' : ''} /> Sortear exemplo
          </button>
        </div>
        {preview ? (
          <div className="flex items-center gap-4 border border-amber-200 bg-amber-50 rounded-2xl p-4 max-w-xl">
            {preview.product.image_url && <img src={preview.product.image_url} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />}
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-amber-700">{preview.headline}</p>
              <p className="text-sm mt-1 text-slate-700">{preview.body}</p>
              <a href={preview.link} target="_blank" rel="noopener" className="text-xs font-bold text-rose-600 flex items-center gap-1 mt-2">
                Ver produto ({preview.platform}) <ExternalLink size={11} />
              </a>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Clique em "Sortear exemplo" pra ver como um banner fica na prática.</p>
        )}
      </div>

      {/* Estatísticas */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><TrendingUp size={15} className="text-rose-400" /> Estatística</h2>
          <div className="flex gap-1">
            {PERIODS.map(d => (
              <button key={d} onClick={() => setPeriod(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${period === d ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {d}D
              </button>
            ))}
          </div>
        </div>

        {stats && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <Eye size={16} className="mx-auto text-slate-400 mb-1" />
                <p className="text-lg font-bold text-slate-800">{fmtN(stats.total_impressions)}</p>
                <p className="text-[11px] text-slate-400">Banners mostrados</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <MousePointerClick size={16} className="mx-auto text-slate-400 mb-1" />
                <p className="text-lg font-bold text-slate-800">{fmtN(stats.total_clicks)}</p>
                <p className="text-[11px] text-slate-400">Cliques</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <TrendingUp size={16} className="mx-auto text-slate-400 mb-1" />
                <p className="text-lg font-bold text-slate-800">{stats.total_impressions ? `${stats.ctr.toFixed(1)}%` : '—'}</p>
                <p className="text-[11px] text-slate-400">CTR (cliques ÷ exibições)</p>
              </div>
            </div>

            {stats.total_impressions === 0 && stats.total_clicks === 0 ? (
              <div className="flex items-start gap-2 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2.5">
                <AlertTriangle size={15} className="text-sky-500 shrink-0 mt-0.5" />
                <p className="text-xs text-sky-700">Nada registrado neste período. Exibições e cliques são gravados pelo site (coisapet-site) — se o snippet de rastreio dos banners ainda não foi colado no <b>footer.php</b>, aqui fica zerado.</p>
              </div>
            ) : (
              <>
                {stats.total_clicks > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-1">Cliques por dia</p>
                    <DailyBars data={stats.daily} dataKey="total" unit="cliques" format={v => `${fmtN(v)} cliques`} height={140} />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <StatTable title="Por plataforma" rows={stats.by_platform} first={r => (
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: PLAT_DOT[r.label] || '#94A3B8' }} />{r.label}</span>
                  )} />
                  {stats.by_coupon.length > 0 && (
                    <StatTable title="Com cupom × sem cupom" rows={stats.by_coupon} first={r => r.label} />
                  )}
                </div>

                <StatTable title="Posts que mais levam clique" rows={stats.by_post} first={r => <span className="truncate block" title={r.slug}>{r.title}</span>} />

                {stats.ranking.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-2">Post → produto → plataforma</p>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr><th className="text-left font-semibold px-3 py-2">Post</th><th className="text-left font-semibold px-3 py-2">Produto</th><th className="text-left font-semibold px-3 py-2">Foi pra</th><th className="text-right font-semibold px-3 py-2">Cliques</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stats.ranking.slice(0, 30).map((r, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 text-slate-700 max-w-[260px] truncate" title={r.post_slug}>{r.title}</td>
                              <td className="px-3 py-2 text-slate-600 max-w-[220px] truncate">{r.product}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: PLAT_DOT[r.platform] || '#94A3B8' }} />{r.platform}</td>
                              <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">{fmtN(r.clicks)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <StatTable title="Produtos" rows={stats.by_product} first={r => <span className="truncate block">{r.name}</span>} />

                {stats.last_event && (
                  <p className="text-[11px] text-slate-400">Último registro: {new Date(stats.last_event).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Clique = foi pra Shopee/ML; a venda em si a gente não consegue ligar ao banner.</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
