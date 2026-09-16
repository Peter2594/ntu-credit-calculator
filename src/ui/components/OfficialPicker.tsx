import { useEffect, useState } from 'react'
import type { Program, ProgramKind, Requirements } from '../../core/types'
import { withGraduatePrefix } from '../../core/classify'
import { loadYear, loadYears, officialPageUrl, type OfficialDept, type OfficialYear } from '../officialData'
import type { ChinesePlan } from '../../core/curri'
import { Info } from './Progress'

/** 把「國文 6＋通識 12」「國文 3＋通識 15」合成一組上限，學生不必自己選方案。 */
function chineseGenEdCaps(plans: ChinesePlan[]) {
  if (plans.length === 0) return {}
  return {
    chinese: Math.max(...plans.map((p) => p.chinese)),
    genEd: Math.max(...plans.map((p) => p.genEd)),
    chineseGenEd: Math.max(...plans.map((p) => p.chinese + p.genEd)),
  }
}

/** 台大輔系辦法的最低學分；各系可能要求更多或指定科目。 */
export const MINOR_MIN_CREDITS = 20

/**
 * 官方資料只有主修規定。雙主修須修畢加修學系的系訂必修，其餘共同必修、通識在主修採計；
 * 輔系則是至少 20 學分的該系課程，不套用主修必修清單。
 */
function requirementsFor(kind: ProgramKind, d: OfficialDept): Pick<Program, 'requirements' | 'requiredCourses'> {
  if (kind === '主修') {
    return { requirements: { ...d.requirements, ...chineseGenEdCaps(d.chinesePlans) }, requiredCourses: d.requiredCourses }
  }
  if (kind === '雙主修') {
    const major = d.requirements.major
    const requirements: Requirements = major === undefined ? {} : { major, total: major }
    return { requirements, requiredCourses: d.requiredCourses }
  }
  return { requirements: { total: MINOR_MIN_CREDITS }, requiredCourses: [] }
}

type Props = { program: Program; onChange(p: Program): void }

/** 入學年度 → 學系兩層下拉，選定後帶入門檻與系訂必修。 */
export function OfficialPicker({ program, onChange }: Props) {
  const [years, setYears] = useState<string[] | null>(null)
  const [year, setYear] = useState(program.source?.year ?? '')
  const [data, setData] = useState<OfficialYear | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadYears()
      .then((ys) => {
        setYears(ys)
        setYear((y) => y || ys[0] || '')
      })
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    if (!year) return
    setData(null)
    loadYear(year).then(setData).catch(() => setError(true))
  }, [year])

  const selected = program.source?.year === year ? program.source.deptCode : ''
  // 只在下拉的年度就是帶入來源年度時才比對，避免拿到別年同代碼的系
  const dept = selected ? data?.departments.find((d) => d.code === selected) : undefined

  const apply = (d: OfficialDept) => {
    onChange({
      ...program,
      name: d.name,
      deptPrefix: withGraduatePrefix(d.deptPrefix),
      ...requirementsFor(program.kind, d),
      source: { year, deptCode: d.code, kind: program.kind },
    })
  }

  // 帶入後才改類型（例如主修改成輔系），依新類型重新套用門檻
  useEffect(() => {
    // 舊存檔沒記錄類型，當時一律以主修帶入
    if (dept && program.source && (program.source.kind ?? '主修') !== program.kind) {
      onChange({ ...program, ...requirementsFor(program.kind, dept), source: { ...program.source, kind: program.kind } })
    }
  }, [dept, program, onChange])

  if (error) {
    return <p className="notice warn">官方資料載入失敗，請在下方手動填寫門檻。</p>
  }


  const listed = program.requiredCourses?.reduce((s, c) => s + c.credits, 0) ?? 0
  const incomplete = !!program.source && program.kind !== '輔系' && listed < (program.requirements.major ?? 0)

  return (
    <div className="stack-sm">
      <div className="grid-picker">
        <label className="field">
          <span className="field-label">入學年度</span>
          <select value={year} onChange={(e) => setYear(e.target.value)} disabled={!years}>
            {!years && <option>載入中…</option>}
            {years?.map((y) => <option key={y} value={y}>{y} 學年度</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">學系</span>
          <select
            value={selected}
            disabled={!data}
            onChange={(e) => {
              const d = data?.departments.find((x) => x.code === e.target.value)
              if (d) apply(d)
            }}
          >
            <option value="" disabled>{data ? '請選擇學系' : '載入中…'}</option>
            {data?.departments.map((d) => (
              <option key={d.code} value={d.code}>{d.name}</option>
            ))}
          </select>
        </label>
      </div>

      {program.source && (
        <div className="source-summary">
          {program.kind === '主修' ? (
            <div className="source-stats">
              <span><b>{program.requirements.total ?? '—'}</b>畢業</span>
              <span><b>{program.requirements.major ?? '—'}</b>系訂必修</span>
              <span><b>{program.requirements.elective ?? '—'}</b>選修</span>
              {program.requirements.electiveInMajor !== undefined && <span><b>{program.requirements.electiveInMajor}</b>系內至少</span>}
              <span><b>{program.requirements.common ?? '—'}</b>共同＋通識</span>
            </div>
          ) : (
            <div className="source-stats">
              <span><b>{program.requirements.total ?? '—'}</b>{program.kind}學分</span>
              {program.kind === '雙主修' && <span><b>{program.requirements.major ?? '—'}</b>系訂必修</span>}
              <Info text={program.kind === '輔系'
                ? '依台大輔系辦法：輔系科目由該系指定、至少 20 學分；輔系學分不計入本系畢業學分，本系必修也不能兼充輔系。各系指定科目請查該系規定'
                : '依台大雙主修辦法：須修畢加修學系全部系訂必修及指定選修。指定選修請自行加進學分數；兩系性質相同的必修能否兼充由系上決定'} />
            </div>
          )}
          {incomplete && (
            <div className="warn-text small">必修清單只列出 {listed} 學分，部分為群組選修，請在進度頁自行標記。</div>
          )}
          <a className="small" href={officialPageUrl(program.source.year, program.source.deptCode)} target="_blank" rel="noreferrer">
            官方課程規定 ↗
          </a>
        </div>
      )}
    </div>
  )
}
