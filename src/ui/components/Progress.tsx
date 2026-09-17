import type { Evaluation } from '../../core/engine'
import type { Program } from '../../core/types'

export type Tone = 'major' | 'in' | 'out' | 'elective' | 'common' | 'pe'

/** 說明收進圖示，滑鼠移上或聚焦時才顯示，版面保持乾淨。 */
export function Info({ text }: { text: string }) {
  return (
    <span className="info" tabIndex={0} role="img" aria-label={text} data-tip={text}>
      i
    </span>
  )
}

function Delta({ value }: { value?: number }) {
  if (value === undefined || value === 0) return null
  return <span className={value > 0 ? 'delta up' : 'delta down'}>{value > 0 ? `+${value}` : value}</span>
}

type TileProps = {
  label: string
  tone: Tone
  value: number
  required?: number
  delta?: number
  info?: string
}

export function StatTile({ label, tone, value, required, delta, info }: TileProps) {
  const hasTarget = required !== undefined && required > 0
  const pct = hasTarget ? Math.min(100, (value / required) * 100) : 0
  const gap = hasTarget ? Math.max(0, required - value) : 0

  return (
    <div className={`tile tone-${tone}`}>
      <div className="tile-head">
        <span className="tile-label">
          <span className="dot" />
          {label}
          {info && <Info text={info} />}
        </span>
        {hasTarget && (gap === 0
          ? <span className="badge ok">達標</span>
          : <span className="badge gap">差 {gap}</span>)}
      </div>
      <div className="tile-value">
        <strong>{value}</strong>
        {hasTarget && <span className="of">/ {required}</span>}
        <Delta value={delta} />
      </div>
      <div
        className={hasTarget ? 'bar' : 'bar no-target'}
        {...(hasTarget && {
          role: 'progressbar',
          'aria-label': label,
          'aria-valuemin': 0,
          'aria-valuemax': required,
          'aria-valuenow': Math.min(value, required),
        })}
      >
        {hasTarget && <div className="bar-fill" style={{ width: `${pct}%` }} />}
      </div>
    </div>
  )
}

function Ring({ value, total }: { value: number; total?: number }) {
  const r = 52
  const circumference = 2 * Math.PI * r
  const pct = total ? Math.min(1, value / total) : 0
  return (
    <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle className="ring-track" cx="60" cy="60" r={r} />
      <circle
        className="ring-fill"
        cx="60" cy="60" r={r}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" className="ring-pct">{Math.round(pct * 100)}%</text>
      <text x="60" y="78" className="ring-sub">完成</text>
    </svg>
  )
}

/** 一個學程的完整進度，儀表板與試算共用。 */
export function ProgramProgress({ program, result, baseline }: {
  program: Program
  result: Evaluation
  baseline?: Evaluation
}) {
  const req = program.requirements
  const d = (pick: (e: Evaluation) => number) => (baseline ? pick(result) - pick(baseline) : undefined)
  const lost = result.totalTaken - result.totalCounted
  const remaining = req.total !== undefined ? Math.max(0, req.total - result.totalCounted) : undefined
  const unmetGroups = result.gaps.groups
  const outsideCap = req.elective !== undefined && req.electiveInMajor !== undefined
    ? req.elective - req.electiveInMajor
    : undefined

  const isMain = program.kind === '主修'
  const gaps = [
    { label: '系訂必修', gap: result.gaps.major },
    ...(isMain ? [
      { label: '系內選修', gap: result.gaps.electiveInMajor },
      { label: '選修', gap: result.gaps.elective },
      { label: '共同＋通識', gap: result.gaps.common },
      { label: '體育', gap: result.pe.gap },
    ] : []),
  ].filter((g) => g.gap > 0)
  const chips = [...gaps.map((g) => `${g.label} −${g.gap}`), ...unmetGroups.map((name) => `${name}未達標`)]

  return (
    <div className="stack">
      <div className="hero">
        <Ring value={result.totalCounted} total={req.total} />
        <div className="hero-body">
          <div className="hero-label">
            {isMain ? '畢業學分' : `${program.kind}學分`}
            {lost > 0 && <Info text={`實修 ${result.totalTaken} 學分，其中 ${lost} 學分因超修上限不計入`} />}
          </div>
          <div className="hero-value">
            <strong>{result.totalCounted}</strong>
            {req.total !== undefined && <span className="of">/ {req.total}</span>}
            <Delta value={d((e) => e.totalCounted)} />
          </div>
          {remaining !== undefined && (
            <div className={remaining === 0 && unmetGroups.length === 0 ? 'hero-remaining ok' : 'hero-remaining'}>
              {remaining > 0 ? `還差 ${remaining} 學分` : unmetGroups.length > 0 ? '學分夠了，模組還沒達標' : '已達標'}
            </div>
          )}
          {chips.length > 0 && (
            <div className="gap-chips">
              {chips.map((text) => <span key={text} className="gap-chip">{text}</span>)}
            </div>
          )}
        </div>
      </div>

      {program.kind === '學程' ? null : !isMain ? (
        <div className="tiles">
          {req.major !== undefined && (
            <StatTile tone="major" label="系訂必修" value={result.counted.major} required={req.major} delta={d((e) => e.counted.major)} />
          )}
          <StatTile
            tone="in" label="選修課程"
            value={result.counted.electiveInMajor}
            delta={d((e) => e.counted.electiveInMajor)}
            info={program.kind === '輔系'
              ? '該系開的課；依學期先後分給輔系，湊滿門檻後其餘仍算主修選修'
              : '該系開的非必修課，含指定選修'}
          />
        </div>
      ) : (
      <div className="tiles">
        <StatTile tone="major" label="系訂必修" value={result.counted.major} required={req.major} delta={d((e) => e.counted.major)} />
        <StatTile tone="elective" label="選修合計" value={result.counted.elective} required={req.elective} delta={d((e) => e.counted.elective)} />
        <StatTile
          tone="in" label="系內選修"
          value={result.counted.electiveInMajor} required={req.electiveInMajor}
          delta={d((e) => e.counted.electiveInMajor)}
          info="選修中至少要有這麼多學分是本系（含研究所）開的課"
        />
        <StatTile
          tone="out" label="系外選修"
          value={result.counted.electiveOutside}
          delta={d((e) => e.counted.electiveOutside)}
          info={`${outsideCap !== undefined ? `最多採計 ${outsideCap} 學分。` : ''}含必修抵免餘數與外文超修`}
        />
        <StatTile
          tone="common" label="共同＋通識"
          value={result.counted.common} required={req.common}
          delta={d((e) => e.counted.common)}
          info="國文、外文、通識合計。國文最多 6、通識最多 15、兩者合計最多 18"
        />
        <StatTile
          tone="pe" label="體育"
          value={result.pe.taken} required={req.pe}
          delta={d((e) => e.pe.taken)}
          info="必修但不計入畢業總學分"
        />
      </div>
      )}
    </div>
  )
}
