/**
 * LoadingSpinner — spinner de carregamento reutilizável.
 * Props:
 *   size    → tamanho em px (padrão: 32)
 *   message → texto abaixo do spinner (opcional)
 *   fullscreen → se true, centraliza na tela inteira
 */
export function LoadingSpinner({ size = 32, message, fullscreen = false }) {
  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-full border-4 border-rose-100 border-t-rose-400 animate-spin"
        style={{ width: size, height: size }}
      />
      {message && (
        <p className="text-sm text-slate-400 font-medium">{message}</p>
      )}
    </div>
  )

  if (fullscreen) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        {spinner}
      </div>
    )
  }

  return spinner
}
