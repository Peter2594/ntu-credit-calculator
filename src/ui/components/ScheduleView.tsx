import { useState, type FormEvent } from 'react'
import { findConflicts } from '../../core/conflicts'
import type { AppState } from '../../core/storage'
import type { Course, Slot } from '../../core/types'
import type { Actions } from '../App'
import { DAYS, DAY_LABEL, PERIODS, SEMESTER_PATTERN, formatSlots, isPlanned, newId } from '../constants'
import { CategoryField, withChoice, type CategoryChoice } from './CategoryField'
import type { Program } from '../../core/types'

type Props = { state: AppState; actions: Actions }

/** 下一個學期：取已有課程的最新學期往後推一期。 */
function defaultSemester(courses: Course[]): string {
  const latest = courses.map((c) => c.semester).filter((s) => SEMESTER_PATTERN.test(s)).sort().pop()
  const planned = courses.filter(isPlanned).map((c) => c.semester).sort().pop()
  if (planned) return planned
  if (!latest) return '115-1'
  const [year, term] = latest.split('-').map(Number) as [number, number]
  return term === 1 ? `${year}-2` : `${year + 1}-1`
}

export function ScheduleView({ state, actions }: Props) {
  const [semester, setSemester] = useState(() => defaultSemester(state.courses))
  const planned = state.courses.filter((c) => isPlanned(c) && c.semester === semester)
  const conflicts = findConflicts(planned)
  const semesters = [...new Set([semester, ...state.courses.filter(isPlanned).map((c) => c.semester)])].sort()

  const conflictCells = new Set(
    conflicts.flatMap((x) => x.periods.map((p) => `${x.day}-${p}`)),
  )
  const cell = (day: Slot['day'], period: string) =>
    planned.filter((c) => c.slots?.some((s) => s.day === day && s.periods.includes(period)))

  return (
    <section className="stack">
      <div className="section-head row between wrap">
        <h2>課表</h2>
        <label className="inline-field">
          <span className="muted">學期</span>
          <input
            className="semester-input"
            list="semester-options"
            value={semester}
            onChange={(e) => setSemester(e.target.value.trim())}
            aria-label="學期"
          />
          <datalist id="semester-options">
            {semesters.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>
      </div>

      {!SEMESTER_PATTERN.test(semester) && (
        <p className="notice warn">學期格式是「學年-學期」，例如 115-1。</p>
      )}

      {conflicts.length > 0 && (
        <div className="notice warn">
          <strong>衝堂 {conflicts.length} 處：</strong>
          <ul>
            {conflicts.map((x, i) => (
              <li key={i}>
                {x.a.name} ↔ {x.b.name}（星期{DAY_LABEL[x.day]} 第 {x.periods.join('、')} 節）
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="timetable-wrap">
        <table className="timetable">
          <thead>
            <tr>
              <th scope="col" className="period-col">節</th>
              {DAYS.map((d) => <th key={d.id} scope="col">{d.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="period-col">
                  <span className="period-id">{p.id}</span>
                  <span className="period-time">{p.time}</span>
                </th>
                {DAYS.map((d) => {
                  const here = cell(d.id, p.id)
                  const clash = conflictCells.has(`${d.id}-${p.id}`)
                  return (
                    <td key={d.id} className={clash ? 'slot clash' : here.length ? 'slot filled' : 'slot'}>
                      {here.map((c) => (
                        <span key={c.id} className="slot-name">{c.name}</span>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddCourseForm
        semester={semester}
        disabled={!SEMESTER_PATTERN.test(semester)}
        programs={state.programs}
        onAdd={(c) => actions.addCourses([c])}
      />

      {planned.length > 0 && (
        <div className="stack-sm">
          <h3>{semester} 已排 {planned.length} 門、{planned.reduce((s, c) => s + c.credits, 0)} 學分</h3>
          <ul className="course-list">
            {planned.map((c) => (
              <li key={c.id} className="course">
                <div className="course-main">
                  <div className="course-name">{c.name}</div>
                  <div className="course-meta muted">
                    <span>{c.credits} 學分</span>
                    <span>{formatSlots(c.slots) || '未排時段'}</span>
                    {c.slots?.[0]?.room && <span>{c.slots[0].room}</span>}
                    {c.identifier && <span className="mono">{c.identifier}</span>}
                  </div>
                </div>
                <button className="btn ghost small danger-text" onClick={() => actions.deleteCourse(c.id)}>
                  移除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function AddCourseForm({ semester, disabled, programs, onAdd }: {
  semester: string
  disabled: boolean
  programs: Program[]
  onAdd(c: Course): void
}) {
  const [category, setCategory] = useState<CategoryChoice>('')
  const [name, setName] = useState('')
  const [credits, setCredits] = useState('3')
  const [identifier, setIdentifier] = useState('')
  const [room, setRoom] = useState('')
  const [slots, setSlots] = useState<Slot[]>([{ day: 1, periods: [] }])

  const toggle = (index: number, period: string) =>
    setSlots((all) => all.map((s, i) => {
      if (i !== index) return s
      const periods = s.periods.includes(period)
        ? s.periods.filter((p) => p !== period)
        : PERIODS.map((x) => x.id).filter((id) => id === period || s.periods.includes(id))
      return { ...s, periods }
    }))

  const creditNum = Number(credits)
  const valid = name.trim() !== '' && Number.isFinite(creditNum) && creditNum >= 0 && !disabled

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const usable = slots
      .filter((s) => s.periods.length > 0)
      .map((s) => (room.trim() ? { ...s, room: room.trim() } : s))
    onAdd(withChoice({
      id: newId(),
      name: name.trim(),
      credits: creditNum,
      semester,
      ...(identifier.trim() ? { identifier: identifier.trim().toUpperCase() } : {}),
      assignments: [],
      overridden: false,
      slots: usable,
    }, category, programs))
    setName('')
    setIdentifier('')
    setRoom('')
    setSlots([{ day: 1, periods: [] }])
  }

  return (
    <form className="card stack-sm" onSubmit={submit}>
      <h3>加入課程到 {semester}</h3>
      <div className="grid-4">
        <label className="field span-2">
          <span className="field-label">課名</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">學分</span>
          <input type="number" min={0} inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">識別碼</span>
          <input placeholder="例：705 31300" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </label>
        <CategoryField value={category} onChange={setCategory} />
        <label className="field">
          <span className="field-label">教室</span>
          <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="選填" />
        </label>
      </div>

      {slots.map((slot, i) => (
        <fieldset key={i} className="slot-picker">
          <legend className="field-label">時段 {slots.length > 1 ? i + 1 : ''}</legend>
          <div className="row wrap tight">
            <select
              value={slot.day}
              onChange={(e) => setSlots((all) => all.map((s, j) => (j === i ? { ...s, day: Number(e.target.value) as Slot['day'] } : s)))}
              aria-label="星期"
            >
              {DAYS.map((d) => <option key={d.id} value={d.id}>星期{d.label}</option>)}
            </select>
            {slots.length > 1 && (
              <button type="button" className="btn ghost small" onClick={() => setSlots((all) => all.filter((_, j) => j !== i))}>
                移除時段
              </button>
            )}
          </div>
          <div className="period-chips" role="group" aria-label="節次">
            {PERIODS.map((p) => (
              <button
                type="button"
                key={p.id}
                className={slot.periods.includes(p.id) ? 'chip-toggle on' : 'chip-toggle'}
                aria-pressed={slot.periods.includes(p.id)}
                onClick={() => toggle(i, p.id)}
              >
                {p.id}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="row wrap">
        <button type="button" className="btn ghost" onClick={() => setSlots((all) => [...all, { day: 1, periods: [] }])}>
          ＋ 再加一個時段
        </button>
        <button type="submit" className="btn primary" disabled={!valid}>加入課表</button>
      </div>
    </form>
  )
}
