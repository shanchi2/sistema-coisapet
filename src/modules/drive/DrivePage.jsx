import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder, FolderOpen, File, FileText, Image, Upload,
  Plus, Trash2, Pencil, Download, Link, Lock, Eye,
  ChevronRight, Home, X, Check, Loader2, FolderPlus,
  Share2, Shield, Users, MoreVertical, Search,
} from 'lucide-react'
import { supabase }  from '../../lib/supabase'
import { useAuth }   from '../../contexts/AuthContext'
import toast         from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────
function getSession() { try { return JSON.parse(localStorage.getItem('coisapet_session')||'{}') } catch { return {} } }
function fmtSize(b) {
  if (!b) return '—'
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB'
  return (b/1048576).toFixed(1) + ' MB'
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}) : '—' }

const MIME_ICONS = {
  'application/pdf':  { icon: FileText, color: '#ef4444' },
  'image/':           { icon: Image,    color: '#06b6d4' },
  'default':          { icon: File,     color: '#64748b' },
}
function getFileIcon(mime) {
  if (!mime) return MIME_ICONS.default
  for (const [k,v] of Object.entries(MIME_ICONS)) {
    if (mime.startsWith(k)) return v
  }
  return MIME_ICONS.default
}

const FOLDER_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#0ea5e9','#8b5cf6','#ec4899','#64748b']

