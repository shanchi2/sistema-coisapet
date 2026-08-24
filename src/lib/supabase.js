import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[CoisaPet] ⚠️  Variáveis do Supabase não encontradas!\n' +
    'Crie o arquivo .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:       false,  // não tenta salvar sessão do Supabase Auth
    autoRefreshToken:     false,  // não tenta renovar tokens inexistentes
    detectSessionFromUrl: false,  // não lê tokens da URL
  },
})