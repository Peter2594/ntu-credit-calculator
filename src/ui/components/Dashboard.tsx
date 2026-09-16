import { useState } from 'react'
import { evaluate } from '../../core/engine'
import { findConflicts } from '../../core/conflicts'
import type { AppState } from '../../core/storage'
import type { Tab } from '../App'
import { isPlanned } from '../constants'
import { ProgramProgress } from './Progress'

type Props = { state: AppState; goTo(tab: Tab): void }

export function Dashboard({ state, goTo }: Props) {
  const { programs, courses } = state
  const plannedCount = courses.filter(isPlanned).length
  const [includePlanned, setIncludePlanned] = useState(false)

  if (programs.length === 0) {
    return (
      <Empty
        text="還沒有設定學程。先填入系上的畢業門檻。"
        action="前往學程設定"
        onClick={() => goTo('programs')}
      />
    )
  }
  if (courses.length === 0) {
    return (
      <Empty
        text="還沒有課程資料。貼上 myNTU 的歷年成績就能看到進度。"
        action="匯入成績"
        onClick={() => goTo('courses')}
      />
    )
  }

  const counted = includePlanned ? courses : courses.filter((c) => !isPlanned(c))
  const conflicts = findConflicts(courses.filter(isPlanned))

  return (
    <section className="stack">
      <div className="section-head row between wrap">
        <h2>畢業進度</h2>
        {plannedCount > 0 && (
          <div className="segmented" role="group" aria-label="計算範圍">
            <button className={!includePlanned ? 'active' : ''} onClick={() => setIncludePlanned(false)}>
              只算已修
            </button>
            <button className={includePlanned ? 'active' : ''} onClick={() => setIncludePlanned(true)}>
              含課表 {plannedCount} 門
            </button>
          </div>
        )}
      </div>

      {conflicts.length > 0 && (
        <button className="notice warn clickable" onClick={() => goTo('schedule')}>
          課表有 {conflicts.length} 處衝堂，點此查看
        </button>
      )}

      {programs.map((p) => {
        const unconfirmed = courses.filter(
          (c) => !c.overridden && c.assignments.some((a) => a.programId === p.id && a.category === '限本系選修'),
        ).length
        return (
          <article className="card" key={p.id}>
            <div className="card-head">
              <h3>{p.name || '未命名學程'}</h3>
              <span className="chip">{p.kind}</span>
            </div>
            {unconfirmed > 0 && (
              <button className="notice clickable" onClick={() => goTo('courses')}>
                有 {unconfirmed} 門本系課預設算「限本系選修」。其中若有系訂必修，請到「課程」改掉，否則必修進度會偏低。
              </button>
            )}
            <ProgramProgress program={p} result={evaluate(counted, p)} />
          </article>
        )
      })}
    </section>
  )
}

function Empty({ text, action, onClick }: { text: string; action: string; onClick(): void }) {
  return (
    <section className="empty">
      <p>{text}</p>
      <button className="btn primary" onClick={onClick}>{action}</button>
    </section>
  )
}
