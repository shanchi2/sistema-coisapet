import { useEffect, useState } from 'react'
import {
  Megaphone, Tag, Save, Sparkles, RefreshCw, MousePointerClick, Eye, TrendingUp,
  ExternalLink, AlertTriangle, Settings2, BarChart3, Store, Package, FileText, Ticket, Power,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useBlogBanners } from './hooks/useBlogBanners'
import { DailyBars, Panel, StatTile } from '../dashboard/widgets'

// ─────────────────────────────────────────────────────────────────────
// Banners do Blog (refeita 07/10 — o Raphael achou a tela confusa).
// Duas abas: "Banners e cupom" (configuração + prévia lado a lado) e
// "Relatórios" (indicadores, gráficos por dia, rankings em barra e o
// detalhe post → produto → plataforma). Dados de exibição/clique vêm do
// próprio site (blog_banner_events, fase96).
// ─────────────────────────────────────────────────────────────────────

const fmtN = v => (Number(v) || 0).toLocaleString('pt-BR')
const fmtPct = v => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)
const PLAT_DOT = { Shopee: '#EE4D2D', 'Mercado Livre': '#F5A300' }
const BANNER_FN_URL = 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/functions/v1/blog-banner'
const PERIODS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']]
const TAB_KEY = 'coisapet-blog-banners-tab'

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 w-full text-left px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors">
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

