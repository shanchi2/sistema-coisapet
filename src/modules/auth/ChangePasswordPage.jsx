import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export function ChangePasswordPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [newPass,     setNewPass]     = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showNew,     setShowNew]     = useState(false)
  const [showConf,    setShowConf]    = useState(false)
  const [loading,     setLoading]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (newPass.length < 6) { toast.error('A senha deve ter pelo menos 6 caracteres.'); return }
    if (newPass !== confirmPass) { toast.error('As senhas não coincidem.'); return }

    setLoading(true)
    try {
      const { data } = await supabase.rpc('change_user_password', {
        p_user_id:      user.id,
        p_old_password: null,
        p_new_password: newPass,
      })
      if (data?.error) { toast.error(data.error); return }

      toast.success('Senha definida com sucesso!')
      await refreshUser()
      navigate('/dashboard')
    } catch {
      toast.error('Erro ao trocar senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'linear-gradient(135deg, #FFF1F5 0%, #ffffff 50%, #F0F9FF 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl p-8 border border-slate-100"
             style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>

          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
              <KeyRound size={26} className="text-amber-400" />
            </div>
            <h2 className="text-slate-800 text-center mb-1"
                style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: '20px' }}>
              Defina sua senha
            </h2>
            <p className="text-slate-400 text-sm text-center">
              Este é seu primeiro acesso. Por segurança, crie uma senha pessoal.
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl px-4 py-3 mb-5 border border-slate-100">
            <p className="text-xs text-slate-400 mb-0.5">Você está logado como</p>
            <p className="text-sm font-semibold text-slate-700">{user?.name}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="form-label">Nova senha</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} className="input pr-10"
                  placeholder="Mínimo 6 caracteres" value={newPass}
                  onChange={e => setNewPass(e.target.value)} disabled={loading} />
                <button type="button" onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="form-label">Confirmar nova senha</label>
              <div className="relative">
                <input type={showConf ? 'text' : 'password'} className="input pr-10"
                  placeholder="Repita a nova senha" value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)} disabled={loading} />
                <button type="button" onClick={() => setShowConf(!showConf)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPass && (
                <p className={`text-xs mt-1 ${newPass === confirmPass ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {newPass === confirmPass ? '✓ Senhas coincidem' : '✗ Senhas não coincidem'}
                </p>
              )}
            </div>
            <button type="submit" disabled={loading || !newPass || !confirmPass}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm transition-all active:scale-[0.98] disabled:opacity-60 mt-1"
              style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, backgroundColor: '#F43F5E' }}>
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><ShieldCheck size={16} /> Salvar minha senha</>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
