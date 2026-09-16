import { useEffect, useState } from 'react'
import type { Program } from '../../core/types'
import { withGraduatePrefix } from '../../core/classify'
import { loadYear, loadYears, officialPageUrl, type OfficialDept, type OfficialYear } from '../officialData'
import type { ChinesePlan } from '../../core/curri'

/** 把「國文 6＋通識 12」「國文 3＋通識 15」合成一組上限，學生不必自己選方案。 */
function chineseGenEdCaps(plans: ChinesePlan[]) {
  if (plans.length === 0) return {}
  return {
    chinese: Math.max(...plans.map((p) => p.chinese)),
    genEd: Math.max(...plans.map((p) => p.genEd)),
    chineseGenEd: Math.max(...plans.map((p) => p.chinese + p.genEd)),
  }
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

  if (error) {
    return <p className="notice warn">官方資料載入失敗，請在下方手動填寫門檻。</p>
  }

  const apply = (d: OfficialDept) => {
    onChange({
      ...program,
      name: d.name,
      deptPrefix: withGraduatePrefix(d.deptPrefix),
      requirements: {
        ...d.requirements,
        ...chineseGenEdCaps(d.chinesePlans),
      },
      requiredCourses: d.requiredCourses,
      source: { year, deptCode: d.code },
    })
  }

  const listed = program.requiredCourses?.reduce((s, c) => s + c.credits, 0) ?? 0
  const incomplete = !!program.source && listed < (program.requirements.major ?? 0)

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
          <div className="source-stats">
            <span><b>{program.requirements.total ?? '—'}</b>畢業</span>
            <span><b>{program.requirements.major ?? '—'}</b>系訂必修</span>
            <span><b>{program.requirements.elective ?? '—'}</b>選修</span>
            {program.requirements.electiveInMajor !== undefined && <span><b>{program.requirements.electiveInMajor}</b>系內至少</span>}
            <span><b>{program.requirements.common ?? '—'}</b>共同＋通識</span>
          </div>
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
