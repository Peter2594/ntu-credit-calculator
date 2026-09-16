import { useState, type FormEvent } from 'react'
import { evaluateAll } from '../../core/engine'
import { reclassifyAll, setCategory } from '../../core/courses'
import type { AppState } from '../../core/storage'
import { CATEGORIES, type Category, type Course } from '../../core/types'
import type { Actions } from '../App'
import { SEMESTER_PATTERN, categoryLabel, newId } from '../constants'
import { ProgramProgress } from './Progress'
import { CategoryField, withChoice, type CategoryChoice } from './CategoryField'

type Props = { state: AppState; actions: Actions }

/**
 * 試算課程只活在這個畫面的記憶體裡，不寫入存檔 ——
 * 使用者「如果修這幾門會怎樣」的假設，不該污染真正的課程清單。
 */
export function TrialView({ state, actions }: Props) {
  const { programs, courses } = state
  const [trial, setTrial] = useState<Course[]>([])
  const [name, setName] = useState('')
  const [credits, setCredits] = useState('3')
  const [identifier, setIdentifier] = useState('')
  const [semester, setSemester] = useState('')
  const [choice, setChoice] = useState<CategoryChoice>('')

  if (programs.length === 0) {
    return <p className="empty">先到「學程設定」新增學程，才能試算。</p>
  }

  const classified = reclassifyAll(trial, programs)
  const baseline = evaluateAll(courses, programs)
  const after = evaluateAll([...courses, ...classified], programs)
  const creditNum = Number(credits)
  const valid = name.trim() !== '' && Number.isFinite(creditNum) && creditNum >= 0

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setTrial((t) => [...t, withChoice({
      id: newId(),
      name: name.trim(),
      credits: creditNum,
      semester: '',
      ...(identifier.trim() ? { identifier: identifier.trim().toUpperCase() } : {}),
      assignments: [],
      overridden: false,
    }, choice, programs)])
    setName('')
    setIdentifier('')
  }

  const update = (id: string, programId: string, category: Category) =>
    setTrial(() => classified.map((c) => (c.id === id ? setCategory(c, programId, category) : c)))

  const moveToSchedule = () => {
    if (!SEMESTER_PATTERN.test(semester)) return
    actions.addCourses(classified.map((c) => ({ ...c, semester })))
    setTrial([])
  }

  return (
    <section className="stack">
      <div className="section-head">
        <h2>試算</h2>
      </div>

      <form className="card stack-sm" onSubmit={add}>
        <div className="grid-4">
          <label className="field span-2">
            <span className="field-label">課名</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：作業研究" />
          </label>
          <label className="field">
            <span className="field-label">學分</span>
            <input type="number" min={0} inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">識別碼</span>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="選填" />
          </label>
          <CategoryField value={choice} onChange={setChoice} />
        </div>
        <div className="row">
          <button type="submit" className="btn primary" disabled={!valid}>加入試算</button>
        </div>
      </form>

      {classified.length > 0 && (
        <div className="stack-sm">
          <ul className="course-list">
            {classified.map((c) => (
              <li key={c.id} className="course">
                <div className="course-main">
                  <div className="course-name">{c.name}</div>
                  <div className="course-meta muted">
                    <span>{c.credits} 學分</span>
                    {c.identifier && <span className="mono">{c.identifier}</span>}
                  </div>
                </div>
                <div className="course-controls">
                  {programs.map((p) => (
                    <label key={p.id} className="inline-field">
                      {programs.length > 1 && <span className="muted">{p.name || p.kind}</span>}
                      <select
                        value={c.assignments.find((a) => a.programId === p.id)?.category ?? '一般選修'}
                        onChange={(e) => update(c.id, p.id, e.target.value as Category)}
                        aria-label={`${c.name} 在 ${p.name || p.kind} 的分類`}
                      >
                        {CATEGORIES.map((k) => <option key={k} value={k}>{categoryLabel(k)}</option>)}
                      </select>
                    </label>
                  ))}
                  <button
                    className="btn ghost small danger-text"
                    onClick={() => setTrial(classified.filter((x) => x.id !== c.id))}
                  >
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <label className="inline-field">
              <span className="muted">放進學期</span>
              <input
                className="semester-input"
                placeholder="115-2"
                value={semester}
                onChange={(e) => setSemester(e.target.value.trim())}
                aria-label="要放進課表的學期"
              />
            </label>
            <button className="btn" disabled={!SEMESTER_PATTERN.test(semester)} onClick={moveToSchedule}>
              全部加入課表
            </button>
            <button className="btn ghost" onClick={() => setTrial([])}>清空試算</button>
          </div>
        </div>
      )}

      {programs.map((p) => (
        <article className="card" key={p.id}>
          <div className="card-head">
            <h3>{p.name || '未命名學程'}</h3>
            <span className="chip">{p.kind}</span>
          </div>
          <ProgramProgress
            program={p}
            baseline={baseline.get(p.id)!}
            result={after.get(p.id)!}
          />
        </article>
      ))}
    </section>
  )
}
