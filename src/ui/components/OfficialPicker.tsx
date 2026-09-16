import { useEffect, useState } from 'react'
import type { Program } from '../../core/types'
import { withGraduatePrefix } from '../../core/classify'
import { loadYear, loadYears, officialPageUrl, type OfficialDept, type OfficialYear } from '../officialData'

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

  if (error) {
    return <p className="notice warn">官方資料載入失敗，請在下方手動填寫門檻。</p>
  }

  const selected = program.source?.year === year ? program.source.deptCode : ''
  const dept = data?.departments.find((d) => d.code === program.source?.deptCode)

  const apply = (d: OfficialDept) => {
    const plan = d.chinesePlans[0]
    onChange({
      ...program,
      name: d.name,
      deptPrefix: withGraduatePrefix(d.deptPrefix),
      requirements: {
        ...d.requirements,
        ...(plan ? { chinese: plan.chinese, genEd: plan.genEd } : {}),
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
        <div className="notice ok-bg stack-xs">
          <div>
            已帶入 <strong>{program.source.year} 學年度入學 {program.name}</strong>：
            畢業 {program.requirements.total ?? '—'}、系訂必修 {program.requirements.major ?? '—'}
            （清單 {program.requiredCourses?.length ?? 0} 門）、選修 {program.requirements.elective ?? '—'}
            {program.requirements.electiveInMajor !== undefined && `（系內至少 ${program.requirements.electiveInMajor}）`}
            、共同＋通識 {program.requirements.common ?? '—'}。
          </div>
          {dept && dept.chinesePlans.length > 1 && (
            <label className="inline-field">
              <span>國文方案</span>
              <select
                value={`${program.requirements.chinese}+${program.requirements.genEd}`}
                onChange={(e) => {
                  const [chinese, genEd] = e.target.value.split('+').map(Number)
                  onChange({ ...program, requirements: { ...program.requirements, chinese, genEd } })
                }}
              >
                {dept.chinesePlans.map((p) => (
                  <option key={`${p.chinese}+${p.genEd}`} value={`${p.chinese}+${p.genEd}`}>
                    國文 {p.chinese} ＋ 通識 {p.genEd}
                  </option>
                ))}
              </select>
            </label>
          )}
          {incomplete && (
            <div className="warn-text">
              必修清單只列出 {listed} 學分，少於應修 {program.requirements.major}：
              有些必修是「群組選修」，要到「課程」自己標成系訂必修。
            </div>
          )}
          {program.requirements.electiveInMajor === undefined && (
            <div className="muted">這個系的規定沒寫明系內選修下限，有的話請在下方補上。</div>
          )}
          <a href={officialPageUrl(program.source.year, program.source.deptCode)} target="_blank" rel="noreferrer">
            對照官方課程規定 ↗
          </a>
        </div>
      )}
    </div>
  )
}
