import { useEffect, useState } from 'react'
import {
  ALLIANCE_CREDITS, ALLIANCE_SCHOOLS,
  type AllianceSchool, type Program, type RequiredCourse,
} from '../../core/types'
import { Info } from './Progress'

type Kind = '輔系' | '雙主修'

type Plan = {
  total: number | null
  /** 合計是範圍或附帶條件時的原文，如「20-21 學分（含必修…）」 */
  totalText?: string
  /** all：表上列的是必修，其餘由該系課程補足；pick：表上是一份可選清單 */
  mode?: 'all' | 'pick'
  listedCredits?: number
  /** 已停止受理申請的學程 */
  closed?: string
  /** 課架表分得出必修與選修（臺師大）；分不出來時科目只能當一份可選清單 */
  grouped?: boolean
  requiredCredits?: number
  electiveCredits?: number
  courses: { name: string; credits: number; group?: string }[]
}

type DeptEntry = { dept: string } & Partial<Record<Kind, Plan>>

type SchoolEntry = {
  school: AllianceSchool
  year: string
  source: string
  sourceUrl?: string
  /** 該校對這份文件的稱呼：臺科大叫應修科目表、臺師大叫課程架構表 */
  docName?: string
  note: string
  programs: DeptEntry[]
}

type AllianceData = { updated: string; schools: SchoolEntry[] }

let cache: Promise<AllianceData> | null = null
function loadData(): Promise<AllianceData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/alliance-programs.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<AllianceData>
    })
    .catch((err) => {
      cache = null
      throw err
    })
  return cache
}

export function loadAlliance(): Promise<SchoolEntry[]> {
  return loadData().then((d) => d.schools)
}

/** 科目表只列課名，沒有臺大這邊的課號與識別碼，所以以課名比對。 */
function toRequired(c: { name: string; credits: number; group?: string }): RequiredCourse {
  return {
    code: '', identifier: '', name: c.name, credits: c.credits,
    ...(c.group ? { group: c.group } : {}),
    scope: '不限本院(系)課程',
  }
}

/** 課架表分得出必修與選修時，把兩者做成各自有學分門檻的模組，必修才會被當成門檻檢查。 */
function groupsOf(plan: Plan | undefined): NonNullable<Program['requiredGroups']> | undefined {
  if (!plan?.grouped) return undefined
  const groups = [
    ...(plan.requiredCredits ? [{ name: '必修', minCredits: plan.requiredCredits }] : []),
    ...(plan.electiveCredits ? [{ name: '選修', minCredits: plan.electiveCredits }] : []),
  ]
  return groups.length > 0 ? groups : undefined
}

function noteFor(school: SchoolEntry, dept: string, kind: Kind, plan: Plan | undefined): string {
  const range = ALLIANCE_CREDITS[school.school][kind]
  const bound = range.max ? `${range.min}–${range.max}` : `至少 ${range.min}`
  if (!plan) {
    return `${school.school}${dept}沒有公告的${kind}科目表，${school.school}各系${kind}${bound} 學分。${school.note}`
  }
  if (plan.closed) return `${school.school}已停止受理申請修讀${dept}${kind}；仍在修習者請依入學當年度的應修科目表。`
  const listed = plan.mode === 'all'
    ? `表上 ${plan.courses.length} 科為必修（${plan.listedCredits} 學分），其餘由該系開設的課程補足。`
    : `表上 ${plan.courses.length} 科為可採計範圍，湊滿應修學分即可。`
  return `${school.year} 學年度${school.school}${dept}${kind}${school.docName ?? '應修科目表'}：應修 ${plan.totalText ?? `${plan.total} 學分`}。${listed}` +
    `能不能與本系科目兼充，由原就讀校系與加修學系認定；本系系訂必修不得兼充輔系科目。`
}

function derive(
  school: SchoolEntry, dept: string, kind: Kind, plan: Plan | undefined, program: Program,
): Program {
  const fallback = ALLIANCE_CREDITS[school.school][kind].min
  // 換系之後舊的抵免、模組規定都不適用；留著會套用到新清單
  const { source, requiredCourses, requiredMode, waivers, requiredGroups, groupRules, outsideRules,
    unverifiedSubjects, ...rest } = program
  const unverified = !plan || plan.courses.length === 0
    ? `${school.school}${dept}沒有公告的${kind}科目表，工具把識別碼開頭是 ${school.school === '臺師大' ? 'TA' : 'TB'} 的課都先算進來，其中不屬於這個系的課請自行改成不計入。`
    : (plan.mode ?? 'all') === 'all'
      ? `科目表上的 ${plan.courses.length} 科是必修，其餘學分由該系開設的課程自由補足；工具無法從臺大的識別碼判斷是不是這個系開的課。`
      : plan.grouped
        ? undefined
        : '課架表把必修與選修列在同一份清單，工具只比得出學分總數；必修是否修齊請自行對照課架表。'

  return {
    ...rest,
    ...(unverified ? { unverifiedSubjects: unverified } : {}),
    name: `${school.school}${dept}`,
    deptPrefix: '',
    crossSchool: school.school,
    requirements: { total: plan?.total ?? fallback },
    ...(plan && plan.courses.length > 0
      ? {
        requiredCourses: plan.courses.map(toRequired),
        requiredMode: plan.mode ?? 'all',
        ...(groupsOf(plan) ? { requiredGroups: groupsOf(plan) } : {}),
      }
      : {}),
    requiredNote: noteFor(school, dept, kind, plan),
    source: { year: school.year, deptCode: `${school.school}|${dept}`, kind: '跨校' },
  }
}

