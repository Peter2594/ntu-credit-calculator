import { useState } from 'react'
import { requiredKey, requiredProgress, type RequiredItem } from '../../core/courses'
import type { Course, Program } from '../../core/types'
import type { Actions } from '../App'
import { isPlanned } from '../constants'

const STATUS_LABEL: Record<RequiredItem['status'], string> = {
  missing: '還沒修',
  planned: '已排課表',
  waived: '已抵免',
  done: '已修',
}

const WAIVE_ONLY = '__waive__'

type Props = { program: Program; courses: Course[]; actions: Actions }

/** 系訂必修逐門對照，讓學生直接看到還差哪幾門，並能標記抵免或免修。 */
export function RequiredList({ program, courses, actions }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  if (!program.requiredCourses?.length) return null

  const { items, missingCredits, extras } = requiredProgress(courses, program)
  const missing = items.filter((i) => i.status === 'missing')
  const planned = items.filter((i) => i.status === 'planned')
  const settled = items.filter((i) => i.status === 'waived' || i.status === 'done')

  // 可拿來抵免的課：沒被停修或不及格、還沒被其他必修用掉的課；對不到清單的必修課排最前面
  const usedIds = new Set(items.flatMap((i) => (i.course ? [i.course.id] : [])))
  const candidates = courses
    .filter((c) => !usedIds.has(c.id))
    .filter((c) => !c.assignments.some((a) => a.programId === program.id && a.category === '不計入'))
    .sort((a, b) => Number(extras.includes(b)) - Number(extras.includes(a)))

  const renderItem = (i: RequiredItem) => {
    const key = requiredKey(i.required)
    const waiver = program.waivers?.find((w) => w.key === key)
    return (
      <li key={key} className={`req-item ${i.status}`}>
        <span className={`req-status ${i.status}`}>{STATUS_LABEL[i.status]}</span>
        <span className="req-name">
          {i.required.name}
          {i.required.group && <span className="chip">群組 {i.required.group}</span>}
          {i.status === 'waived' && (
            <span className="muted req-by">
              {i.course
                ? `← ${i.course.name}（${i.course.credits} 學分${i.course.credits > i.required.credits ? `，餘 ${i.course.credits - i.required.credits} 學分計入選修` : ''}）`
                : '← 免修，不計學分'}
            </span>
          )}
        </span>
        <span className="muted req-credits">{i.required.credits} 學分</span>
        <span className="req-action">
          {waiver ? (
            <button className="btn ghost small" onClick={() => actions.unwaive(program.id, key)}>取消</button>
          ) : i.status !== 'done' && editing !== key ? (
            <button className="btn ghost small" onClick={() => setEditing(key)}>抵免</button>
          ) : null}
        </span>

        {editing === key && (
          <div className="req-waive">
            <select
              defaultValue=""
              aria-label={`用哪門課抵免 ${i.required.name}`}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                actions.waive(program.id, i.required, v === WAIVE_ONLY ? undefined : v)
                setEditing(null)
              }}
            >
              <option value="" disabled>選擇用來抵免的課…</option>
              <option value={WAIVE_ONLY}>免修（不用修，也不計學分）</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.semester} {c.name}（{c.credits} 學分{isPlanned(c) ? '，計畫中' : ''}）
                </option>
              ))}
            </select>
            <button className="btn ghost small" onClick={() => setEditing(null)}>關閉</button>
          </div>
        )}
      </li>
    )
  }

  return (
    <details className="required-list" open={missing.length > 0}>
      <summary>
        系訂必修清單：
        {missing.length > 0
          ? <strong className="gap">還差 {missing.length} 門、{missingCredits} 學分</strong>
          : <strong className="ok">清單上的課都修了、已排入或已抵免</strong>}
        {planned.length > 0 && <span className="muted">（另有 {planned.length} 門已排課表）</span>}
      </summary>

      <ul className="req-items">{[...missing, ...planned, ...settled].map(renderItem)}</ul>

      <p className="muted req-note">
        課號不同但系辦核可的抵免，按「抵免」選擇用哪門課抵：那門課改算系訂必修，學分多出的部分計入選修。
        選「免修」只會把這門從清單拿掉，不增加學分，必修學分仍需補足。
      </p>
      {extras.length > 0 && (
        <p className="muted req-note">
          手動算成系訂必修、但還沒指定抵哪一門的課：{extras.map((c) => c.name).join('、')}。
        </p>
      )}
      {items.some((i) => i.required.group) && (
        <p className="muted req-note">標「群組」的課是群組選修，同一群組通常只需修其中幾門，用不到的可以標免修。</p>
      )}
    </details>
  )
}
