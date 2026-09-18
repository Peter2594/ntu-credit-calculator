import { useEffect, useState } from 'react'
import type { Program, RequiredCourse } from '../../core/types'
import { Info } from './Progress'

type CreditProgram = {
  code: string
  name: string
  total: number | null
  rules: string
  groups?: NonNullable<Program['requiredGroups']>
  groupRules?: NonNullable<Program['groupRules']>
  outsideRules?: NonNullable<Program['outsideRules']>
  /** 以學程科目數為門檻時的科目數（如半導體學程 11） */
  subjects?: number
  /** 有些學程的科目對照表只列課號（如半導體學程），以課號比對 */
  courses: { identifier?: string; code?: string; name: string; credits: number; group?: string; matchName?: boolean }[]
}

type CreditProgramData = { updated: string; programs: CreditProgram[] }

let cache: Promise<CreditProgramData> | null = null
function loadData(): Promise<CreditProgramData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/programs.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<CreditProgramData>
    })
    .catch((err) => {
      cache = null
      throw err
    })
  return cache
}

export function loadPrograms(): Promise<CreditProgram[]> {
  return loadData().then((d) => d.programs)
}

/** 同一學程的不同方案共用前四碼（P590、P590L） */
const planFamily = (code: string) => code.slice(0, 4)

/**
 * 有識別碼或課號的課只以它們比對（同名課很多，避免誤判）；
 * 清單只有課名、或標明課名具辨識度（matchName）時才以課名比對。
 */
function toRequired(c: CreditProgram['courses'][number]): RequiredCourse {
  return {
    code: c.code ?? '',
    identifier: c.identifier ?? '',
    name: c.name,
    credits: c.credits,
    ...(c.group ? { group: c.group } : {}),
    scope: (c.identifier || c.code) && !c.matchName ? '限本系課程' : '不限本院(系)課程',
  }
}

/** 從學程資料帶入的欄位。抵免紀錄、規定未寫明時使用者自填的總學分不在其中。 */
function derive(p: CreditProgram, program: Program): Program {
  return {
    ...program,
    name: p.name,
    deptPrefix: '',
    requirements: p.total === null ? program.requirements : { total: p.total },
    requiredCourses: p.courses.map(toRequired),
    requiredMode: 'pick',
    requiredNote: p.rules,
    requiredGroups: p.groups,
    groupRules: p.groupRules,
    outsideRules: p.outsideRules,
    courseTarget: p.subjects,
    source: { year: '學程', deptCode: p.code, kind: '學程' },
  }
}

const derivedFields = (p: Program) =>
  JSON.stringify([p.name, p.requirements, p.requiredCourses, p.requiredNote, p.requiredGroups, p.groupRules, p.outsideRules, p.courseTarget])

/**
 * 學程資料是選的當下複製進瀏覽器的；資料更新後，已選過的學程換成新的清單與門檻。
 * 沒有任何變動時回傳 null。
 */
export function refreshCreditPrograms(programs: Program[], data: CreditProgram[]): Program[] | null {
  let changed = false
  const next = programs.map((program) => {
    const p = program.source?.kind === '學程' ? data.find((x) => x.code === program.source?.deptCode) : undefined
    if (!p) return program
    const fresh = derive(p, program)
    if (derivedFields(fresh) === derivedFields(program)) return program
    changed = true
    const hasPlans = data.some((x) => x.code !== p.code && planFamily(x.code) === planFamily(p.code))
    return hasPlans && fresh.name !== program.name ? { ...fresh, planUnconfirmed: true } : fresh
  })
  return changed ? next : null
}

type Props = { program: Program; onChange(p: Program): void }

/** 學分學程下拉選單：帶入總學分、規定摘要與課程清單。 */
export function CreditProgramPicker({ program, onChange }: Props) {
  const [programs, setPrograms] = useState<CreditProgram[] | null>(null)
  const [updated, setUpdated] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    loadData()
      .then((d) => {
        setPrograms(d.programs)
        setUpdated(d.updated)
      })
      .catch(() => setError(true))
  }, [])

  if (error) return <p className="notice warn">學程資料載入失敗，請稍後再試。</p>

  const selected = programs?.find((p) => p.code === program.source?.deptCode && program.source?.kind === '學程')

  const apply = (p: CreditProgram) => {
    onChange(derive(p, { ...program, requirements: {}, planUnconfirmed: undefined }))
  }

  return (
    <div className="stack-sm">
      <label className="field">
        <span className="field-label">學分學程</span>
        <select
          value={selected?.code ?? ''}
          disabled={!programs}
          onChange={(e) => {
            const p = programs?.find((x) => x.code === e.target.value)
            if (p) apply(p)
          }}
        >
          <option value="" disabled>{programs ? '請選擇學程' : '載入中…'}</option>
          {programs?.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} {p.name}{p.courses.length === 0 ? '（課程清單待補）' : ''}
            </option>
          ))}
        </select>
      </label>

      {selected && program.planUnconfirmed && (
        <div className="notice warn stack-xs">
          <div>這個學程後來分成幾個方案或組別，目前先套用「{selected.name}」。請確認是你修讀的方案，不是的話在上方重新選擇。</div>
          <div>
            <button className="btn primary small" onClick={() => onChange({ ...program, planUnconfirmed: undefined })}>
              沒錯，是這個方案
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div className="source-summary">
          <div className="source-stats">
            {selected.subjects !== undefined
              ? <span><b>{selected.subjects}</b>應修科目</span>
              : <span><b>{selected.total ?? '—'}</b>應修學分</span>}
            <span><b>{selected.courses.length || '—'}</b>清單課程</span>
            <Info text="學程學分是否計入主修畢業學分由主系認定，這裡不會從主修扣除" />
          </div>
          <p className="rule-text">{selected.rules}</p>
          {updated && <p className="muted small">課程清單整理於 {updated}，每學期開課會變動，以學程公告為準。</p>}
          {selected.courses.length === 0 && (
            <div className="warn-text small">這個學程的課程清單還沒整理，目前只能看規定與總學分。</div>
          )}
          {selected.total === null && selected.subjects === undefined && (
            <label className="field">
              <span className="field-label">應修學分（規定未寫明，請自行填）</span>
              <input
                type="number" min={0} inputMode="numeric"
                value={program.requirements.total ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  onChange({ ...program, requirements: e.target.value === '' || !Number.isFinite(n) ? {} : { total: n } })
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  )
}
