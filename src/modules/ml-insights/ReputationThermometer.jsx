// Termômetro visual da reputação do ML — os 5 níveis reais que a
// própria plataforma usa (vermelho → laranja → amarelo → verde-claro →
// verde), não só um badge de uma cor só.
const LEVELS = ['1_red', '2_orange', '3_yellow', '4_light_green', '5_green']
const LEVEL_COLORS = {
  '1_red':         '#F43F5E',
  '2_orange':      '#F97316',
  '3_yellow':       '#F59E0B',
  '4_light_green': '#84CC16',
  '5_green':       '#10B981',
}
const LEVEL_LABELS = {
  '1_red':         'Vermelho',
  '2_orange':      'Laranja',
  '3_yellow':       'Amarelo',
  '4_light_green': 'Verde-claro',
  '5_green':       'Verde',
}

export function ReputationThermometer({ levelId, size = 'md' }) {
  const idx = LEVELS.indexOf(levelId)
  const barHeight = size === 'sm' ? 8 : 12

  return (
    <div>
      <div className="flex gap-1 rounded-full overflow-hidden" style={{ height: barHeight }}>
        {LEVELS.map((lvl, i) => (
          <div key={lvl} className="flex-1 transition-opacity" style={{ background: LEVEL_COLORS[lvl], opacity: idx === -1 ? 0.25 : (i === idx ? 1 : 0.3) }}/>
        ))}
      </div>
      {idx >= 0 && (
        <div className="relative" style={{ height: 14 }}>
          <div
            className="absolute text-[10px] leading-none"
            style={{ left: `${((idx + 0.5) / LEVELS.length) * 100}%`, transform: 'translateX(-50%)', color: LEVEL_COLORS[levelId] }}
          >▲</div>
        </div>
      )}
      <p className="text-sm font-semibold mt-1" style={{ color: idx >= 0 ? LEVEL_COLORS[levelId] : '#94a3b8' }}>
        {idx >= 0 ? `Termômetro: ${LEVEL_LABELS[levelId]}` : 'Sem dado de reputação'}
      </p>
    </div>
  )
}
