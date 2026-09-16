import { requiredProgress, type RequiredItem } from '../../core/courses'
import type { Course, Program } from '../../core/types'

const STATUS_LABEL: Record<RequiredItem['status'], string> = {
  missing: '還沒修',
  planned: '已排課表',
  done: '已修',
}

/** 系訂必修逐門對照，讓學生直接看到還差哪幾門。 */
export function RequiredList({ program, courses }: { program: Program; courses: Course[] }) {
  if (!program.requiredCourses?.length) return null

  const { items, missingCredits, extras } = requiredProgress(courses, program)
  const missing = items.filter((i) => i.status === 'missing')
  const planned = items.filter((i) => i.status === 'planned')
  const done = items.filter((i) => i.status === 'done')

  return (
    <details className="required-list" open={missing.length > 0}>
      <summary>
        系訂必修清單：
        {missing.length > 0
          ? <strong className="gap">還差 {missing.length} 門、{missingCredits} 學分</strong>
          : <strong className="ok">清單上的課都修了或已排入</strong>}
        {planned.length > 0 && <span className="muted">（另有 {planned.length} 門已排課表）</span>}
      </summary>

      <ul className="req-items">
        {[...missing, ...planned, ...done].map((i) => (
          <li key={`${i.required.code}|${i.required.identifier}`} className={`req-item ${i.status}`}>
            <span className={`req-status ${i.status}`}>{STATUS_LABEL[i.status]}</span>
            <span className="req-name">
              {i.required.name}
              {i.required.group && <span className="chip">群組 {i.required.group}</span>}
            </span>
            <span className="muted mono req-code">{i.required.code}</span>
            <span className="muted req-credits">{i.required.credits} 學分</span>
          </li>
        ))}
      </ul>

      {extras.length > 0 && (
        <p className="muted req-note">
          手動算成系訂必修、但對不到清單的課：{extras.map((c) => c.name).join('、')}。
          如果是抵免，清單上被抵掉的那門仍會顯示「還沒修」，請自行對照。
        </p>
      )}
      {items.some((i) => i.required.group) && (
        <p className="muted req-note">標「群組」的課是群組選修，同一群組通常只需修其中幾門，詳見官方課程規定。</p>
      )}
    </details>
  )
}
