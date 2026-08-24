import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

/**
 * Gera uma senha temporária legível no formato: Abc1@xyz9
 * Fácil de copiar e comunicar via WhatsApp
 */
export function generateTempPassword() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const digits  = '23456789'
  const special = '@#!$'
  const all     = upper + lower + digits + special

  const rand = (str) => str[Math.floor(Math.random() * str.length)]

  // Garante pelo menos 1 de cada tipo exigido
  const required = [rand(upper), rand(digits), rand(special), rand(lower)]
  const extra    = Array.from({ length: 4 }, () => rand(all))

  return [...required, ...extra]
    .sort(() => Math.random() - 0.5)
    .join('')
}

/**
 * createSystemUser — cria um usuário no Supabase Auth + atualiza o profile
 * sem derrubar a sessão do admin logado.
 *
 * Funciona usando uma segunda instância do Supabase client
 * separada da instância principal.
 *
 * PRÉ-REQUISITO: desativar "Confirm email" em
 * Supabase → Authentication → Providers → Email
 */
export async function createSystemUser({ email, password, name, role, employeeId }) {
  // ── 1. Cria um client temporário isolado (não afeta o admin logado) ──
  const tempClient = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession:   false,  // ← chave: não salva sessão no storage
        detectSessionInUrl: false,
      },
    }
  )

  // ── 2. Cria o usuário via signUp no client temporário ────────────────
  const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
    email,
    password,
    options: {
      data: { name }, // popula raw_user_meta_data para o trigger
    },
  })

  if (signUpError) {
    let msg = 'Erro ao criar usuário.'
    if (signUpError.message.includes('already registered')) {
      msg = 'Este e-mail já está cadastrado no sistema.'
    }
    throw new Error(msg)
  }

  const userId = signUpData.user?.id
  if (!userId) throw new Error('Erro inesperado: ID do usuário não retornado.')

  // ── 3. Atualiza o profile com nome, role e flag de troca de senha ────
  // Usa o client principal (admin) que tem permissão de escrita
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id:                    userId,
      name,
      role,
      force_password_change: true, // força troca no primeiro login
    })

  if (profileError) {
    console.error('Erro ao salvar perfil:', profileError)
    // Não interrompe o fluxo — o trigger já criou o profile,
    // pode ser apenas um conflito de timing
  }

  // ── 4. Vincula ao funcionário se o ID foi passado ────────────────────
  if (employeeId) {
    await supabase
      .from('employees')
      .update({ profile_id: userId })
      .eq('id', employeeId)
  }

  // ── 5. Limpa a sessão temporária (importante!) ───────────────────────
  await tempClient.auth.signOut()

  return { userId, email, password, name, role }
}
