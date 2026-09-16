import { useState } from 'react'
import { evaluateAll } from '../../core/engine'
import { findConflicts } from '../../core/conflicts'
import type { AppState } from '../../core/storage'
import type { Actions, Tab } from '../App'
import { isPlanned } from '../constants'
import { isOwnDeptGenEd } from '../../core/classify'
import { ProgramProgress } from './Progress'
import { RequiredList } from './RequiredList'
import { GpaCard } from './GpaCard'

type Props = { state: AppState; actions: Actions; goTo(tab: Tab): void }

export function Dashboard({ state, actions, goTo }: Props) {
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
  const results = evaluateAll(counted, programs)

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
          課表有 {conflicts.length} 處衝堂 →
        </button>
      )}

      {programs.map((p) => {
        const hasList = (p.requiredCourses?.length ?? 0) > 0
        const unconfirmed = hasList ? 0 : courses.filter(
          (c) => !c.overridden && c.assignments.some((a) => a.programId === p.id && a.category === '限本系選修'),
        ).length
        const ownGenEd = courses.filter((c) => !c.overridden && isOwnDeptGenEd(c, p)).length
        return (
          <article className="card program-card" key={p.id}>
            <div className="card-head">
              <h3>{p.name || '未命名學程'}</h3>
              <span className="chip">{p.kind}</span>
              {p.source && <span className="chip">{p.source.year} 入學</span>}
            </div>
            {unconfirmed > 0 && (
              <button className="notice clickable" onClick={() => goTo('courses')}>
                {unconfirmed} 門本系課暫列系內選修，其中的必修請到「課程」改掉 →
              </button>
            )}
            {ownGenEd > 0 && (
              <button className="notice clickable" onClick={() => goTo('courses')}>
                {ownGenEd} 門本系開的通識課可能不採計通識，請確認 →
              </button>
            )}
            <ProgramProgress program={p} result={results.get(p.id)!} />
            <RequiredList program={p} courses={courses} actions={actions} />
          </article>
        )
      })}

      <GpaCard state={state} />
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
