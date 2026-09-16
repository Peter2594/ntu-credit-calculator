import type { Evaluation } from '../../core/engine'
import type { Program } from '../../core/types'

type RowProps = {
  label: string
  value: number
  required?: number
  note?: string
  /** 試算時與基準相比的變化 */
  delta?: number
  big?: boolean
  /** 本來就沒有門檻的項目（如系外選修），不顯示「未設定門檻」 */
  targetless?: boolean
}

export function ProgressRow({ label, value, required, note, delta, big, targetless }: RowProps) {
  const hasTarget = required !== undefined && required > 0
  const pct = hasTarget ? Math.min(100, (value / required) * 100) : 0
  const done = hasTarget && value >= required
  const gap = hasTarget ? Math.max(0, required - value) : 0

  return (
    <div className={big ? 'progress big' : 'progress'}>
      <div className="progress-head">
        <span className="progress-label">{label}</span>
        <span className="progress-num">
          <strong>{value}</strong>
          {delta !== undefined && delta !== 0 && (
            <span className="delta">{delta > 0 ? `+${delta}` : delta}</span>
          )}
          {hasTarget && <span className="muted"> / {required}</span>}
        </span>
      </div>
      {hasTarget ? (
        <div
          className="bar"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={required}
          aria-valuenow={Math.min(value, required)}
        >
          <div className={done ? 'bar-fill done' : 'bar-fill'} style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <div className="bar no-target" />
      )}
      <div className="progress-foot">
        {hasTarget ? (
          done ? <span className="ok">✓ 已達標</span> : <span className="gap">還差 {gap} 學分</span>
        ) : (
          !targetless && <span className="muted">未設定門檻</span>
        )}
        {note && <span className="muted">{note}</span>}
      </div>
    </div>
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

  return (
    <div className="stack-sm">
      <ProgressRow
        big
        label="畢業總學分"
        value={result.totalCounted}
        required={req.total}
        delta={d((e) => e.totalCounted)}
        note={lost > 0 ? `實修 ${result.totalTaken}，其中 ${lost} 學分因超修上限不計入` : undefined}
      />
      <div className="grid-2">
        <ProgressRow label="系訂必修" value={result.counted.major} required={req.major} delta={d((e) => e.counted.major)} />
        <ProgressRow label="選修合計" value={result.counted.elective} required={req.elective} delta={d((e) => e.counted.elective)} />
        <ProgressRow
          label="系內選修"
          value={result.counted.electiveInMajor}
          required={req.electiveInMajor}
          delta={d((e) => e.counted.electiveInMajor)}
          note={req.electiveInMajor !== undefined ? '至少要修的本系選修' : undefined}
        />
        <ProgressRow
          label="系外選修"
          targetless
          value={result.counted.electiveOutside}
          delta={d((e) => e.counted.electiveOutside)}
          note={
            req.elective !== undefined && req.electiveInMajor !== undefined
              ? `最多採計 ${req.elective - req.electiveInMajor} 學分，含必修抵免與外文超修`
              : '含必修抵免與外文超修'
          }
        />
        <ProgressRow label="共同必修＋通識" value={result.counted.common} required={req.common} delta={d((e) => e.counted.common)} />
        <ProgressRow
          label="體育"
          value={result.pe.taken}
          required={req.pe}
          delta={d((e) => e.pe.taken)}
          note="不計入畢業總學分"
        />
      </div>
    </div>
  )
}
