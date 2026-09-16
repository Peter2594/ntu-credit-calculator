import { useEffect, useState } from 'react'
import type { Program, RequiredCourse } from '../../core/types'
import { Info } from './Progress'

type CreditProgram = {
  code: string
  name: string
  total: number | null
  rules: string
  groups?: NonNullable<Program['requiredGroups']>
  courses: { identifier?: string; name: string; credits: number; group?: string }[]
}

let cache: Promise<CreditProgram[]> | null = null
function loadPrograms(): Promise<CreditProgram[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/programs.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<{ programs: CreditProgram[] }>
    })
    .then((d) => d.programs)
    .catch((err) => {
      cache = null
      throw err
    })
  return cache
}

/**
 * 有識別碼的課只以識別碼比對（同名課很多，避免誤判）；
 * 清單只有課名時才以課名比對。
 */
function toRequired(c: CreditProgram['courses'][number]): RequiredCourse {
  return {
    code: '',
    identifier: c.identifier ?? '',
    name: c.name,
    credits: c.credits,
    ...(c.group ? { group: c.group } : {}),
    scope: c.identifier ? '限本系課程' : '不限本院(系)課程',
  }
}

type Props = { program: Program; onChange(p: Program): void }

/** 學分學程下拉選單：帶入總學分、規定摘要與課程清單。 */
export function CreditProgramPicker({ program, onChange }: Props) {
  const [programs, setPrograms] = useState<CreditProgram[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadPrograms().then(setPrograms).catch(() => setError(true))
  }, [])

  if (error) return <p className="notice warn">學程資料載入失敗，請稍後再試。</p>

  const selected = programs?.find((p) => p.code === program.source?.deptCode && program.source?.kind === '學程')

  const apply = (p: CreditProgram) => {
    onChange({
      ...program,
      name: p.name,
      deptPrefix: '',
      requirements: p.total === null ? {} : { total: p.total },
      requiredCourses: p.courses.map(toRequired),
      requiredMode: 'pick',
      requiredNote: p.rules,
      ...(p.groups ? { requiredGroups: p.groups } : { requiredGroups: undefined }),
      source: { year: '學程', deptCode: p.code, kind: '學程' },
    })
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

      {selected && (
        <div className="source-summary">
          <div className="source-stats">
            <span><b>{selected.total ?? '—'}</b>應修學分</span>
            <span><b>{selected.courses.length || '—'}</b>清單課程</span>
            <Info text="學程學分是否計入主修畢業學分由主系認定，這裡不會從主修扣除" />
          </div>
          <p className="rule-text">{selected.rules}</p>
          {selected.courses.length === 0 && (
            <div className="warn-text small">這個學程的課程清單還沒整理，目前只能看規定與總學分。</div>
          )}
          {selected.total === null && (
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
