import { useState, useEffect, useRef } from 'react'
import { BookOpen, Plus, Trash2, Edit2, Upload, X, ArrowLeft, Save, FileDown, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

const B = { bg:'#3a1c0d', bg2:'#2e1609', bg3:'#4f2a14', cream:'#F6F0E5', tan:'#C9A87B', gold:'#C5904A' }
const SP = 2.6
const FORMATS = {
  '9x21': { label:'Filipeta 9x21cm', desc:'Padrao CoisaPet', wmm:90,  hmm:210, bleed:5 },
  'a5':   { label:'A5 (148x210mm)',  desc:'Meio A4',          wmm:148, hmm:210, bleed:5 },
}

// URL do logo CoisaPet no Supabase Storage
// Upload: Supabase → Storage → manuals → pasta "logos" → logo-coisapet.png
const LOGO_URL = 'https://lcybmdiqxmbqeuyeuhdj.supabase.co/storage/v1/object/public/manuals/logos/logo-coisapet-2026.png'

function pp(mm,s=1){ return Math.round(mm*SP*s) }
function getSession(){ try{ return JSON.parse(localStorage.getItem('coisapet_session')||'{}') }catch{ return {} } }
async function uploadImg(file){
  const ext=file.name.split('.').pop().toLowerCase()||'png'
  const path=`imgs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const{data,error}=await supabase.storage.from('manuals').upload(path,file,{upsert:true,contentType:file.type||`image/${ext}`})
  if(error)throw new Error(error.message)
  return supabase.storage.from('manuals').getPublicUrl(path).data.publicUrl
}

function QRImg({url,sz}){
  if(!url)return(<div style={{width:sz,height:sz,border:`1.5px dashed ${B.tan}`,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.04)',flexShrink:0,boxSizing:'border-box'}}><span style={{fontSize:Math.max(6,Math.round(sz*.13)),color:B.tan,textAlign:'center',lineHeight:1.3}}>{'QR\nCode'}</span></div>)
  return(<img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&bgcolor=F6F0E5&color=2e1609&margin=6`} alt="QR" style={{width:sz,height:sz,display:'block',borderRadius:3,flexShrink:0}}/>)
}

export function ManualFront({m,fmt,scale=1,showBleed=false}){
  const f=FORMATS[fmt]||FORMATS['9x21'],bl=showBleed?f.bleed:0,W=pp(f.wmm+bl*2,scale),H=pp(f.hmm+bl*2,scale),s=scale,blP=pp(bl,s)
  const _tlen=(m.name||'').length
  const _tbase=_tlen<=14?19:_tlen<=22?16:_tlen<=32?13:_tlen<=44?10:8
  const fs={title:Math.max(6,Math.round(_tbase*s)),sub:Math.max(5,Math.round(9*s)),sm:Math.max(4,Math.round(8*s)),qr:Math.round(60*s),pad:Math.round(13*s),r:Math.round(5*s)}
  // Altura fixa do box de título: 3 linhas max + padding
  const titleBoxH=Math.round((fs.title*1.2*3)+(7*s*2))
  return(
    <div style={{width:W,height:H,flexShrink:0,position:'relative',boxSizing:'border-box',backgroundColor:B.bg2}}>
      {showBleed&&<div style={{position:'absolute',inset:0,border:`${Math.max(1,Math.round(1*s))}px dashed rgba(255,0,0,0.5)`,pointerEvents:'none',zIndex:10}}/>}
      <div style={{position:'absolute',top:blP,left:blP,width:pp(f.wmm,s),height:pp(f.hmm,s),backgroundColor:B.bg,display:'flex',flexDirection:'column',alignItems:'center',overflow:'hidden',fontFamily:'Nunito,"Trebuchet MS",Arial,sans-serif'}}>
        <div style={{width:'100%',height:Math.round(5*s),backgroundColor:B.gold,flexShrink:0}}/>
        <div style={{marginTop:fs.pad,marginBottom:Math.round(5*s),paddingLeft:Math.round(16*s),paddingRight:Math.round(16*s),backgroundColor:B.cream,borderRadius:Math.round(4*s),textAlign:'center',maxWidth:'86%',flexShrink:0,overflow:'hidden',height:titleBoxH,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontSize:fs.title,fontWeight:900,color:B.bg2,letterSpacing:Math.round(1.5*s),textTransform:'uppercase',display:'block',textAlign:'center',width:'100%',lineHeight:1.15,wordBreak:'break-word'}}>{m.name||'NOME DO PRODUTO'}</span>
        </div>
        {m.front_tagline&&<div style={{fontSize:fs.sm,color:B.tan,marginBottom:Math.round(4*s),letterSpacing:.5,textTransform:'uppercase',textAlign:'center',fontWeight:600,flexShrink:0}}>{m.front_tagline}</div>}
        <div style={{flex:1,width:'88%',display:'flex',alignItems:'center',justifyContent:'center',minHeight:0,marginBottom:Math.round(7*s)}}>
          {m.front_image_url
            ?<img src={m.front_image_url} alt="" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',display:'block'}}/>
            :<div style={{width:'88%',height:Math.round(100*s),border:`2px dashed ${B.tan}`,borderRadius:fs.r,display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:fs.sm,color:B.tan,textAlign:'center'}}>Imagem do produto</span></div>
          }
        </div>
        <div style={{width:'88%',backgroundColor:B.cream,borderRadius:fs.r,padding:Math.round(9*s),marginBottom:Math.round(6*s),display:'flex',alignItems:'center',gap:Math.round(9*s),boxSizing:'border-box',flexShrink:0}}>
          <QRImg url={m.video_url} sz={fs.qr}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:Math.round(fs.sub*.9),fontWeight:900,color:B.bg2,textTransform:'uppercase',letterSpacing:.5,marginBottom:Math.round(2*s)}}>LEIA O QR CODE</div>
            <div style={{fontSize:fs.sm,color:B.bg3,fontWeight:600,lineHeight:1.4}}>E acesse o video de montagem</div>
          </div>
        </div>
        <div style={{width:'88%',border:`1.5px solid ${B.gold}`,borderRadius:Math.round(5*s),paddingTop:Math.round(5*s),paddingBottom:Math.round(5*s),paddingLeft:Math.round(8*s),paddingRight:Math.round(8*s),display:'flex',alignItems:'center',justifyContent:'center',gap:Math.round(4*s),marginBottom:Math.round(8*s),flexShrink:0,boxSizing:'border-box'}}>
          <span style={{backgroundColor:B.gold,color:B.bg2,fontWeight:900,fontSize:Math.round(fs.sm*.9),paddingLeft:Math.round(5*s),paddingRight:Math.round(5*s),paddingTop:Math.round(3*s),paddingBottom:Math.round(3*s),borderRadius:Math.round(3*s),display:'inline-block',textAlign:'center',lineHeight:1}}>VIRE</span>
          <span style={{fontSize:Math.round(fs.sm*.9),color:B.gold,fontWeight:700}}>PARA O PASSO A PASSO!</span>
          <span style={{fontSize:Math.round(11*s),color:B.gold}}>&#x2192;</span>
        </div>
        <div style={{marginBottom:Math.round(9*s),flexShrink:0,textAlign:'center'}}>
          <span style={{fontSize:Math.round(fs.sub*1.3),fontWeight:900,color:'#F6F0E5'}}>coisa</span>
          <span style={{fontSize:Math.round(fs.sub*1.3),fontWeight:900,color:'#F6F0E5'}}>pet</span><span style={{fontSize:Math.round(fs.sm*.7),color:'#F6F0E5'}}>&#xAE;</span>
        </div>
      </div>
    </div>
  )
}

