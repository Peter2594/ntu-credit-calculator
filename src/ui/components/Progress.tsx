import { useState } from 'react'
import type { Evaluation } from '../../core/engine'
import type { Category, Course, Program } from '../../core/types'
import { isPlanned } from '../constants'

export type Tone = 'major' | 'in' | 'out' | 'elective' | 'common' | 'pe'

/** 說明收進圖示，滑鼠移上或聚焦時才顯示，版面保持乾淨。 */
export function Info({ text }: { text: string }) {
  return (
    <span className="info" tabIndex={0} role="img" aria-label={text} data-tip={text}>
      i
    </span>
  )
}

function Delta({ value }: { value?: number }) {
  if (value === undefined || value === 0) return null
  return <span className={value > 0 ? 'delta up' : 'delta down'}>{value > 0 ? `+${value}` : value}</span>
}

type TileProps = {
  label: string
  tone: Tone
  value: number
  required?: number
  delta?: number
  info?: string
  /** 有課程清單時整塊可以點開，看看哪些課被歸到這一類 */
  open?: boolean
  onToggle?(): void
}

export function StatTile({ label, tone, value, required, delta, info, open, onToggle }: TileProps) {
  const hasTarget = required !== undefined && required > 0
  const pct = hasTarget ? Math.min(100, (value / required) * 100) : 0
  const gap = hasTarget ? Math.max(0, required - value) : 0

  const Wrapper = onToggle ? 'button' : 'div'
  return (
    <Wrapper
      className={`tile tone-${tone}${gap > 0 ? ' short' : ''}${onToggle ? ' clickable' : ''}${open ? ' open' : ''}`}
      {...(onToggle ? { type: 'button' as const, onClick: onToggle, 'aria-expanded': !!open } : {})}
    >
      <div className="tile-head">
        <span className="tile-label">
          {label}
          {info && <Info text={info} />}
          {onToggle && <span className="tile-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>}
        </span>
      </div>
      <div className="tile-value">
        <strong>{value}</strong>
        {hasTarget && <span className="of">/ {required}</span>}
        <Delta value={delta} />
        {hasTarget && (gap === 0
          ? <span className="badge ok">達標</span>
          : <span className="badge gap">差 {gap}</span>)}
      </div>
      <div
        className={hasTarget ? 'bar' : 'bar no-target'}
        {...(hasTarget && {
          role: 'progressbar',
          'aria-label': label,
          'aria-valuemin': 0,
          'aria-valuemax': required,
          'aria-valuenow': Math.min(value, required),
        })}
      >
        {hasTarget && <div className="bar-fill" style={{ width: `${pct}%` }} />}
      </div>
    </Wrapper>
  )
}

/** 點開方塊後列出被歸到這一類的課，讓使用者確認分類對不對 */
function CourseBreakdown({ label, courses, programId, categories }: {
  label: string
  courses: Course[]
  programId: string
  categories: Category[]
}) {
  const rows = courses
    .filter((c) => c.assignments.some((a) => a.programId === programId && categories.includes(a.category)))
    .sort((a, b) => a.semester.localeCompare(b.semester) || a.name.localeCompare(b.name))
  const credits = rows.reduce((s, c) => s + c.credits, 0)

  return (
    <div className="breakdown card stack-xs">
      <div className="row between wrap">
        <strong>{label}</strong>
        <span className="muted small">{rows.length} 門 · {credits} 學分</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">沒有課程歸在這一類。</p>
      ) : (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr><th>學期</th><th>課名</th><th className="num">學分</th><th>分類</th><th>成績</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.semester}</td>
                  <td>{c.name}</td>
                  <td className="num">{c.credits}</td>
                  <td>{c.assignments.find((a) => a.programId === programId)?.category}</td>
                  <td>{isPlanned(c) ? '計畫中' : c.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Ring({ value, total }: { value: number; total?: number }) {
  const r = 52
  const circumference = 2 * Math.PI * r
  const pct = total ? Math.min(1, value / total) : 0
  return (
    <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle className="ring-track" cx="60" cy="60" r={r} />
      <circle
        className="ring-fill"
        cx="60" cy="60" r={r}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" className="ring-pct">{Math.round(pct * 100)}%</text>
      <text x="60" y="78" className="ring-sub">完成</text>
    </svg>
  )
}

/** 一個學程的完整進度，儀表板與試算共用。 */
export function ProgramProgress({ program, result, baseline, courses }: {
  program: Program
  result: Evaluation
  baseline?: Evaluation
  /** 有給課程時，方塊可以點開看哪些課被歸到那一類 */
  courses?: Course[]
}) {
  const [openTile, setOpenTile] = useState<string | null>(null)
  const breakdown = (label: string, categories: Category[]) => courses && {
    open: openTile === label,
    onToggle: () => setOpenTile((x) => (x === label ? null : label)),
    categories,
  }
  const panel = (label: string, categories: Category[]) =>
    courses && openTile === label
      ? <CourseBreakdown label={label} courses={courses} programId={program.id} categories={categories} />
      : null
  const req = program.requirements
  const d = (pick: (e: Evaluation) => number) => (baseline ? pick(result) - pick(baseline) : undefined)
  const lost = result.totalTaken - result.totalCounted
  // 以學程科目數為門檻的學程（半導體學程）顯示科目數，不顯示學分
  const subjects = result.subjects
  const remaining = subjects
    ? Math.max(0, subjects.target - subjects.count)
    : req.total !== undefined ? Math.max(0, req.total - result.totalCounted) : undefined
  const genEdGap = result.gaps.genEdDomains
  const unmetGroups = [
    ...result.gaps.groups.filter((g) => !(subjects && g.startsWith('學程科目'))),
    ...(genEdGap > 0 ? [`通識指定領域（還差 ${genEdGap} 個）`] : []),
  ]
  const outsideCap = req.elective !== undefined && req.electiveInMajor !== undefined
    ? req.elective - req.electiveInMajor
    : undefined

  const isMain = program.kind === '主修'
  // 停修、不及格、服務學習、全年課只修半年等被排除的課，讓使用者也能確認
  const excluded = (courses ?? []).filter((c) =>
    c.assignments.some((a) => a.programId === program.id && a.category === '不計入')).length
  const gaps = [
    { label: '系訂必修', gap: result.gaps.major },
    ...(isMain ? [
      { label: '系內選修', gap: result.gaps.electiveInMajor },
      { label: '選修', gap: result.gaps.elective },
      { label: '共同＋通識', gap: result.gaps.common },
      { label: '體育', gap: result.pe.gap },
    ] : []),
  ].filter((g) => g.gap > 0)
  // 各類別的缺口在下方每個方塊都會標，這裡只放沒有專屬方塊的規定（模組、指定領域）
  const chips = [
    ...(program.kind === '學程' ? gaps.map((g) => `${g.label} −${g.gap}`) : []),
    ...unmetGroups.map((name) => `${name}未達標`),
  ]

  return (
    <div className="stack">
      <div className="hero">
        <Ring value={subjects ? subjects.count : result.totalCounted} total={subjects ? subjects.target : req.total} />
        <div className="hero-body">
          <div className="hero-label">
            {isMain ? '畢業學分' : subjects ? '學程科目' : `${program.kind}學分`}
            {lost > 0 && <Info text={`實修 ${result.totalTaken} 學分，其中 ${lost} 學分因超修上限不計入`} />}
          </div>
          <div className="hero-value">
            <strong>{subjects ? subjects.count : result.totalCounted}</strong>
            {subjects
              ? <span className="of">/ {subjects.target} 科</span>
              : req.total !== undefined && <span className="of">/ {req.total}</span>}
            <Delta value={d((e) => e.subjects?.count ?? e.totalCounted)} />
          </div>
          {remaining !== undefined && (
            <div className={remaining === 0 && unmetGroups.length === 0 ? 'hero-remaining ok' : 'hero-remaining'}>
              {remaining > 0
                ? `還差 ${remaining} ${subjects ? '科' : '學分'}`
                : unmetGroups.length > 0 ? (isMain ? '學分夠了，還有規定沒達到' : '學分夠了，模組還沒達標') : '已達標'}
            </div>
          )}
          {chips.length > 0 && (
            <div className="gap-chips">
              {chips.map((text) => <span key={text} className="gap-chip">{text}</span>)}
            </div>
          )}
        </div>
      </div>

      {program.kind === '學程' ? null : !isMain ? (
        <>
        <div className="tiles">
          {req.major !== undefined && (
            <StatTile
              tone="major" label="系訂必修" value={result.counted.major} required={req.major}
              delta={d((e) => e.counted.major)} {...breakdown('系訂必修', ['系訂必修'])}
            />
          )}
          <StatTile
            tone="in" label="選修課程"
            value={result.counted.electiveInMajor}
            delta={d((e) => e.counted.electiveInMajor)}
            info={program.kind === '輔系'
              ? '該系開的課；依學期先後分給輔系，湊滿門檻後其餘仍算主修選修'
              : '該系開的非必修課，含指定選修'}
            {...breakdown('選修課程', ['限本系選修'])}
          />
        </div>
        {panel('系訂必修', ['系訂必修'])}
        {panel('選修課程', ['限本系選修'])}
        </>
      ) : (
      <>
      <div className="tiles">
        <StatTile
          tone="major" label="系訂必修" value={result.counted.major} required={req.major}
          delta={d((e) => e.counted.major)} {...breakdown('系訂必修', ['系訂必修'])}
        />
        <StatTile
          tone="elective" label="選修合計" value={result.counted.elective} required={req.elective}
          delta={d((e) => e.counted.elective)} {...breakdown('選修合計', ['限本系選修', '一般選修'])}
        />
        <StatTile
          tone="in" label="系內選修"
          value={result.counted.electiveInMajor} required={req.electiveInMajor}
          delta={d((e) => e.counted.electiveInMajor)}
          info="選修中至少要有這麼多學分是本系（含研究所）開的課"
          {...breakdown('系內選修', ['限本系選修'])}
        />
        <StatTile
          tone="out" label="系外選修"
          value={result.counted.electiveOutside}
          delta={d((e) => e.counted.electiveOutside)}
          info={`${outsideCap !== undefined ? `最多採計 ${outsideCap} 學分。` : ''}含必修抵免餘數與外文超修`}
          {...breakdown('系外選修', ['一般選修'])}
        />
        <StatTile
          tone="common" label="共同＋通識"
          value={result.counted.common} required={req.common}
          delta={d((e) => e.counted.common)}
          info={[
            '國文、外文、通識合計。國文最多 6、通識最多 15、兩者合計最多 18',
            result.genEd && `通識須修系上指定領域 ${result.genEd.designated.join('、')} 中的 ${result.genEd.need} 個（大一國文 6 學分者 2 個），目前已修 ${result.genEd.covered.length ? result.genEd.covered.join('、') : '0 個'}。國際學生不受指定領域限制`,
            '溝通表達與職涯發展課程（原基本能力課程）依課程網 108–115 學年開課清單辨認，至多充抵通識 6 學分，超出的計入選修',
          ].filter(Boolean).join('。')}
          {...breakdown('共同＋通識', ['國文', '外文', '通識'])}
        />
        <StatTile
          tone="pe" label="體育"
          value={result.pe.taken} required={req.pe}
          delta={d((e) => e.pe.taken)}
          info="必修但不計入畢業總學分"
          {...breakdown('體育', ['體育'])}
        />
      </div>
      {panel('系訂必修', ['系訂必修'])}
      {panel('選修合計', ['限本系選修', '一般選修'])}
      {panel('系內選修', ['限本系選修'])}
      {panel('系外選修', ['一般選修'])}
      {panel('共同＋通識', ['國文', '外文', '通識'])}
      {panel('體育', ['體育'])}
      {excluded > 0 && (
        <button className="link small" onClick={() => setOpenTile((x) => (x === '不計入' ? null : '不計入'))}>
          {openTile === '不計入' ? '收起' : `查看不計入的 ${excluded} 門課`}
        </button>
      )}
      {panel('不計入', ['不計入'])}
      </>
      )}
    </div>
  )
}
