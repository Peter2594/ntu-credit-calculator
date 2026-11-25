import { useEffect, useState } from 'react'
import type { Program, RequiredCourse, Requirements } from '../../core/types'
import { Info } from './Progress'

export type CollegeDegree = {
  code: string
  college: string
  name: string
  total: number
  /** 修業辦法的發布日期，讓使用者知道資料是哪一版 */
  published: string
  rules: string
  requirements: Requirements
  groups: NonNullable<Program['requiredGroups']>
  courses: { name: string; credits: number; group: string }[]
  /** 修業辦法自訂的通識領域限制（如管院限 A1–A4、A7、A8 中三個領域） */
  genEdDomains?: string[]
}

type CollegeDegreeData = { updated: string; degrees: CollegeDegree[] }

let cache: Promise<CollegeDegreeData> | null = null
function loadData(): Promise<CollegeDegreeData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/college-degrees.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<CollegeDegreeData>
    })
    .catch((err) => {
      cache = null
      throw err
    })
  return cache
}

export function loadCollegeDegrees(): Promise<CollegeDegree[]> {
  return loadData().then((d) => d.degrees)
}

/** 修業辦法只列課名（沒有課號與識別碼），所以一律以課名比對。 */
function toRequired(c: CollegeDegree['courses'][number]): RequiredCourse {
  return {
    code: '',
    identifier: '',
    name: c.name,
    credits: c.credits,
    group: c.group,
    scope: '不限本院(系)課程',
  }
}

/** 從院學士資料帶入的欄位。使用者自己調整的門檻數字會被覆蓋，所以只在選擇時套用。 */
function derive(d: CollegeDegree, program: Program): Program {
  return {
    ...program,
    name: d.name,
    deptPrefix: '',
    requirements: d.requirements,
    requiredCourses: d.courses.map(toRequired),
    requiredMode: 'pick',
    requiredNote: d.rules,
    requiredGroups: d.groups,
    creditRules: d.genEdDomains ? { genEdDomains: d.genEdDomains } : undefined,
    source: { year: d.published, deptCode: d.code, kind: '院學士' },
  }
}

const derivedFields = (p: Program) =>
  JSON.stringify([p.name, p.requiredCourses, p.requiredNote, p.requiredGroups, p.creditRules])

/**
 * 院學士資料是選的當下複製進瀏覽器的；法規更新後換成新的清單與規定。
 * 門檻數字使用者可能改過，不覆蓋。沒有任何變動時回傳 null。
 */
export function refreshCollegeDegrees(programs: Program[], data: CollegeDegree[]): Program[] | null {
  let changed = false
  const next = programs.map((program) => {
    const d = program.source?.kind === '院學士' ? data.find((x) => x.code === program.source?.deptCode) : undefined
    if (!d) return program
    const fresh = { ...derive(d, program), requirements: program.requirements }
    if (derivedFields(fresh) === derivedFields(program)) return program
    changed = true
    return fresh
  })
  return changed ? next : null
}

type Props = { program: Program; onChange(p: Program): void }

/** 院學士學位下拉選單：帶入應修學分、各項規定與法規列出的科目。 */
export function CollegeDegreePicker({ program, onChange }: Props) {
  const [degrees, setDegrees] = useState<CollegeDegree[] | null>(null)
  const [updated, setUpdated] = useState('')
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    loadData()
      .then((d) => {
        setDegrees(d.degrees)
        setUpdated(d.updated)
      })
      .catch(() => setError(true))
  }, [attempt])

  if (error) {
    return (
      <div className="notice warn stack-xs">
        <div>院學士資料載入失敗，可能是網路不穩。</div>
        <div>
          <button className="btn primary small" onClick={() => { setError(false); setAttempt((n) => n + 1) }}>重試</button>
        </div>
      </div>
    )
  }

  const selected = degrees?.find((d) => d.code === program.source?.deptCode && program.source?.kind === '院學士')

  return (
    <div className="stack-sm">
      <label className="field">
        <span className="field-label">
          院學士學位
          <Info text="依院學士學位暨校學士學位設置準則，修畢後可以院學士資格畢業，所以這裡算的是一整套畢業學分" />
        </span>
        <select
          value={selected?.code ?? ''}
          disabled={!degrees}
          onChange={(e) => {
            const d = degrees?.find((x) => x.code === e.target.value)
            if (d) onChange(derive(d, program))
          }}
        >
          <option value="" disabled>{degrees ? '請選擇學院' : '載入中…'}</option>
          {degrees?.map((d) => (
            <option key={d.code} value={d.code}>
              {d.college}{d.courses.length === 0 ? '（科目表待補）' : ''}
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="source-summary">
          <div className="source-stats">
            <span><b>{selected.total}</b>應修學分</span>
            <span><b>{selected.courses.length || '—'}</b>清單科目</span>
          </div>
          <p className="rule-text">{selected.rules}</p>
          <p className="muted small">
            依《{selected.name}修業辦法》{selected.published}版整理於 {updated}。
            領域專長與各組選修的課程由學院逐學期公告，清單只收法規明文列出的科目，認列與充抵由院學士學位審查小組決定。
          </p>
          {selected.courses.length === 0 && (
            <div className="warn-text small">這個學院的科目表還沒整理，目前只能看總學分與規定。</div>
          )}
        </div>
      )}
    </div>
  )
}