// Ranking em barras horizontais: rótulo · barra (cliques) · número + CTR
function BarRanking({ rows, label, dot, empty = 'Sem cliques no período.' }) {
  const top = rows.filter(r => r.clicks > 0)
  if (!top.length) return <p className="text-sm text-slate-400 py-6 text-center">{empty}</p>
  const max = Math.max(...top.map(r => r.clicks))
  return (
    <ul className="flex flex-col gap-3">
      {top.slice(0, 8).map((r, i) => (
        <li key={i}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-sm text-slate-700 truncate flex items-center gap-2 min-w-0">
              {dot && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dot(r) }} />}
              <span className="truncate" title={label(r)}>{label(r)}</span>
            </span>
            <span className="text-xs text-slate-400 shrink-0 tabular-nums">
              <b className="text-slate-800 text-sm">{fmtN(r.clicks)}</b> clique{r.clicks === 1 ? '' : 's'} · CTR {fmtPct(r.ctr)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.clicks / max) * 100}%`, background: dot ? dot(r) : '#E11D48' }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function BlogBannersPage() {
  const { loading, fetchSettings, fetchCategories, updateSettings, fetchStats } = useBlogBanners()
  const [tab, setTab] = useState(() => { try { return localStorage.getItem(TAB_KEY) || 'config' } catch { return 'config' } })
  const [settings, setSettings] = useState(null)
  const [saved, setSaved] = useState(null) // última versão salva — pra saber se tem alteração pendente
  const [categories, setCategories] = useState([])
  const [stats, setStats] = useState(null)
  const [period, setPeriod] = useState(30)
  const [statsLoading, setStatsLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    Promise.all([fetchSettings(), fetchCategories()]).then(([s, c]) => { setSettings(s); setSaved(s); setCategories(c) })
  }, [fetchSettings, fetchCategories])

  useEffect(() => {
    let alive = true
    setStatsLoading(true)
    fetchStats(period).then(s => { if (alive) setStats(s) }).finally(() => alive && setStatsLoading(false))
    return () => { alive = false }
  }, [period, fetchStats])

  function changeTab(t) { setTab(t); try { localStorage.setItem(TAB_KEY, t) } catch { /* sem storage */ } }
  const patch = fields => setSettings(s => ({ ...s, ...fields }))
  const dirty = settings && saved && JSON.stringify(settings) !== JSON.stringify(saved)

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
    setSaved(settings)
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

  if (!settings) return <div className="p-6 text-sm text-slate-400">Carregando…</div>

  const couponOn = settings.show_coupon !== false
  const shopee = stats?.by_platform.find(p => p.label === 'Shopee') || { clicks: 0, impressions: 0 }
  const ml = stats?.by_platform.find(p => p.label === 'Mercado Livre') || { clicks: 0, impressions: 0 }
  const platTotal = shopee.clicks + ml.clicks

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Cabeçalho + abas */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 flex items-center justify-center"><Megaphone className="text-rose-500" size={22} /></div>
          <div>
            <h1 className="text-xl font-display font-bold text-slate-800">Banners do Blog</h1>
            <p className="text-sm text-slate-400">Banner de produto no meio dos posts, levando pra Shopee e Mercado Livre.</p>
          </div>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {[['config', 'Banners e cupom', Settings2], ['relatorios', 'Relatórios', BarChart3]].map(([k, l, Icon]) => (
            <button key={k} onClick={() => changeTab(k)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={15} /> {l}
            </button>
          ))}
        </div>
      </div>

      {tab === 'config' ? (
        <>
          {/* Resumo do que está valendo agora */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={Power} tone={settings.active ? 'good' : 'neutral'} label="Sorteio geral" value={settings.active ? 'Ligado' : 'Desligado'}
              detail="Posts no modo 'Sorteio geral'" />
            <StatTile icon={Ticket} tone={couponOn ? 'rose' : 'neutral'} label="Cupom nos banners" value={couponOn ? (settings.coupon_code || '—') : 'Sem cupom'}
              detail={couponOn ? `${settings.discount_label || ''} de desconto` : 'Só o banner do produto'} />
            <StatTile icon={Package} tone="violet" label="Categorias no sorteio" value={fmtN((settings.category_ids || []).length + (settings.include_rodinhas ? 1 : 0))}
              detail={settings.include_rodinhas ? 'incluindo Rodinhas' : 'sem Rodinhas'} />
            <StatTile icon={Store} tone="sky" label="Plataformas" value={[settings.show_on_shopee && 'Shopee', settings.show_on_ml && 'ML'].filter(Boolean).join(' + ') || 'Nenhuma'}
              detail="pra onde o banner leva" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 flex flex-col gap-4">
              <Panel title="Sorteio geral" subtitle="Vale pros posts que estão no modo 'Sorteio geral'">
                <Toggle checked={!!settings.active} onChange={v => patch({ active: v })}
                  label={settings.active ? 'Ligado — os posts mostram um produto sorteado' : 'Desligado — posts no sorteio geral ficam sem banner'} />
                <p className="text-[11px] text-slate-400 mt-2">Cada post escolhe o próprio banner no editor do post (sorteio geral, produtos escolhidos ou sem banner). Posts com <b>produtos escolhidos</b> mostram o banner mesmo com o sorteio desligado.</p>
              </Panel>

              <Panel title="Cupom" subtitle="Padrão do blog — cada post pode trocar no editor">
                <div className="flex flex-col gap-3">
                  <Toggle checked={couponOn} onChange={v => patch({ show_coupon: v })}
                    label={couponOn ? 'Divulgar cupom nos banners' : 'Só banners (sem cupom)'} />
                  <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${couponOn ? '' : 'opacity-50'}`}>
                    <div>
                      <label className="text-xs font-semibold text-slate-500">Código do cupom</label>
                      <input className="input mt-1" value={settings.coupon_code || ''} onChange={e => patch({ coupon_code: e.target.value })} disabled={!couponOn} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500">Desconto (ex: "5%", "R$10")</label>
                      <input className="input mt-1" value={settings.discount_label || ''} onChange={e => patch({ discount_label: e.target.value })} disabled={!couponOn} />
                    </div>
                  </div>
                  {couponOn && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">Confirme que o cupom existe de verdade no Mercado Livre e na Shopee — o banner promete esse desconto pro cliente.</p>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel title="Produtos do sorteio" subtitle="Categorias que entram no sorteio geral">
                <div className="flex flex-wrap gap-2 mb-3">
                  {categories.map(c => {
                    const on = (settings.category_ids || []).includes(c.id)
                    return (
                      <button key={c.id} type="button" onClick={() => toggleCategory(c.id)}
                        className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${on ? 'bg-rose-500 border-rose-500 text-white font-semibold' : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300'}`}>
                        {c.name}
                      </button>
                    )
                  })}
                </div>
                <Toggle checked={!!settings.include_rodinhas} onChange={v => patch({ include_rodinhas: v })}
                  label="Incluir Rodinhas" hint="Ficam na categoria Acessório junto com outras coisas — identificadas pelo SKU ROD-." />
              </Panel>

              <Panel title="Plataformas" subtitle="Pra onde o banner pode levar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Toggle checked={!!settings.show_on_shopee} onChange={v => patch({ show_on_shopee: v })} label="Shopee" />
                  <Toggle checked={!!settings.show_on_ml} onChange={v => patch({ show_on_ml: v })} label="Mercado Livre" />
                </div>
              </Panel>
            </div>

            {/* Prévia + salvar (fixos ao rolar) */}
            <div className="flex flex-col gap-4 lg:sticky lg:top-4">
              <Panel title="Salvar" subtitle={dirty ? 'Você tem alterações não salvas' : 'Tudo salvo'}>
                <button onClick={save} disabled={loading || !dirty} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
                  <Save size={15} /> Salvar configuração
                </button>
              </Panel>
              <Panel title="Prévia" subtitle="Um exemplo de banner sorteado"
                right={<button onClick={sortearPreview} disabled={previewLoading} className="btn-secondary flex items-center gap-1.5 text-xs shrink-0">
                  <RefreshCw size={13} className={previewLoading ? 'animate-spin' : ''} /> Sortear
                </button>}>
                {preview ? (
                  <div className="flex flex-col gap-3 border border-amber-200 bg-amber-50 rounded-2xl p-4">
                    {preview.product.image_url && <img src={preview.product.image_url} alt="" className="w-full aspect-square rounded-xl object-cover" />}
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wide text-amber-700">{preview.headline}</p>
                      <p className="text-sm mt-1 text-slate-700">{preview.body}</p>
                      <a href={preview.link} target="_blank" rel="noopener" className="text-xs font-bold text-rose-600 flex items-center gap-1 mt-2">
                        Ver produto ({preview.platform}) <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-400">
                    <Sparkles size={18} className="mx-auto mb-2 text-slate-300" />
                    Clique em "Sortear" pra ver um banner de exemplo.
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </>
      ) : (
        <div className={`flex flex-col gap-4 transition-opacity ${statsLoading ? 'opacity-60' : ''}`}>
          {/* Período */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-slate-500">Exibições e cliques registrados pelo site nos banners dos posts.</p>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {PERIODS.map(([d, l]) => (
                <button key={d} onClick={() => setPeriod(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${period === d ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {!stats ? (
            <div className="card text-center text-sm text-slate-400 py-10">Carregando…</div>
          ) : stats.total_impressions === 0 && stats.total_clicks === 0 ? (
            <div className="card flex items-start gap-2 !bg-sky-50 !border-sky-100">
              <AlertTriangle size={16} className="text-sky-500 shrink-0 mt-0.5" />
              <p className="text-sm text-sky-700">Nada registrado nesse período. Exibições e cliques são gravados pelo site quando alguém vê ou clica num banner de post.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile icon={Eye} tone="sky" label="Banners vistos" value={fmtN(stats.total_impressions)} detail="apareceram na tela do leitor" />
                <StatTile icon={MousePointerClick} tone="rose" label="Cliques" value={fmtN(stats.total_clicks)} detail="foram pra Shopee ou ML" />
                <StatTile icon={TrendingUp} tone="good" label="Taxa de clique" value={fmtPct(stats.ctr)} detail="a cada 100 que veem, quantos clicam" />
                <StatTile icon={Store} tone="warning" label="Shopee × ML" value={platTotal ? `${Math.round((shopee.clicks / platTotal) * 100)}% · ${Math.round((ml.clicks / platTotal) * 100)}%` : '—'}
                  detail={`${fmtN(shopee.clicks)} Shopee · ${fmtN(ml.clicks)} ML`}>
                  {platTotal > 0 && (
                    <div className="h-1.5 rounded-full overflow-hidden flex gap-0.5">
                      <div style={{ width: `${(shopee.clicks / platTotal) * 100}%`, background: PLAT_DOT.Shopee }} />
                      <div style={{ width: `${(ml.clicks / platTotal) * 100}%`, background: PLAT_DOT['Mercado Livre'] }} />
                    </div>
                  )}
                </StatTile>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Cliques por dia" subtitle={`Últimos ${period} dias · hoje em tom mais claro`}>
                  <DailyBars data={stats.daily} dataKey="total" unit="cliques" format={v => `${fmtN(v)} clique${v === 1 ? '' : 's'}`} height={180} />
                </Panel>
                <Panel title="Banners vistos por dia" subtitle={`Últimos ${period} dias`}>
                  <DailyBars data={stats.daily} dataKey="views" unit="exibições" format={v => `${fmtN(v)} exibiç${v === 1 ? 'ão' : 'ões'}`} height={180} />
                </Panel>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Posts que mais levam clique" subtitle="Onde o banner funciona melhor">
                  <BarRanking rows={stats.by_post} label={r => r.title} />
                </Panel>
                <Panel title="Produtos mais clicados" subtitle="O que o leitor quis ver">
                  <BarRanking rows={stats.by_product} label={r => r.name} />
                </Panel>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Pra onde foram" subtitle="Cliques por plataforma">
                  <BarRanking rows={stats.by_platform} label={r => r.label} dot={r => PLAT_DOT[r.label] || '#94A3B8'} />
                </Panel>
                <Panel title="Com cupom × sem cupom" subtitle="Taxa de clique de cada tipo de banner">
                  {stats.by_coupon.length < 2 ? (
                    <div className="flex flex-col gap-2">
                      {stats.by_coupon.map(r => (
                        <p key={r.label} className="text-sm text-slate-600"><b>{r.label}</b>: {fmtN(r.clicks)} cliques em {fmtN(r.impressions)} exibições (CTR {fmtPct(r.ctr)})</p>
                      ))}
                      <p className="text-xs text-slate-400 flex items-center gap-1.5"><Tag size={12} />A comparação aparece quando houver banners com e sem cupom no período.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {stats.by_coupon.map(r => (
                        <div key={r.label} className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-semibold text-slate-500">{r.label}</p>
                          <p className="font-display font-extrabold text-2xl text-slate-800 mt-1">{fmtPct(r.ctr)}</p>
                          <p className="text-[11px] text-slate-400">{fmtN(r.clicks)} cliques · {fmtN(r.impressions)} exibições</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>

              {stats.ranking.length > 0 && (
                <Panel title="Detalhe dos cliques" subtitle="Post → produto → plataforma">
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-slate-400">
                        <tr className="border-b border-slate-100">
                          <th className="text-left font-semibold px-2 py-2"><FileText size={12} className="inline -mt-0.5 mr-1" />Post</th>
                          <th className="text-left font-semibold px-2 py-2">Produto</th>
                          <th className="text-left font-semibold px-2 py-2">Foi pra</th>
                          <th className="text-right font-semibold px-2 py-2">Cliques</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {stats.ranking.slice(0, 30).map((r, i) => (
                          <tr key={i}>
                            <td className="px-2 py-2 text-slate-700 max-w-[280px] truncate" title={r.post_slug}>{r.title}</td>
                            <td className="px-2 py-2 text-slate-600 max-w-[240px] truncate">{r.product}</td>
                            <td className="px-2 py-2 text-slate-600 whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: PLAT_DOT[r.platform] || '#94A3B8' }} />{r.platform}</td>
                            <td className="px-2 py-2 text-right font-bold text-slate-800 tabular-nums">{fmtN(r.clicks)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {stats.last_event && (
                    <p className="text-[11px] text-slate-400 mt-3">Último registro: {new Date(stats.last_event).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Clique = foi pra Shopee/ML; a venda em si não dá pra ligar ao banner.</p>
                  )}
                </Panel>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
