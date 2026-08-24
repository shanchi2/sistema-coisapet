import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) { toast.error('Preencha e-mail e senha.'); return }

    setLoading(true)
    try {
      const user = await signIn(email, password)
      if (user.must_change_password) {
        // Primeiro acesso — redireciona para trocar a senha
        navigate('/trocar-senha')
      } else {
        toast.success(`Bem-vindo, ${user.name.split(' ')[0]}!`)
        navigate('/dashboard')
      }
    } catch (err) {
      toast.error(err.message ?? 'E-mail ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #FFF1F5 0%, #ffffff 50%, #F0F9FF 100%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl p-8 border border-slate-100"
             style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="rounded-2xl px-6 py-3 mb-3 flex items-center gap-1" style={{ backgroundColor: '#FFF1F5' }}>
              <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: '26px', color: '#F43F5E' }}>coisa</span>
              <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: '26px', color: '#F59E0B' }}>pet</span>
            </div>
            <p className="text-slate-400 font-medium tracking-widest" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
              Sistema de Gestão Interna
            </p>
          </div>

          <h2 className="text-center text-slate-800 mb-1"
              style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: '20px' }}>
            Bem-vindo de volta!
          </h2>
          <p className="text-center text-slate-400 text-sm mb-7">Faça login para acessar o sistema</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="form-label">E-mail</label>
              <input type="email" className="input" placeholder="seu@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" disabled={loading} />
            </div>
            <div>
              <label className="form-label">Senha</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} className="input pr-10"
                  placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password" disabled={loading} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, backgroundColor: loading ? '#FCA5B8' : '#F43F5E' }}>
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><LogIn size={16} /> Entrar no sistema</>
              }
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-400 mt-5">
          CoisaPet © {new Date().getFullYear()} — Sistema Interno
        </p>
      </div>
    </div>
  )
}
