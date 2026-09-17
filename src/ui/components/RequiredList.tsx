import { useState } from 'react'
import { requiredKey, requiredProgress, type RequiredItem } from '../../core/courses'
import type { Course, Program } from '../../core/types'
import type { Actions } from '../App'
import { isPlanned } from '../constants'
import { Info } from './Progress'

const STATUS_LABEL: Record<RequiredItem['status'], string> = {
  missing: '還沒修',
  planned: '已排課表',
  waived: '已抵免',
  done: '已修',
}

const WAIVE_ONLY = '__waive__'

type Props = {
  program: Program
  courses: Course[]
  actions: Actions
  /** 任選模式（輔系）還差的學分，來自 evaluateAll */
  pickGap?: number
  /** 學分學程還沒達標的模組 */
  unmetGroups?: string[]
}

/** 系訂必修逐門對照，讓學生直接看到還差哪幾門，並能標記抵免或免修。 */
export function RequiredList({ program, courses, actions, pickGap, unmetGroups = [] }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  if (!program.requiredCourses?.length) {
    return program.requiredNote ? (
      <div className="required-list">
        <div className="req-summary">
          <span className="req-title">{program.kind}科目</span>
          <Info text="該系沒有公告課程清單，以下為教務處公告原文，請依系上規定自行在課程頁標記" />
        </div>
        <p className="rule-text">{program.requiredNote}</p>
      </div>
    ) : null
  }

  if (program.requiredMode === 'pick') {
    const { items } = requiredProgress(courses, program)
    // 同一門課常以多個課號列出（中英文班、他系同名課），修過或已列出的課名不再重複顯示為可選
    const takenNames = new Set(items.filter((i) => i.status !== 'missing').map((i) => i.required.name))
    const options = uniqueByName(items.filter((i) => i.status === 'missing' && !takenNames.has(i.required.name)))
    return (
      <details className="required-list" open={(pickGap ?? 0) > 0 || unmetGroups.length > 0}>
        <summary>
          <span className="req-title">{program.kind}科目</span>
          {(pickGap ?? 0) > 0
            ? <strong className="gap">還差 {pickGap} 學分 · 可選 {options.length} 門</strong>
            : unmetGroups.length > 0
              ? <strong className="gap">{unmetGroups.length} 個模組未達標</strong>
              : <strong className="ok">學分已達標</strong>}
          <Info text={program.kind === '學程'
            ? `${program.requiredNote ?? ''}（模組規定僅供參考，以學程辦公室審核為準）`
            : `從該系系訂必修中任選，湊滿學分即可（依教務處公告推定）${program.requiredNote ? `。公告原文：${program.requiredNote}` : ''}`} />
        </summary>
        {groupItems(items).map(([group, list]) => {
          const rule = program.requiredGroups?.find((g) => g.name === group)
          const got = list.filter((i) => i.status === 'done' || i.status === 'planned')
          // 修過的課以成績單學分為準，清單學分可能是推估
          const credits = got.reduce((s, i) => s + (i.course?.credits ?? i.required.credits), 0)
          return (
            <div key={group || '-'} className="req-group">
              {group && (
                <div className="req-group-head">
                  <span className="req-title">{group}</span>
                  <span className="muted">已修 {credits} 學分 · {got.length} 門</span>
                  {rule && <GroupBadge rule={rule} credits={credits} count={got.length} />}
                </div>
              )}
              <ul className="req-items">
                {[
                  ...list.filter((i) => i.status !== 'missing'),
                  ...uniqueByName(list.filter((i) => i.status === 'missing' && !takenNames.has(i.required.name))),
                ].map((i) => (
                  <li key={requiredKey(i.required) + i.required.name} className={`req-item ${i.status === 'missing' ? 'option' : i.status}`}>
                    <span className={`req-status ${i.status === 'missing' ? 'option' : i.status}`}>
                      {i.status === 'missing' ? '可選' : STATUS_LABEL[i.status]}
                    </span>
                    <span className="req-name">{i.required.name}</span>
                    <span className="muted req-credits">{i.course?.credits ?? i.required.credits} 學分</span>
                    <span className="req-action" />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </details>
    )
  }

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
                ? `以 ${i.course.name} 抵免${i.course.credits > i.required.credits ? `，餘 ${i.course.credits - i.required.credits} 學分計入選修` : ''}`
                : '免修'}
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
        <span className="req-title">系訂必修清單</span>
        {missing.length > 0
          ? <strong className="gap">還差 {missing.length} 門 · {missingCredits} 學分</strong>
          : <strong className="ok">全部完成</strong>}
        <Info text="課號不同的抵免按「抵免」指定用哪門課抵，學分多出的部分計入選修；免修不增加學分" />
        {planned.length > 0 && <span className="muted"> · {planned.length} 門已排課表</span>}
      </summary>

      <ul className="req-items">{[...missing, ...planned, ...settled].map(renderItem)}</ul>

      {extras.length > 0 && (
        <p className="req-note">尚未指定抵哪一門：{extras.map((c) => c.name).join('、')}</p>
      )}
    </details>
  )
}

function groupItems(items: RequiredItem[]): [string, RequiredItem[]][] {
  const groups = new Map<string, RequiredItem[]>()
  for (const i of items) {
    const key = i.required.group ?? ''
    groups.set(key, [...(groups.get(key) ?? []), i])
  }
  return [...groups.entries()]
}

function uniqueByName(items: RequiredItem[]): RequiredItem[] {
  const seen = new Set<string>()
  return items.filter((i) => !seen.has(i.required.name) && seen.add(i.required.name))
}

type GroupRule = NonNullable<Program['requiredGroups']>[number]

function GroupBadge({ rule, credits, count }: { rule: GroupRule; credits: number; count: number }) {
  const lacks: string[] = []
  if (rule.minCourses !== undefined && count < rule.minCourses) lacks.push(`差 ${rule.minCourses - count} 門`)
  if (rule.minCredits !== undefined && credits < rule.minCredits) lacks.push(`差 ${rule.minCredits - credits} 學分`)
  const over = (rule.maxCourses !== undefined && count > rule.maxCourses) || (rule.maxCredits !== undefined && credits > rule.maxCredits)
  if (over) {
    const cap = rule.maxCourses !== undefined ? `${rule.maxCourses} 門` : `${rule.maxCredits} 學分`
    return <span className="badge gap">超過上限（至多 {cap}）</span>
  }
  if (lacks.length > 0) return <span className="badge gap">{lacks.join('、')}</span>
  if (rule.minCourses !== undefined || rule.minCredits !== undefined) return <span className="badge ok">達標</span>
  const cap = rule.maxCourses !== undefined ? `至多 ${rule.maxCourses} 門` : rule.maxCredits !== undefined ? `至多 ${rule.maxCredits} 學分` : ''
  return cap ? <span className="chip">{cap}</span> : null
}