export function ManualBack({m,fmt,scale=1,showBleed=false}){
  const f=FORMATS[fmt]||FORMATS['9x21'],bl=showBleed?f.bleed:0,W=pp(f.wmm+bl*2,scale),H=pp(f.hmm+bl*2,scale),s=scale,blP=pp(bl,s)
  const parts=m.parts||[]
  const _btlen=(m.name||'').length
  const _btbase=_btlen<=18?17:_btlen<=28?14:_btlen<=40?12:10
  const _asmLines=(m.assembly_steps||'').split('\n').length
  const _asmBase=_asmLines<=7?7:_asmLines<=11?6:5
  const fs={title:Math.max(7,Math.round(_btbase*s)),sub:Math.max(5,Math.round(9*s)),sm:Math.max(5,Math.round(8*s)),tiny:Math.max(3,Math.round(_asmBase*s)),pad:Math.round(12*s),r:Math.round(5*s)}
  return(
    <div style={{width:W,height:H,flexShrink:0,position:'relative',boxSizing:'border-box',backgroundColor:B.bg2}}>
      {showBleed&&<div style={{position:'absolute',inset:0,border:`${Math.max(1,Math.round(1*s))}px dashed rgba(255,0,0,0.5)`,pointerEvents:'none',zIndex:10}}/>}
      <div style={{position:'absolute',top:blP,left:blP,width:pp(f.wmm,s),height:pp(f.hmm,s),backgroundColor:B.bg,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:'Nunito,"Trebuchet MS",Arial,sans-serif',justifyContent:'flex-start'}}>

        {/* HEADER — linha única compacta */}
        <div style={{backgroundColor:B.bg2,padding:`${Math.round(4*s)}px ${fs.pad}px`,flexShrink:0,borderBottom:`${Math.round(2*s)}px solid ${B.gold}`,display:'flex',alignItems:'center'}}>
          <span style={{fontSize:fs.tiny,color:B.gold,fontWeight:700,textTransform:'uppercase',letterSpacing:.8,whiteSpace:'nowrap'}}>Manual de Montagem —&nbsp;</span>
          <span style={{fontSize:fs.tiny,fontWeight:900,color:B.cream,textTransform:'uppercase',letterSpacing:.8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name||'PRODUTO'}</span>
        </div>

        {/* IMAGEM — flex:1, ocupa todo espaço disponível */}
        <div style={{flex:1,minHeight:0,width:'100%',display:'flex',alignItems:'center',justifyContent:'center',padding:`${Math.round(4*s)}px ${fs.pad}px`,boxSizing:'border-box'}}>
          {m.back_image_url
            ?<img src={m.back_image_url} alt="" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',display:'block'}}/>
            :<div style={{width:'88%',height:'88%',border:`1.5px dashed ${B.tan}`,borderRadius:fs.r,display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:fs.sm,color:B.tan,textAlign:'center'}}>Imagem explodida</span></div>
          }
        </div>

        {/* CONTEÚDO — sempre colado no footer (marginTop:auto empurra para baixo) */}
        <div style={{flexShrink:0,overflow:'hidden',padding:`${Math.round(2*s)}px ${fs.pad}px ${Math.round(2*s)}px`,display:'flex',flexDirection:'column',gap:Math.round(2*s),boxSizing:'border-box',marginTop:'auto'}}>

          {/* PEÇAS — 3 colunas e badge menor quando muitas peças */}
          {parts.length>0&&(()=>{
            const many=parts.length>4 // 3 colunas a partir de 5 peças
            const cols=many?'1fr 1fr 1fr':'1fr 1fr'
            const badgeSz=Math.round((many?10:13)*s)
            const labelFs=many?Math.max(4,Math.round(6.5*s)):fs.sm
            const gap=many?`${Math.round(2*s)}px ${Math.round(5*s)}px`:`${Math.round(3*s)}px ${Math.round(8*s)}px`
            return(
              <div style={{flexShrink:0}}>
                <div style={{fontSize:fs.sm,fontWeight:900,color:B.cream,textTransform:'uppercase',letterSpacing:1,marginBottom:Math.round(3*s),paddingBottom:Math.round(2*s),borderBottom:`1px solid ${B.gold}`}}>PEÇAS:</div>
                <div style={{display:'grid',gridTemplateColumns:cols,gap}}>
                  {parts.map((p,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:Math.round((many?3:5)*s)}}>
                      <div style={{width:badgeSz,height:badgeSz,borderRadius:'50%',backgroundColor:B.cream,overflow:'hidden',flexShrink:0,display:'table'}}>
                        <div style={{display:'table-cell',verticalAlign:'middle',textAlign:'center',fontSize:Math.round(badgeSz*.65),fontWeight:900,color:B.bg2,lineHeight:1}}>{p.num||i+1}</div>
                      </div>
                      <span style={{fontSize:labelFs,color:B.cream,fontWeight:600,lineHeight:1.2}}>{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* MONTAGEM */}
          {m.assembly_steps&&(
            <div style={{flexShrink:0,overflow:'hidden'}}>
              <div style={{fontSize:fs.sm,fontWeight:900,color:B.cream,textTransform:'uppercase',letterSpacing:1,marginBottom:Math.round(3*s),paddingBottom:Math.round(2*s),borderBottom:`1px solid ${B.gold}`}}>MONTAGEM:</div>
              <div style={{overflow:'hidden',fontSize:fs.tiny,color:B.tan,lineHeight:1.6,fontWeight:500}}
                dangerouslySetInnerHTML={{__html:m.assembly_steps}}/>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{backgroundColor:B.bg2,padding:`${Math.round(3*s)}px ${fs.pad}px`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,borderTop:`${Math.round(1.5*s)}px solid rgba(197,144,74,0.25)`,marginTop:'auto'}}>
          <div>
            <span style={{fontSize:Math.round(fs.sub*1.1),fontWeight:900,color:'#F6F0E5'}}>coisa</span>
            <span style={{fontSize:Math.round(fs.sub*1.1),fontWeight:900,color:'#F6F0E5'}}>pet</span>
          </div>
          <div style={{fontSize:fs.tiny,color:B.tan,fontWeight:600}}>{m.footer_site||'www.coisapet.com.br'}</div>
        </div>

      </div>
    </div>
  )
}

// ── WYSIWYG Editor ─────────────────────────────────────────────
function RichEditor({ value, onChange }) {
  const ref = useRef()
  const isUpdating = useRef(false)

  useEffect(() => {
    if (!ref.current) return
    if (isUpdating.current) return
    if (ref.current.innerHTML !== (value||'')) {
      ref.current.innerHTML = value || ''
    }
  }, [value])

  function handleInput() {
    isUpdating.current = true
    onChange(ref.current.innerHTML)
    setTimeout(() => { isUpdating.current = false }, 0)
  }

  function exec(cmd, val=null) {
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
    } catch(e) {
      document.execCommand('fontSize', false, '3')
    }
    handleInput()
  }

  const COLORS = ['#F6F0E5','#C9A87B','#C5904A','#ffffff','#ff6b6b','#51cf66','#74c0fc']

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 flex-wrap p-2 bg-slate-800 border border-slate-600 rounded-xl">
        <button type="button" onMouseDown={e=>{e.preventDefault();exec('bold')}}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-600 text-slate-200 font-black text-sm">B</button>
        <button type="button" onMouseDown={e=>{e.preventDefault();exec('italic')}}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-600 text-slate-300 italic text-sm">I</button>
        <div className="w-px h-5 bg-slate-600 mx-0.5"/>
        {[['P','5.5px'],['M','7px'],['G','9px']].map(([lbl,sz])=>(
          <button key={lbl} type="button" onMouseDown={e=>{e.preventDefault();applyFontSize(sz)}}
            className="px-2 h-7 rounded-lg hover:bg-slate-600 text-slate-300 text-xs font-bold">{lbl}</button>
        ))}
        <div className="w-px h-5 bg-slate-600 mx-0.5"/>
        {COLORS.map(col=>(
          <button key={col} type="button" onMouseDown={e=>{e.preventDefault();exec('foreColor',col)}}
            className="w-4 h-4 rounded-full border border-slate-500 hover:scale-110 transition-transform flex-shrink-0"
            style={{background:col}}/>
        ))}
        <div className="w-px h-5 bg-slate-600 mx-0.5"/>
        <button type="button" onMouseDown={e=>{e.preventDefault();exec('removeFormat')}}
          className="px-2 h-7 rounded-lg text-[10px] font-bold text-slate-400 hover:bg-slate-600">Limpar</button>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={handleInput} onBlur={handleInput}
        style={{
          background:'#2e1609',color:'#C9A87B',fontFamily:'Nunito,sans-serif',
          fontSize:'11px',lineHeight:1.6,padding:'10px 12px',
          borderRadius:12,border:'1.5px solid rgba(197,144,74,0.3)',
          minHeight:100,outline:'none',overflowY:'auto',maxHeight:220,
          whiteSpace:'pre-wrap',
        }}/>
      <p className="text-xs text-slate-400">Selecione o texto e use a toolbar para formatar. <b>B</b>=negrito, <i>I</i>=itálico, P/M/G=tamanho</p>
    </div>
  )
}

function ImgUpload({label,value,onChange,hint}){
  const[loading,setLoading]=useState(false),ref=useRef()
  async function handle(file){
    if(!file)return;setLoading(true)
    try{onChange(await uploadImg(file));toast.success('Imagem enviada!')}
    catch(e){toast.error(`Erro: ${e.message}`)}
    finally{setLoading(false)}
  }
  return(
    <div>
      <label className="form-label">{label}</label>
      <div className={`border-2 border-dashed rounded-2xl cursor-pointer transition-colors overflow-hidden ${value?'border-emerald-300 bg-emerald-50/20':'border-slate-200 hover:border-rose-300 hover:bg-rose-50/10'}`}
        style={{minHeight:96}} onClick={()=>ref.current?.click()}
        onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handle(e.dataTransfer.files[0])}}>
        {loading?<div className="flex items-center justify-center p-6"><div className="w-6 h-6 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin"/></div>
        :value?<div className="relative group"><img src={value} alt="" className="w-full h-28 object-contain p-2"/><div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><span className="text-white text-xs font-bold">Trocar</span></div></div>
        :<div className="flex flex-col items-center justify-center gap-2 p-5"><Upload size={20} className="text-slate-300"/><span className="text-xs text-slate-400 font-semibold text-center">{hint||'PNG, JPG'}</span></div>}
      </div>
      {value&&<button onClick={()=>onChange('')} className="text-xs text-rose-400 hover:text-rose-600 mt-1 font-semibold">Remover</button>}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={e=>handle(e.target.files[0])}/>
    </div>
  )
}

// ── Converte URL de imagem para base64 ──────────────────────────
// ── Helpers PDF ──────────────────────────────────────────────────
async function toBase64(url){
  try{
    const ctrl=new AbortController()
    const tid=setTimeout(()=>ctrl.abort(),8000)  // timeout 8s
    const r=await fetch(url,{mode:'cors',signal:ctrl.signal})
    clearTimeout(tid)
    if(!r.ok) return null
    const blob=await r.blob()
    return new Promise(res=>{
      const rd=new FileReader()
      rd.onload=()=>res(rd.result)
      rd.onerror=()=>res(null)
      rd.readAsDataURL(blob)
    })
  }catch{return null}
}

// Retorna dimensões naturais de uma imagem base64
function getImgDims(dataUrl){
  return new Promise(res=>{
    const tid=setTimeout(()=>res({w:200,h:200}),3000)  // fallback 3s
    const img=new Image()
    img.onload=()=>{
      clearTimeout(tid)
      res({w:img.naturalWidth||200,h:img.naturalHeight||200})
    }
    img.onerror=()=>{clearTimeout(tid);res({w:200,h:200})}
    img.src=dataUrl
  })
}

// Calcula width/height e offset para caber no box mantendo aspecto
// Nunca retorna w=0 ou h=0 (jsPDF rejeita)
function fitBox(iw,ih,bw,bh){
  const MIN=0.5  // tamanho mínimo seguro em mm
  if(!iw||!ih||iw<=0||ih<=0||!bw||!bh||bw<=0||bh<=0){
    return{w:Math.max(MIN,bw||MIN),h:Math.max(MIN,bh||MIN),ox:0,oy:0}
  }
  const ir=iw/ih, br=bw/bh
  if(ir>br){
    const w=bw, h=bw/ir
    return{w:Math.max(MIN,w), h:Math.max(MIN,h), ox:0, oy:(bh-Math.max(MIN,h))/2}
  } else {
    const h=bh, w=bh*ir
    return{w:Math.max(MIN,w), h:Math.max(MIN,h), ox:(bw-Math.max(MIN,w))/2, oy:0}
  }
}

// Wrapper seguro para addImage — nunca deixa crashar por coordenada inválida
function safeImg(pdf,img,fmt,x,y,w,h){
  if(!img)return
  const vals={x,y,w,h}
  for(const[k,v]of Object.entries(vals)){
    if(v===null||v===undefined||typeof v!=='number'||isNaN(v)||!isFinite(v)||( (k==='w'||k==='h')&&v<=0 )){
      console.warn('[PDF] safeImg coordenada inválida:',k,'=',v,{x,y,w,h});return
    }
  }
  pdf.addImage(img,fmt,x,y,w,h,'','FAST')
}

// Converte HTML rico em texto puro para o jsPDF
function htmlToText(html) {
  if (!html) return ''
  let t = html
  t = t.replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '')
  t = t.replace(/<[^>]+>/g, '')
  t = t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'")
  return t.trim()
}

// ── Gera PDF 100% com jsPDF ───────────────────────────────────────
async function exportPDF(m,fmt){
  let jsPDF
  try{ const mod=await import('jspdf');jsPDF=mod.jsPDF||mod.default }
  catch{ throw new Error('Execute: npm install jspdf') }

  const f=FORMATS[fmt]||FORMATS['9x21']
  const bl=f.bleed, W=f.wmm+bl*2, H=f.hmm+bl*2
  const parts=m.parts||[]
  const hasQR=!!m.video_url

  toast.loading('Gerando PDF...',{id:'pdf',duration:60000})
  console.log('[PDF] 1/6 iniciando carregamento de imagens...')
  try{

  // Carrega imagens
  const [frontImg,backImg,qrImg,logoImg]=await Promise.all([
    m.front_image_url?toBase64(m.front_image_url):Promise.resolve(null),
    m.back_image_url ?toBase64(m.back_image_url) :Promise.resolve(null),
    hasQR?toBase64(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(m.video_url)}&bgcolor=F6F0E5&color=2e1609&margin=6`):Promise.resolve(null),
    toBase64(LOGO_URL),
  ])
  console.log('[PDF] 2/6 imagens carregadas:',{front:!!frontImg,back:!!backImg,qr:!!qrImg,logo:!!logoImg})

  // Pega dimensões reais das imagens para aspect ratio correto
  const [frontDims,backDims]=await Promise.all([
    frontImg?getImgDims(frontImg):Promise.resolve(null),
    backImg ?getImgDims(backImg) :Promise.resolve(null),
  ])
  console.log('[PDF] 3/6 dimensões:',{front:frontDims,back:backDims})

  console.log('[PDF] 4/6 criando documento jsPDF...')
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:[W,H]})

  // Cor helpers
  const hx=hex=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return[r,g,b]}
  function fc(hex){pdf.setFillColor(...hx(hex))}
  function tc(hex){pdf.setTextColor(...hx(hex))}
  function dc(hex){pdf.setDrawColor(...hx(hex))}
  function rect(x,y,w,h,mode='F'){pdf.rect(x,y,w,h,mode)}
  function rr(x,y,w,h,r,mode='F'){pdf.roundedRect(x,y,w,h,r,r,mode)}

  // Sistema de fontes escalável — mínimo 10pt no A5
  // Filipeta (90mm): base 1x | A5 (148mm): base ~1.65x → mínimo 10pt
  const isA5=f.wmm>=100
  const fz={
    name:    isA5?20:14,   // título do produto
    tagline: isA5?10:6.5,  // tagline frente
    qrTitle: isA5?11:7.5,  // "LEIA O QR CODE"
    qrSub:   isA5?10:6.5,  // "E acesse o vídeo..."
    vire:    isA5?10:7,    // badge VIRE + texto
    hdrSub:  isA5?10:6,    // "Manual de Montagem" subtítulo
    hdrName: isA5?18:12,   // nome no header do verso
    secHead: isA5?9.5:7.5,  // "PEÇAS:", "MONTAGEM:"
    circNum: isA5?8.5:6.5,  // número dentro do círculo
    label:   isA5?8.5:7.5,  // label da peça
    asm:     isA5?8.5:7,    // texto de montagem (base — pode reduzir até -3)
    footer:  isA5?8:6.5,    // site no footer
  }
  // Dimensões que também escalam no A5
  const dim={
    circR:   isA5?3.2:2.8,   // raio dos círculos de peças
    circCol: isA5?7.5:7,     // distância círculo→texto
    partRow: isA5?7.5:6.5,   // altura por linha de peça (compacto)
    asmLine: isA5?4.8:4,     // altura por linha de montagem
    qrSz:    isA5?24:17,     // tamanho do QR code
    qrH:     isA5?28:21,     // altura do bloco QR
    vireH:   isA5?12:10,     // altura do botão VIRE
  }

  // ════════════════════════════
  // FRENTE
  // ════════════════════════════
  fc('#2e1609');rect(0,0,W,H)     // sangra
  fc('#3a1c0d');rect(bl,bl,f.wmm,f.hmm) // fundo

  // Faixa dourada topo
  fc('#C5904A');rect(bl,bl,f.wmm,1.5)

  // Caixa nome — fonte adaptativa igual ao componente React
  const nbW=f.wmm*.82, nbX=bl+(f.wmm-nbW)/2
  const nbY=bl+4.5
  const _nlen=(m.name||'').length
  const _nfz=_nlen<=14?fz.name:_nlen<=22?Math.round(fz.name*.85):_nlen<=32?Math.round(fz.name*.70):_nlen<=44?Math.round(fz.name*.56):Math.round(fz.name*.46)
  pdf.setFont('helvetica','bold')
  pdf.setFontSize(_nfz)
  const nameLines=pdf.splitTextToSize(m.name||'PRODUTO',nbW-8)
  const lineH=_nfz*.352778  // pt→mm
  const lhFactor=1.18
  const totalTextH=nameLines.length*lineH*lhFactor
  const vPad=3.5
  const nbH=totalTextH+vPad*2
  fc('#F6F0E5');rr(nbX,nbY,nbW,nbH,2)
  tc('#2e1609')
  // Primeira linha: topo do texto = nbY + vPad + lineH (baseline da 1a linha)
  const textY=nbY+vPad+lineH
  pdf.text(nameLines,bl+f.wmm/2,textY,{align:'center',lineHeightFactor:lhFactor})

  // Tagline
  let curY=nbY+nbH+3
  if(m.front_tagline){
    tc('#C9A87B');pdf.setFont('helvetica','normal');pdf.setFontSize(fz.tagline)
    pdf.text(m.front_tagline.toUpperCase(),bl+f.wmm/2,curY,{align:'center'})
    curY+=4.5
  }

  // Calcular área da imagem (espaço disponível menos conteúdo do fundo)
  const bottomFixed=hasQR?64:38  // QR(22)+gap(4)+VIRE(10)+gap(4)+Logo(14)+margem(6)
  const imgBoxH=f.hmm-(curY-bl)-bottomFixed
  const imgBoxW=f.wmm*.84
  const imgBoxX=bl+(f.wmm-imgBoxW)/2

  if(frontImg&&frontDims){
    const fit=fitBox(frontDims.w,frontDims.h,imgBoxW,imgBoxH)
    safeImg(pdf,frontImg,'PNG',imgBoxX+fit.ox,curY+fit.oy,fit.w,fit.h)
  }
  curY=bl+f.hmm-bottomFixed+2

  // Bloco QR — só se tiver vídeo
  if(hasQR){
    const qbW=f.wmm*.88, qbX=bl+(f.wmm-qbW)/2
    const qsz=17
    fc('#F6F0E5');rr(qbX,curY,qbW,21,2)
    if(qrImg) safeImg(pdf,qrImg,'PNG',qbX+2.5,curY+2,qsz,qsz)
    tc('#2e1609');pdf.setFont('helvetica','bold');pdf.setFontSize(fz.qrTitle)
    pdf.text('LEIA O QR CODE',qbX+qsz+5,curY+8.5)
    tc('#4f2a14');pdf.setFont('helvetica','normal');pdf.setFontSize(fz.qrSub)
    pdf.text('E acesse o vídeo de montagem',qbX+qsz+5,curY+14.5)
    curY+=24
  }

  // Botão VIRE
  const vbW=f.wmm*.88, vbX=bl+(f.wmm-vbW)/2
  dc('#C5904A');pdf.setLineWidth(.3);rr(vbX,curY,vbW,10,1.5,'D')
  fc('#C5904A');rr(vbX+2,curY+2,13,6,1)
  tc('#2e1609');pdf.setFont('helvetica','bold');pdf.setFontSize(fz.vire)
  pdf.text('VIRE',vbX+8.5,curY+6.2,{align:'center'})
  tc('#C5904A');pdf.setFont('helvetica','normal');pdf.setFontSize(fz.vire)
  pdf.text('  PARA O PASSO A PASSO!',vbX+17,curY+6.2)
  // Seta (texto — mais compatível com todas versões do jsPDF)
  tc('#C5904A');pdf.setFont('helvetica','bold');pdf.setFontSize(fz.vire)
  pdf.text('>>',vbX+vbW-7,curY+6.2)
  curY+=14

  // Logo — posição fixa no fundo, não depende do curY
  const lgW=f.wmm<100?24:32, lgH=lgW*.65
  const lgX=bl+(f.wmm-lgW)/2
  const lgY=bl+f.hmm-lgH-4  // 4mm da borda inferior
  if(logoImg) safeImg(pdf,logoImg,'PNG',lgX,lgY,lgW,lgH)
  else{ tc('#F6F0E5');pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.text('coisapet',bl+f.wmm/2,lgY+lgH*.7,{align:'center'}) }

  // ════════════════════════════
  // VERSO
  // ════════════════════════════
  pdf.addPage([W,H])
  fc('#2e1609');rect(0,0,W,H)
  fc('#3a1c0d');rect(bl,bl,f.wmm,f.hmm)

  // Header — uma linha só: "MANUAL DE MONTAGEM — NOME DO PRODUTO"
  const hdrText = ('MANUAL DE MONTAGEM — ' + (m.name||'PRODUTO')).toUpperCase()
  pdf.setFont('helvetica','bold')
  // Reduz fonte até caber numa linha
  let hdrFs = fz.hdrName
  while(hdrFs > 5){
    pdf.setFontSize(hdrFs)
    if(pdf.getTextWidth(hdrText) <= f.wmm - 10) break
    hdrFs -= 0.5
  }
  const hdrLineH = hdrFs * 0.352778
  const hdH = hdrLineH + 7  // header bem compacto
  fc('#2e1609');rect(bl,bl,f.wmm,hdH)
  fc('#C5904A');rect(bl,bl+hdH,f.wmm,.4)
  tc('#C5904A');pdf.setFont('helvetica','bold');pdf.setFontSize(hdrFs)
  pdf.text(hdrText, bl+5, bl+hdH/2+hdrLineH*.35)

  // Footer — logo menor pela metade → mais espaço para imagem
  const lgW2=isA5?11:9, lgH2=lgW2*.65   // logo reduzido
  const ftH=lgH2+4                        // footer ultra compacto

  // Conteúdo: usa splitTextToSize para contar linhas REAIS (com quebra automática)
  const pad=5
  const cw_calc=f.wmm-pad*2  // largura do texto — igual ao cw usado no render
  const nPartsRows=Math.ceil(parts.length/2)

  // Converte HTML → texto puro para o jsPDF
  const asmText = htmlToText(m.assembly_steps||'')
  // Linhas reais do texto de montagem após word-wrap
  pdf.setFont('helvetica','normal'); pdf.setFontSize(fz.asm)
  const realAsmLines = asmText
    ? pdf.splitTextToSize(asmText, cw_calc).length
    : 0

  // Alturas exatas de cada bloco (espelha os cy++ do render abaixo)
  const partsHeaderH = parts.length>0 ? (fz.secHead*.4+6) : 0
  const partsRowsH   = nPartsRows * dim.partRow
  const partsGapH    = parts.length>0 ? pad : 0
  const partsBlockH  = partsHeaderH + partsRowsH + partsGapH

  const asmHeaderH   = m.assembly_steps ? (fz.secHead*.4+6) : 0
  const asmLinesH    = realAsmLines * dim.asmLine
  const asmBlockH    = asmHeaderH + asmLinesH

  // Margem de segurança de 6mm para nunca cortar
  const contentTotalH = partsBlockH + asmBlockH + 6

  // ── Verso: foto adaptativa + texto nunca cortado ────────────────
  // 1. Calcula altura mínima necessária para o conteúdo (peças + montagem)
  const bBoxW = f.wmm - pad*2
  const bBoxX = bl + pad
  const bBoxY = bl + hdH + pad

  // Espaço total disponível no verso (do fim do header até o footer)
  const totalAvail = f.hmm - hdH - pad - ftH - pad

  // Altura necessária para peças (considera 3 colunas quando >4 peças)
  const manyParts2  = parts.length > 4
  const nCols2      = manyParts2 ? 3 : 2
  const partRow2    = manyParts2 ? dim.partRow * 0.80 : dim.partRow
  const nPartsRows2 = Math.ceil(parts.length / nCols2)
  const partsNeedH  = parts.length>0
    ? (fz.secHead*.4+6) + nPartsRows2*partRow2 + pad
    : 0

  // Tenta encaixar o texto de montagem com a fonte padrão
  // Se não couber, reduz progressivamente até fz.asm-3 (mínimo)
  let asmFontSize = fz.asm
  let asmWrapped  = []
  let asmNeedH    = 0
  const asmMinFont = Math.max(6, fz.asm - 4)  // permite reduzir mais para caber texto longo

  if(asmText){
    // Tenta reduzir fonte até o texto caber
    for(let fs2 = fz.asm; fs2 >= asmMinFont; fs2 -= 0.5){
      pdf.setFont('helvetica','normal'); pdf.setFontSize(fs2)
      const lines = pdf.splitTextToSize(asmText, cw_calc)
      const lineH  = fs2 * 0.352778 * 1.5  // line height real em mm
      const needed = (fz.secHead*.4+6) + lines.length * lineH
      const photoH_test = Math.max(0, totalAvail - partsNeedH - needed - pad)

      // Foto mínima de 10mm — se cabe, usa essa fonte
      if(photoH_test >= 25 || fs2 <= asmMinFont){  // foto mínima de 25mm
        asmFontSize = fs2
        asmWrapped  = lines
        asmNeedH    = needed
        break
      }
    }
  }

  // 2. Calcula posições de baixo para cima — conteúdo colado no footer
  const contentNeedH = partsNeedH + asmNeedH
  const ftY2         = bl + f.hmm - ftH           // topo do footer
  const contentStart = ftY2 - contentNeedH - 2   // 2mm de respiro acima do conteúdo
  const backPhotoH   = Math.max(25, contentStart - bBoxY - 2)  // foto cola quase no conteúdo

  if(backImg&&backDims){
    const fit=fitBox(backDims.w,backDims.h,bBoxW,backPhotoH)
    safeImg(pdf,backImg,'PNG',bBoxX+fit.ox,bBoxY+fit.oy,fit.w,fit.h)
  }

  let cy=contentStart       // conteúdo começa logo acima do footer
  const cx=bl+pad, cw=cw_calc

  // PEÇAS — 3 colunas e tamanho menor quando >4 peças
  if(parts.length>0){
    const manyParts = parts.length > 4
    const numCols   = manyParts ? 3 : 2
    const colW      = cw / numCols
    const circR     = manyParts ? dim.circR * 0.75 : dim.circR
    const partRow   = manyParts ? dim.partRow * 0.80 : dim.partRow
    const labelFs   = manyParts ? Math.max(4, fz.label - 1.5) : fz.label
    const circNumFs = manyParts ? Math.max(3.5, fz.circNum - 1) : fz.circNum

    tc('#F6F0E5');pdf.setFont('helvetica','bold');pdf.setFontSize(fz.secHead)
    pdf.text('PE\u00C7AS:',cx,cy)
    fc('#C5904A');rect(cx,cy+1,cw,.3)
    cy+=fz.secHead*.4+5
    parts.forEach((p,i)=>{
      const col=i%numCols, row=Math.floor(i/numCols)
      const px=cx+col*colW, py=cy+row*partRow
      fc('#F6F0E5');pdf.circle(px+circR,py-circR*.4,circR,'F')
      tc('#2e1609');pdf.setFont('helvetica','bold');pdf.setFontSize(circNumFs)
      pdf.text(String(p.num||i+1),px+circR,py+circR*.2,{align:'center'})
      tc('#F6F0E5');pdf.setFont('helvetica','normal');pdf.setFontSize(labelFs)
      pdf.text(p.label||'',px+circR*2+1.5,py+circR*.2)
    })
    cy+=Math.ceil(parts.length/numCols)*partRow+pad
  }

  // MONTAGEM — renderiza com suporte a negrito e itálico via segmentos
  if(asmText && asmWrapped.length>0){
    tc('#F6F0E5');pdf.setFont('helvetica','bold');pdf.setFontSize(fz.secHead)
    pdf.text('MONTAGEM:',cx,cy)
    fc('#C5904A');rect(cx,cy+1,cw,.3)
    cy+=fz.secHead*.4+5
    const lineH = asmFontSize * 0.352778 * 1.55

    // Renderiza com formatação rica — parseia HTML segmento por segmento
    function renderRichText(html, startX, startY, maxW, lh, fontSize) {
      // Extrai segmentos {text, bold, italic, color} do HTML
      const segs = []
      const tmp = document.createElement('div')
      tmp.innerHTML = html
      function walk(node, bold, italic, color) {
        if (node.nodeType === 3) {
          const t = node.textContent
          if (t) segs.push({ text: t, bold, italic, color })
        } else {
          const tag = (node.tagName||'').toLowerCase()
          const st  = node.style || {}
          const b   = bold   || tag==='b' || tag==='strong'
          const i2  = italic || tag==='i' || tag==='em'
          const col = st.color || color
          for (const ch of node.childNodes) walk(ch, b, i2, col)
          if (tag==='p'||tag==='div'||tag==='br') segs.push({text:'\n',bold:false,italic:false,color})
        }
      }
      walk(tmp, false, false, null)

      let x = startX, y = startY
      // Converte cor CSS p/ jsPDF
      function applyColor(col) {
        if (!col) { tc('#C9A87B'); return }
        // hex
        if (col.startsWith('#')) { tc(col); return }
        // rgb(r,g,b)
        const m = col.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
        if (m) { pdf.setTextColor(+m[1],+m[2],+m[3]); return }
        tc('#C9A87B')
      }

      segs.forEach(seg => {
        if (seg.text === '\n' || seg.text === '\r\n') { x = startX; y += lh; return }
        // Quebras dentro do próprio texto do nó
        if (seg.text.includes('\n')) {
          seg.text.split('\n').forEach((part, pi) => {
            if (pi > 0) { x = startX; y += lh }
            if (!part) return
            const words2 = part.split(/(\s+)/)
            for (const word of words2) {
              if (!word) continue
              if (word.match(/^\s+$/)) { if (x > startX) x += pdf.getTextWidth(word); continue }
              pdf.setFont('helvetica', seg.bold&&seg.italic?'bolditalic':seg.bold?'bold':seg.italic?'italic':'normal')
              pdf.setFontSize(asmFontSize)
              const w2 = pdf.getTextWidth(word)
              if (x + w2 > startX + maxW && x > startX) { x = startX; y += lh }
              pdf.text(word, x, y); x += w2
            }
          })
          return
        }
        const face = seg.bold && seg.italic ? 'bolditalic'
                   : seg.bold              ? 'bold'
                   : seg.italic            ? 'italic'
                   : 'normal'
        pdf.setFont('helvetica', face)
        pdf.setFontSize(fontSize)
        applyColor(seg.color)
        // Quebra por palavras
        const words = seg.text.split(/(\s+)/)
        for (const word of words) {
          if (!word) continue
          if (word.match(/^\s+$/)) {
            // espaço — só avança se não estiver no início da linha
            if (x > startX) x += pdf.getTextWidth(word)
            continue
          }
          const w = pdf.getTextWidth(word)
          if (x + w > startX + maxW && x > startX) {
            x = startX; y += lh
          }
          pdf.text(word, x, y)
          x += w
        }
      })
      return y // retorna Y final
    }

    renderRichText(m.assembly_steps||'', cx, cy, cw, lineH, asmFontSize)
  }

  // Footer verso — colado na borda inferior
  fc('#2e1609');rect(bl,ftY2,f.wmm,ftH)
  fc('#C5904A');rect(bl,ftY2,f.wmm,.4)
  const logoY2=ftY2+(ftH-lgH2)/2
  if(logoImg) safeImg(pdf,logoImg,'PNG',bl+pad,logoY2,lgW2,lgH2)
  else{ tc('#F6F0E5');pdf.setFont('helvetica','bold');pdf.setFontSize(fz.footer);pdf.text('coisapet',bl+pad+lgW2/2,ftY2+ftH/2+1,{align:'center'}) }
  pdf.setFont('helvetica','normal');pdf.setFontSize(fz.footer)
  tc('#C9A87B')
  pdf.text(m.footer_site||'www.coisapet.com.br',bl+f.wmm-pad,ftY2+ftH/2+fz.footer*.18,{align:'right'})

  pdf.save(`manual-${(m.name||'coisapet').toLowerCase().replace(/\s+/g,'-')}.pdf`)
  toast.success('PDF salvo!',{id:'pdf'})
  }catch(pdfErr){
    toast.error('Erro interno: ' + (pdfErr?.message||String(pdfErr)), {id:'pdf',duration:8000})
    console.error('[exportPDF]', pdfErr)
    throw pdfErr
  }
}


function ManualEditor({manual:init,onSave,onCancel}){
  const[m,setM]=useState({name:'',format:'9x21',front_tagline:'',video_url:'',front_image_url:'',back_image_url:'',parts:[],assembly_steps:'',footer_site:'www.coisapet.com.br',...init})
  const[side,setSide]=useState('front'),[saving,setSaving]=useState(false),[exporting,setExporting]=useState(false),[showBleed,setShowBleed]=useState(false),[previewH,setPreviewH]=useState(600),[zoom,setZoom]=useState(1)
  const set=(k,v)=>setM(p=>({...p,[k]:v}))
  const fmt=FORMATS[m.format]||FORMATS['9x21']
  const previewRef=useRef()
  // Scale dinâmico: preenche a altura disponível do container mantendo proporção
  const PS=Math.max(0.3, (previewH-32) / pp(fmt.hmm)) * zoom
  useEffect(()=>{
    if(!previewRef.current)return
    const ro=new ResizeObserver(entries=>{ for(const e of entries) setPreviewH(e.contentRect.height) })
    ro.observe(previewRef.current)
    return()=>ro.disconnect()
  },[])
  function addPart(){set('parts',[...(m.parts||[]),{num:(m.parts?.length||0)+1,label:''}])}
  function removePart(i){set('parts',m.parts.filter((_,x)=>x!==i))}
  function setPart(i,k,v){set('parts',m.parts.map((p,x)=>x===i?{...p,[k]:v}:p))}
  async function handleSave(){if(!m.name.trim()){toast.error('Informe o nome.');return};setSaving(true);try{await onSave(m)}catch{}finally{setSaving(false)}}
  async function handlePDF(){
    setExporting(true)
    try{
      await exportPDF(m,m.format)
    }catch(e){
      console.error('[PDF] Erro:', e)
      toast.error('Erro ao gerar PDF: ' + (e?.message||String(e)), {id:'pdf', duration:8000})
    }finally{
      setExporting(false)
    }
  }
  return(
    <div className="flex flex-col gap-0 animate-fade-in">
      <div className="flex items-center justify-between gap-3 mb-5">
        <button onClick={onCancel} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 font-semibold"><ArrowLeft size={16}/> Voltar</button>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 cursor-pointer select-none">
            <input type="checkbox" checked={showBleed} onChange={e=>setShowBleed(e.target.checked)} className="accent-rose-500"/>Sangra
          </label>
          <button onClick={handlePDF} disabled={exporting} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60">
            {exporting?<Loader2 size={15} className="animate-spin"/>:<FileDown size={15}/>} Salvar PDF
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<><Save size={15}/>Salvar</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="flex flex-col gap-4">
          <div className="card">
            <label className="form-label">Formato</label>
            <div className="flex gap-3">
              {Object.entries(FORMATS).map(([k,f])=>(
                <button key={k} type="button" onClick={()=>set('format',k)} className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${m.format===k?'border-rose-400 bg-rose-50':'border-slate-200 hover:border-slate-300 bg-white'}`}>
                  <div style={{width:k==='9x21'?16:26,height:40,flexShrink:0,backgroundColor:m.format===k?'#f43f5e':'#cbd5e1',borderRadius:3}}/>
                  <div><div className="text-sm font-bold text-slate-700">{f.label}</div><div className="text-xs text-slate-400">{f.wmm}x{f.hmm}mm + {f.bleed}mm sangra</div></div>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="font-bold text-slate-700 text-sm mb-4">Informacoes</div>
            <div className="flex flex-col gap-3">
              <div><label className="form-label">Nome *</label><input className="input uppercase font-bold tracking-wide" value={m.name} onChange={e=>set('name',e.target.value.toUpperCase())} placeholder="EX: GANGORRA"/></div>
              <div><label className="form-label">Tagline</label><input className="input" value={m.front_tagline||''} onChange={e=>set('front_tagline',e.target.value)} placeholder="Brinquedo interativo para gatos"/></div>
              <div><label className="form-label">Link do video (QR Code)</label><input className="input" value={m.video_url||''} onChange={e=>set('video_url',e.target.value)} placeholder="https://youtube.com/..."/></div>
              <div><label className="form-label">Site no rodape</label><input className="input" value={m.footer_site||''} onChange={e=>set('footer_site',e.target.value)} placeholder="www.coisapet.com.br"/></div>
            </div>
          </div>
          <div className="card">
            <div className="font-bold text-slate-700 text-sm mb-4">Imagens</div>
            <div className="grid grid-cols-2 gap-4">
              <ImgUpload label="Produto montado (frente)" value={m.front_image_url||''} onChange={v=>set('front_image_url',v)} hint="PNG fundo transparente"/>
              <ImgUpload label="Vista explodida (verso)" value={m.back_image_url||''} onChange={v=>set('back_image_url',v)} hint="PNG com pecas numeradas"/>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-slate-700 text-sm">Pecas (2 colunas no verso)</div>
              <button onClick={addPart} className="flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-600"><Plus size={13}/> Adicionar</button>
            </div>
            {(!m.parts||m.parts.length===0)?<p className="text-xs text-slate-400 text-center py-4">Nenhuma peca</p>
            :<div className="flex flex-col gap-2">
              {m.parts.map((p,i)=>(
                <div key={i} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-800 text-white text-[10px] font-black flex items-center justify-center shrink-0">{p.num||i+1}</div>
                  <input className="input flex-1 text-sm" placeholder="Nome da peca" value={p.label} onChange={e=>setPart(i,'label',e.target.value)}/>
                  <button onClick={()=>removePart(i)} className="p-1.5 text-slate-300 hover:text-rose-500"><X size={14}/></button>
                </div>
              ))}
            </div>}
          </div>
          <div className="card">
            <label className="form-label">Instruções de montagem</label>
            <RichEditor value={m.assembly_steps||''} onChange={v=>set('assembly_steps',v)}/>
          </div>
        </div>
        <div>
          <div className="sticky top-4 flex flex-col" style={{height:'calc(100vh - 120px)'}}>
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                {['front','back'].map(s=>(
                  <button key={s} onClick={()=>setSide(s)} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${side===s?'bg-white text-slate-800 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>
                    {s==='front'?'Frente':'Verso'}
                  </button>
                ))}
              </div>
              {/* Zoom controls */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl ml-auto">
                <button onClick={()=>setZoom(z=>Math.max(0.5,+(z-0.25).toFixed(2)))} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:shadow-sm transition-all font-bold text-base leading-none" title="Zoom -">−</button>
                <span className="text-xs font-bold text-slate-500 w-10 text-center">{Math.round(zoom*100)}%</span>
                <button onClick={()=>setZoom(z=>Math.min(3,+(z+0.25).toFixed(2)))} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:shadow-sm transition-all font-bold text-base leading-none" title="Zoom +">+</button>
                <button onClick={()=>setZoom(1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-white hover:shadow-sm transition-all text-[10px] font-bold" title="Resetar zoom">↺</button>
              </div>
            </div>
            <div ref={previewRef} className="rounded-2xl flex-1 overflow-auto flex justify-center items-center p-4 bg-slate-500">
              {side==='front'?<ManualFront m={m} fmt={m.format} scale={PS} showBleed={showBleed}/>:<ManualBack m={m} fmt={m.format} scale={PS} showBleed={showBleed}/>}
            </div>
            {showBleed&&<p className="text-xs text-red-400 text-center mt-1 font-semibold">Linha vermelha = sangra 5mm (area de corte)</p>}
            <p className="text-xs text-slate-400 text-center mt-1">PDF final: {fmt.wmm+fmt.bleed*2}x{fmt.hmm+fmt.bleed*2}mm (com sangra)</p>
          </div>
        </div>
      </div>

    </div>
  )
}

// Thumb: usa front_image_url se existir, senão placeholder colorido
function ManualThumb({manual, size}){
  const f=FORMATS[manual.format]||FORMATS['9x21']
  const s=size||80
  const shared={width:s,height:s,borderRadius:6,flexShrink:0,display:'block',boxShadow:'0 2px 10px rgba(0,0,0,0.13)'}
  if(manual.front_image_url){
    return(
      <div style={{...shared,overflow:'hidden',background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <img src={manual.front_image_url} alt={manual.name}
          style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}}/>
      </div>
    )
  }
  return(
    <div style={{...shared,overflow:'hidden',
      background:'linear-gradient(145deg,#3a1c0d,#5a2d14)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4}}>
      <div style={{fontSize:Math.max(8,s*0.09),fontWeight:900,color:'#F6F0E5',textAlign:'center',
        textTransform:'uppercase',lineHeight:1.15,padding:'0 6px',letterSpacing:.5}}>
        {manual.name}
      </div>
      <div style={{fontSize:Math.max(6,s*0.07),color:'#C4956A',fontWeight:600,letterSpacing:1,textTransform:'uppercase'}}>
        {f.label}
      </div>
    </div>
  )
}

function ManualCard({manual,onEdit,onDelete,mode='grid'}){
  const f=FORMATS[manual.format]||FORMATS['9x21']
  // Proporção real do formato
  const ratio=f.hmm/f.wmm
  const THUMB_W=mode==='grid'?90:56
  const THUMB_H=Math.round(THUMB_W*ratio)

  if(mode==='list'){
    return(
      <div className="card hover:shadow-md transition-all group flex items-center gap-4 py-3 px-4">
        <ManualThumb manual={manual} size={THUMB_W}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="font-bold text-slate-800 uppercase tracking-wide text-sm leading-tight">{manual.name}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{f.label}</span>
          </div>
          {manual.front_tagline&&<p className="text-xs text-slate-400 truncate mb-1">{manual.front_tagline}</p>}
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>{(manual.parts||[]).length} peça(s)</span>
            {manual.video_url&&<span className="text-sky-500 font-semibold">QR Code</span>}
            <span>{new Date(manual.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={()=>onEdit(manual)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 size={14}/></button>
          <button onClick={()=>onDelete(manual)} className="p-2 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-500"><Trash2 size={14}/></button>
        </div>
      </div>
    )
  }

  // Grid mode
  return(
    <div className="card hover:shadow-lg transition-all group flex flex-col p-0 overflow-hidden">
      <div className="flex items-center justify-center bg-slate-50 border-b border-slate-100 py-4">
        <ManualThumb manual={manual} size={THUMB_W}/>
      </div>
      <div className="flex-1 flex flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 uppercase tracking-wide text-xs leading-tight">{manual.name}</p>
            {manual.front_tagline&&<p className="text-[10px] text-slate-400 mt-0.5 truncate">{manual.front_tagline}</p>}
          </div>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0 mt-0.5">{f.label}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
          <span>{(manual.parts||[]).length} peça(s)</span>
          {manual.video_url&&<span className="text-sky-500 font-semibold">QR</span>}
          <span className="ml-auto">{new Date(manual.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
      <div className="flex border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={()=>onEdit(manual)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"><Edit2 size={12}/> Editar</button>
        <div className="w-px bg-slate-100"/>
        <button onClick={()=>onDelete(manual)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors"><Trash2 size={12}/> Excluir</button>
      </div>
    </div>
  )
}

export function ManualsPage(){
  const[manuals,setManuals]=useState([]),[loading,setLoading]=useState(true),[editing,setEditing]=useState(null),[delTarget,setDelTarget]=useState(null),[search,setSearch]=useState(''),[view,setView]=useState('grid')
  useEffect(()=>{if(!editing)load()},[editing])
  async function load(){setLoading(true);const{data}=await supabase.from('manuals').select('*').order('created_at',{ascending:false});setManuals(data??[]);setLoading(false)}
  async function saveManual(form){
    const{id:uid}=getSession()
    if(form.id){const{error}=await supabase.from('manuals').update({name:form.name,format:form.format,front_tagline:form.front_tagline,video_url:form.video_url,front_image_url:form.front_image_url,back_image_url:form.back_image_url,parts:form.parts,assembly_steps:form.assembly_steps,footer_site:form.footer_site}).eq('id',form.id);if(error)throw error;toast.success('Atualizado!')}
    else{const{error}=await supabase.from('manuals').insert({...form,created_by:uid});if(error)throw error;toast.success('Criado!')}
    setEditing(null)
  }
  async function deleteManual(manual){await supabase.from('manuals').delete().eq('id',manual.id);toast.success('Removido.');setDelTarget(null);load()}
  if(editing!==null)return<ManualEditor manual={editing} onSave={saveManual} onCancel={()=>setEditing(null)}/>
  return(
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Manuais</h2><p className="page-subtitle">Crie e exporte manuais em PDF para a grafica</p></div>
        <button onClick={()=>setEditing({})} className="btn-primary"><Plus size={16}/> Novo manual</button>
      </div>
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="input pl-9 w-full" placeholder="Buscar manual por nome..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        {/* Toggle lista / grid */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          <button onClick={()=>setView('grid')} title="Grade"
            className={`p-2 rounded-lg transition-all ${view==='grid'?'bg-white shadow-sm text-slate-700':'text-slate-400 hover:text-slate-600'}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>
          </button>
          <button onClick={()=>setView('list')} title="Lista"
            className={`p-2 rounded-lg transition-all ${view==='list'?'bg-white shadow-sm text-slate-700':'text-slate-400 hover:text-slate-600'}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(FORMATS).map(([k,f])=>(
          <div key={k} className="card flex items-center gap-4 py-4">
            <div style={{width:k==='9x21'?18:30,height:48,flexShrink:0,backgroundColor:'#1e293b',borderRadius:4}}/>
            <div className="flex-1"><p className="text-sm font-bold text-slate-700">{f.label}</p><p className="text-xs text-slate-400">{f.wmm}x{f.hmm}mm + {f.bleed}mm sangra</p></div>
            <button onClick={()=>setEditing({format:k})} className="btn-secondary text-xs px-3 py-1.5 shrink-0">Criar</button>
          </div>
        ))}
      </div>
      {loading?<div className="card flex justify-center py-12"><div className="w-7 h-7 rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin"/></div>
      :manuals.length===0?<div className="card text-center py-16"><BookOpen size={36} className="mx-auto mb-3 text-slate-200"/><p className="font-bold text-slate-600">Nenhum manual criado</p><button onClick={()=>setEditing({})} className="btn-primary mt-4 mx-auto inline-flex"><Plus size={15}/> Criar</button></div>
      :<>{(() => { const filtered=manuals.filter(m=>m.name?.toLowerCase().includes(search.toLowerCase())); return filtered.length===0?<div className="card text-center py-10 text-slate-400"><p className="font-semibold">Nenhum manual encontrado para "{search}"</p></div>:view==="list"?<div className="flex flex-col gap-2">{filtered.map(m=><ManualCard key={m.id} manual={m} onEdit={setEditing} onDelete={setDelTarget} mode="list"/>)}</div>:<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{filtered.map(m=><ManualCard key={m.id} manual={m} onEdit={setEditing} onDelete={setDelTarget} mode="grid"/>)}</div> })()}</> }
      <ConfirmDialog open={!!delTarget} onClose={()=>setDelTarget(null)} onConfirm={()=>deleteManual(delTarget)} title="Excluir manual?" description={`"${delTarget?.name}" sera removido.`} confirmLabel="Excluir"/>
    </div>
  )
}
