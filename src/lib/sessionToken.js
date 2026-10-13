// Token da sessão emitido pelo user_login (fase106, 13/10). As funções de
// banco sensíveis (resetar senha, criar/remover usuário) exigem ele — sem o
// token o banco não sabe QUEM está pedindo. Sessões abertas antes de 13/10
// não têm token: a pessoa precisa sair e entrar de novo.
export function sessionToken() {
  try { return JSON.parse(localStorage.getItem('coisapet_session'))?.token || null } catch { return null }
}