const derivedFields = (p: Program) =>
  JSON.stringify([p.name, p.requiredCourses, p.requiredMode, p.requiredNote, p.crossSchool,
    p.unverifiedSubjects, p.requiredGroups])

/** 跨校資料更新後，已選的跨校雙主修、輔系換成新的科目表（門檻數字不覆蓋，使用者可能改過）。 */
export function refreshAlliance(programs: Program[], schools: SchoolEntry[]): Program[] | null {
  let changed = false
  const next = programs.map((program) => {
    if (program.source?.kind !== '跨校') return program
    const [schoolName, dept] = (program.source.deptCode ?? '').split('|')
    const school = schools.find((s) => s.school === schoolName)
    const kind = program.kind === '雙主修' || program.kind === '輔系' ? program.kind : undefined
    if (!school || !dept || !kind) return program
    const plan = school.programs.find((p) => p.dept === dept)?.[kind]
    const fresh = { ...derive(school, dept, kind, plan, program), requirements: program.requirements }
    if (derivedFields(fresh) === derivedFields(program)) return program
    changed = true
    return fresh
  })
  return changed ? next : null
}

type Props = { program: Program; onChange(p: Program): void }

/**
 * 跨校修讀雙主修或輔系（臺大系統）。依跨校辦法第三條，修讀科目與學分數依加修校系的規定，
 * 所以選了學校與學系之後直接帶入該校公告的應修科目表。
 */
export function AlliancePicker({ program, onChange }: Props) {
  const kind = program.kind as Kind
  const [schools, setSchools] = useState<SchoolEntry[] | null>(null)
  const [updated, setUpdated] = useState('')
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    loadData()
      .then((d) => {
        setSchools(d.schools)
        setUpdated(d.updated)
      })
      .catch(() => setError(true))
  }, [attempt])

  const school = schools?.find((s) => s.school === program.crossSchool)
  const dept = program.source?.kind === '跨校' ? (program.source.deptCode ?? '').split('|')[1] : undefined
  const plan = dept ? school?.programs.find((p) => p.dept === dept)?.[kind] : undefined

  const pickSchool = (value: string) => {
    if (!value) {
      const { crossSchool, source, requiredCourses, requiredMode, requiredNote, waivers, ...rest } = program
      onChange(rest)
      return
    }
    const { source, requiredCourses, requiredMode, requiredNote, waivers, requiredGroups, groupRules, ...rest } = program
    onChange({
      ...rest,
      crossSchool: value as AllianceSchool,
      name: '',
      deptPrefix: '',
      requirements: { total: ALLIANCE_CREDITS[value as AllianceSchool][kind].min },
    })
  }

  return (
    <div className="stack-sm">
      <label className="field">
        <span className="field-label">
          修讀學校
          <Info text="臺大系統三校可互相跨校修讀雙主修與輔系；跨校課程以識別碼開頭辨認（TA 臺師大、TB 臺科大）" />
        </span>
        <select value={program.crossSchool ?? ''} onChange={(e) => pickSchool(e.target.value)}>
          <option value="">本校（臺大）</option>
          {ALLIANCE_SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      {program.crossSchool && error && (
        <div className="notice warn stack-xs">
          <div>跨校資料載入失敗，可能是網路不穩。</div>
          <div>
            <button className="btn primary small" onClick={() => { setError(false); setAttempt((n) => n + 1) }}>重試</button>
          </div>
        </div>
      )}

      {school && (
        <label className="field">
          <span className="field-label">加修學系</span>
          <select
            value={dept ?? ''}
            onChange={(e) => {
              const d = e.target.value
              const entry = school.programs.find((p) => p.dept === d)
              if (entry) onChange(derive(school, d, kind, entry[kind], program))
            }}
          >
            <option value="" disabled>請選擇學系</option>
            {school.programs.map((p) => {
              const item = p[kind]
              if (!item) return <option key={p.dept} value={p.dept}>{p.dept}（沒有{kind}課架）</option>
              const closed = item.closed ? '（已停招）' : ''
              const credits = item.total ? `${item.total} 學分` : '依該系公告'
              return <option key={p.dept} value={p.dept}>{p.dept}（{credits}）{closed}</option>
            })}
          </select>
        </label>
      )}

      {school && dept && (
        <div className="source-summary">
          <div className="source-stats">
            <span><b>{plan?.total ?? ALLIANCE_CREDITS[school.school][kind].min}</b>應修學分</span>
            {plan && plan.courses.length > 0
              ? <span><b>{plan.courses.length}</b>清單科目</span>
              : <span className="warn-text">尚無科目清單，需自行核對</span>}
          </div>
          <p className="rule-text">{program.requiredNote}</p>
          {plan?.closed && <div className="warn-text small">這個{kind}已停止受理申請，資料僅供仍在修習者對照。</div>}
          {(!plan || plan.courses.length === 0) && (
            <>
              <div className="warn-text small">
                沒有科目清單時，工具會把識別碼開頭是 {school.school === '臺師大' ? 'TA' : 'TB'} 的課都先算進這個{kind}；
                其中不屬於這個系的課，請到「課程」改成不計入。進度只會顯示「學分夠了，科目未驗證」。
              </div>
              {school.sourceUrl && (
                <p className="muted small">
                  <a href={school.sourceUrl} target="_blank" rel="noreferrer">開啟{school.source} ↗</a>
                </p>
              )}
            </>
          )}
          {updated && <p className="muted small">依 {school.source}（{school.year} 學年度）整理於 {updated}，以加修學系審核為準。</p>}
        </div>
      )}
    </div>
  )
}
