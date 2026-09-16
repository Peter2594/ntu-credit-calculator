import { computeGpa, type GpaSummary } from '../../core/gpa'
import type { AppState } from '../../core/storage'
import { Info } from './Progress'

export const fmtGpa = (v: number | null) => (v === null ? '—' : v.toFixed(2))

function Figure({ label, summary, info }: { label: string; summary: GpaSummary; info?: string }) {
  return (
    <div className="gpa-figure">
      <div className="tile-label">{label}{info && <Info text={info} />}</div>
      <div className="gpa-main">
        <strong>{fmtGpa(summary.ntu)}</strong>
        <span className="of">/ 4.3</span>
      </div>
      <div className="gpa-sub">
        美制 <b>{fmtGpa(summary.us)}</b> / 4.0 · {summary.credits} 學分
      </div>
    </div>
  )
}

/** 成績總覽：累計、本系、各學期 GPA。 */
export function GpaCard({ state }: { state: AppState }) {
  const main = state.programs.find((p) => p.kind === '主修') ?? state.programs[0]
  const r = computeGpa(state.courses, main?.id)
  if (r.overall.credits === 0) return null

  return (
    <article className="card">
      <div className="card-head">
        <h3>成績</h3>
        <span className="chip">實得 {r.earnedCredits} 學分</span>
        <Info text="只計有等第的課；通過、停修、抵免不列入。美制 4.0 將 A+ 視為 4.0" />
      </div>
      <div className="gpa-figures">
        <Figure label="累計 GPA" summary={r.overall} />
        {r.major.credits > 0 && (
          <Figure label="本系 GPA" summary={r.major} info={`${main?.name ?? '主修'}的系訂必修與系內選修`} />
        )}
      </div>
      {r.semesters.length > 1 && (
        <div className="gpa-terms">
          {r.semesters.map((s) => {
            // 刻度從 2.0 起算，差距才看得出來
            const pct = Math.max(6, (((s.ntu ?? 0) - 2) / 2.3) * 100)
            return (
              <div key={s.semester} className="gpa-term" title={`${s.semester}：${fmtGpa(s.ntu)}（美制 ${fmtGpa(s.us)}），${s.credits} 學分`}>
                <div className="gpa-term-bar">
                  <div style={{ height: `${pct}%` }} />
                </div>
                <b>{fmtGpa(s.ntu)}</b>
                <span>{s.semester}</span>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}