// ── Modal criar/editar pasta ──────────────────────────────────────
function FolderModal({ open, onClose, onSave, initial, isAdmin }) {
  const [name,       setName]       = useState('')
  const [color,      setColor]      = useState('#6366f1')
  const [visibility, setVisibility] = useState('private')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setColor(initial?.color ?? '#6366f1')
    setVisibility(initial?.visibility ?? 'private')
  }, [open, initial])

  async function save() {
    if (!name.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    try { await onSave({ name: name.trim(), color, visibility }); onClose() }
    catch(e) { toast.error('Erro: ' + e.message) }
    finally { setSaving(false) }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-slate-800 text-lg mb-4">{initial ? 'Renomear pasta' : 'Nova pasta'}</h3>
        <div className="flex flex-col gap-4">
          <div>
            <label className="form-label">Nome da pasta</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Contratos 2026" autoFocus
              onKeyDown={e => e.key === 'Enter' && save()}/>
          </div>
          <div>
            <label className="form-label">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {FOLDER_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg transition-all ${color===c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }}/>
              ))}
            </div>
          </div>
          <div>
            <label className="form-label">Visibilidade</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setVisibility('private')}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-xs font-semibold transition-all
                  ${visibility==='private' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                <Lock size={13}/> Só diretores
              </button>
              <button onClick={() => setVisibility('shared')}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-xs font-semibold transition-all
                  ${visibility==='shared' ? 'bg-sky-50 border-sky-300 text-sky-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                <Users size={13}/> + Administrativo
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={saving}>Cancelar</button>
          <button onClick={save} className="btn-primary flex-1" disabled={saving || !name.trim()}>
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>}
            {initial ? 'Salvar' : 'Criar pasta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal link público ────────────────────────────────────────────
function ShareModal({ open, onClose, file, onGenerate }) {
  const [copying, setCopying] = useState(false)
  const [expDays, setExpDays] = useState('7')
  const hasLink = !!file?.public_token

  // public_token agora é o próprio signed URL do Supabase Storage
  const url = hasLink ? file.public_token : null

  async function copy() {
    if (!url) return
    setCopying(true)
    await navigator.clipboard.writeText(url)
    toast.success('Link copiado!')
    setTimeout(() => setCopying(false), 1500)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-slate-800 text-lg mb-1">Compartilhar arquivo</h3>
        <p className="text-xs text-slate-400 mb-4">{file?.name}</p>
        {hasLink ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <input readOnly value={url} className="flex-1 text-xs text-slate-600 bg-transparent outline-none truncate"/>
              <button onClick={copy} className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${copying ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                {copying ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            {file.public_expires && (
              <p className="text-xs text-slate-400 text-center">Expira em {fmtDate(file.public_expires)}</p>
            )}
            <button onClick={() => onGenerate(file, null)} className="text-xs text-rose-400 hover:text-rose-600 text-center">
              Revogar link público
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">Gerar link público acessível por qualquer pessoa com o link.</p>
            <div>
              <label className="form-label">Validade</label>
              <select className="select" value={expDays} onChange={e => setExpDays(e.target.value)}>
                <option value="1">1 dia</option>
                <option value="7">7 dias</option>
                <option value="30">30 dias</option>
                <option value="0">Sem expiração</option>
              </select>
            </div>
            <button onClick={() => onGenerate(file, expDays)} className="btn-primary">
              <Link size={14}/> Gerar link
            </button>
          </div>
        )}
        <button onClick={onClose} className="w-full btn-secondary mt-2">Fechar</button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────
export function DrivePage() {
  const { user }      = useAuth()
  const isDirector    = ['admin'].includes(user?.role)
  const isAdmin       = ['admin','administrativo'].includes(user?.role)

  const [folders,    setFolders]    = useState([])
  const [files,      setFiles]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [path,       setPath]       = useState([]) // breadcrumb: [{id,name}]
  const [uploading,  setUploading]  = useState(false)
  const [search,     setSearch]     = useState('')
  const [folderModal,setFolderModal] = useState(false)
  const [editFolder, setEditFolder] = useState(null)
  const [shareModal, setShareModal] = useState(null)
  const [menuOpen,   setMenuOpen]   = useState(null) // id do item com menu aberto
  const fileInputRef = useRef()

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null

  const load = useCallback(async () => {
    setLoading(true)
    const foldersQ = supabase.from('drive_folders')
      .select('*').order('name')
      .eq('parent_id', currentFolderId ?? '00000000-0000-0000-0000-000000000000')

    // null parent — raiz
    const foldersRootQ = currentFolderId
      ? supabase.from('drive_folders').select('*').order('name').eq('parent_id', currentFolderId)
      : supabase.from('drive_folders').select('*').order('name').is('parent_id', null)

    const filesQ = currentFolderId
      ? supabase.from('drive_files').select('*').order('created_at',{ascending:false}).eq('folder_id', currentFolderId)
      : supabase.from('drive_files').select('*').order('created_at',{ascending:false}).is('folder_id', null)

    const [fR, fiR] = await Promise.all([foldersRootQ, filesQ])

    // Filtra pastas por visibilidade
    let visibleFolders = fR.data ?? []
    if (!isDirector) {
      visibleFolders = visibleFolders.filter(f => f.visibility === 'shared')
    }

    setFolders(visibleFolders)
    setFiles(fiR.data ?? [])
    setLoading(false)
  }, [currentFolderId, isDirector])

  useEffect(() => { load() }, [load])

  // Fechar menu ao clicar fora
  useEffect(() => {
    const fn = () => setMenuOpen(null)
    document.addEventListener('click', fn)
    return () => document.removeEventListener('click', fn)
  }, [])

  // ── Pastas ──
  async function createFolder(data) {
    const { id } = getSession()
    const { error } = await supabase.from('drive_folders').insert({
      name: data.name, color: data.color,
      visibility: data.visibility,
      parent_id: currentFolderId ?? null,
      created_by: id,
    })
    if (error) throw error
    toast.success('Pasta criada!')
    load()
  }

  async function updateFolder(folderId, data) {
    const { error } = await supabase.from('drive_folders')
      .update({ name: data.name, color: data.color, visibility: data.visibility, updated_at: new Date().toISOString() })
      .eq('id', folderId)
    if (error) throw error
    toast.success('Pasta atualizada!')
    load()
  }

  async function deleteFolder(id) {
    if (!confirm('Excluir pasta e todo seu conteúdo?')) return
    await supabase.from('drive_folders').delete().eq('id', id)
    toast.success('Pasta excluída.')
    load()
  }

  // ── Arquivos ──
  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 30 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 30MB.'); return }
    setUploading(true)
    try {
      const { id } = getSession()
      const ext  = file.name.split('.').pop()
      const path = `drive/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('drive').upload(path, file)
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('drive_files').insert({
        name:         file.name,
        storage_path: path,
        mime_type:    file.type,
        size_bytes:   file.size,
        folder_id:    currentFolderId ?? null,
        created_by:   id,
      })
      if (dbErr) throw dbErr
      toast.success('Arquivo enviado!')
      load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    finally { setUploading(false); fileInputRef.current.value = '' }
  }

  async function deleteFile(file) {
    if (!confirm('Excluir arquivo?')) return
    await supabase.storage.from('drive').remove([file.storage_path])
    await supabase.from('drive_files').delete().eq('id', file.id)
    toast.success('Arquivo excluído.')
    load()
  }

  async function downloadFile(file) {
    const { data } = await supabase.storage.from('drive').createSignedUrl(file.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else toast.error('Erro ao abrir arquivo.')
  }

  async function generatePublicLink(file, expDays) {
    if (expDays === null) {
      // Revogar
      await supabase.from('drive_files').update({ public_token: null, public_expires: null }).eq('id', file.id)
      toast.success('Link revogado.')
      load(); setShareModal(null); return
    }
    // Calcula segundos de expiração
    const seconds = expDays === '0' ? 60 * 60 * 24 * 365 * 10 : parseInt(expDays) * 86400
    const { data, error } = await supabase.storage.from('drive').createSignedUrl(file.storage_path, seconds)
    if (error || !data?.signedUrl) { toast.error('Erro ao gerar link.'); return }
    const expires = expDays === '0' ? null : new Date(Date.now() + seconds*1000).toISOString()
    // Salva o signed URL como public_token para referência
    await supabase.from('drive_files').update({
      public_token:   data.signedUrl,
      public_expires: expires
    }).eq('id', file.id)
    toast.success('Link gerado!')
    load()
    setShareModal({ ...file, public_token: data.signedUrl, public_expires: expires })
  }

  // Filtra por busca
  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
  const filteredFiles   = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 style={{fontFamily:'Nunito,sans-serif',fontWeight:900,fontSize:'22px',color:'#1e293b',letterSpacing:'-.5px'}}>
            Drive CoisaPet
          </h2>
          <p className="text-sm text-slate-400">Armazenamento interno da empresa</p>
        </div>
        {isDirector && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditFolder(null); setFolderModal(true) }}
              className="btn-secondary flex items-center gap-1.5">
              <FolderPlus size={14}/> Nova pasta
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="btn-primary flex items-center gap-1.5">
              {uploading ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
              {uploading ? 'Enviando...' : 'Upload'}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload}/>
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap">
        <button onClick={() => setPath([])}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors
            ${path.length === 0 ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>
          <Home size={12}/> Drive
        </button>
        {path.map((p, i) => (
          <React.Fragment key={p.id}>
            <ChevronRight size={13} className="text-slate-300"/>
            <button onClick={() => setPath(prev => prev.slice(0, i+1))}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors
                ${i === path.length-1 ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>
              {p.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Busca */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input className="input pl-8 text-sm py-2" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar nesta pasta..."/>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="card p-12 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-slate-400"/>
        </div>
      ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
        <div className="card p-16 text-center">
          <FolderOpen size={40} className="text-slate-200 mx-auto mb-3"/>
          <p className="text-slate-400 font-semibold">Pasta vazia</p>
          {isDirector && (
            <p className="text-xs text-slate-300 mt-1">Crie uma pasta ou faça upload de arquivos</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Pastas */}
          {filteredFolders.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Pastas</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {filteredFolders.map(folder => (
                  <div key={folder.id} className="relative group">
                    <div
                      onDoubleClick={() => setPath(p => [...p, { id: folder.id, name: folder.name }])}
                      onClick={() => setPath(p => [...p, { id: folder.id, name: folder.name }])}
                      className="card p-4 flex flex-col items-center gap-2 cursor-pointer hover:shadow-md transition-all hover:border-slate-200 select-none">
                      <div className="relative">
                        <Folder size={40} style={{ color: folder.color }} fill={folder.color + '33'}/>
                        {folder.visibility === 'private' && (
                          <Lock size={10} className="absolute -bottom-0.5 -right-0.5 text-slate-500 bg-white rounded-full p-0.5"/>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-700 text-center truncate w-full leading-tight">
                        {folder.name}
                      </p>
                    </div>
                    {/* Menu da pasta */}
                    {isDirector && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="relative">
                          <button onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === folder.id ? null : folder.id) }}
                            className="w-6 h-6 rounded-lg bg-white/80 hover:bg-white shadow flex items-center justify-center">
                            <MoreVertical size={12} className="text-slate-500"/>
                          </button>
                          {menuOpen === folder.id && (
                            <div className="absolute right-0 top-7 bg-white border border-slate-200 rounded-xl shadow-xl py-1 w-40 z-10"
                              onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setEditFolder(folder); setFolderModal(true); setMenuOpen(null) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                                <Pencil size={12}/> Renomear
                              </button>
                              <button onClick={() => { deleteFolder(folder.id); setMenuOpen(null) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50">
                                <Trash2 size={12}/> Excluir
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Arquivos */}
          {filteredFiles.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Arquivos</p>
              <div className="card overflow-hidden">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Tamanho</th>
                      <th>Data</th>
                      <th>Link</th>
                      <th className="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFiles.map(file => {
                      const { icon: FileIcon, color } = getFileIcon(file.mime_type)
                      return (
                        <tr key={file.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td>
                            <div className="flex items-center gap-2.5">
                              <FileIcon size={18} style={{ color }} className="shrink-0"/>
                              <span className="text-sm font-semibold text-slate-700 truncate max-w-[200px]">{file.name}</span>
                            </div>
                          </td>
                          <td className="text-xs text-slate-400">{fmtSize(file.size_bytes)}</td>
                          <td className="text-xs text-slate-400">{fmtDate(file.created_at)}</td>
                          <td>
                            {file.public_token
                              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">Público</span>
                              : <span className="text-[10px] text-slate-300">—</span>
                            }
                          </td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => downloadFile(file)} title="Abrir/Download"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                <Download size={14}/>
                              </button>
                              {isDirector && (
                                <>
                                  <button onClick={() => setShareModal(file)} title="Compartilhar"
                                    className={`p-1.5 rounded-lg transition-colors ${file.public_token ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                                    <Share2 size={14}/>
                                  </button>
                                  <button onClick={() => deleteFile(file)} title="Excluir"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                                    <Trash2 size={14}/>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      <FolderModal
        open={folderModal}
        onClose={() => { setFolderModal(false); setEditFolder(null) }}
        onSave={editFolder ? d => updateFolder(editFolder.id, d) : createFolder}
        initial={editFolder}
        isAdmin={isAdmin}
      />
      <ShareModal
        open={!!shareModal}
        onClose={() => setShareModal(null)}
        file={shareModal}
        onGenerate={generatePublicLink}
      />
    </div>
  )
}