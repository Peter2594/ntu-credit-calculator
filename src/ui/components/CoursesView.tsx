import { useMemo, useState } from 'react'
import { parseGradeRows, parseTranscript, type GradeRow, type ParsedCourse } from '../../core/parser'
import { updateGrades } from '../../core/courses'
import { deptPrefixOf, deptPrefixesOf, isOwnDeptGenEd } from '../../core/classify'
import { SYNTHETIC_TRANSCRIPT } from '../../core/fixtures/transcript'
import type { AppState } from '../../core/storage'
import { CATEGORIES, type Category, type Course } from '../../core/types'
import type { Actions, Tab } from '../App'
import { categoryLabel, isPlanned } from '../constants'
import { computeGpa } from '../../core/gpa'
import { fmtGpa } from './GpaCard'

type Props = { state: AppState; actions: Actions; goTo(tab: Tab): void }
type Filter = 'all' | 'dept' | 'planned'

export function CoursesView({ state, actions, goTo }: Props) {
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState<ParsedCourse[] | null>(null)
  const [justImported, setJustImported] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [usingSample, setUsingSample] = useState(false)
  const [gradeRows, setGradeRows] = useState<GradeRow[]>([])
  const [gradesUpdated, setGradesUpdated] = useState<number | null>(null)

  const parse = (text: string) => {
    const courses = parseTranscript(text)
    setPreview(courses)
    setGradeRows(courses.length === 0 ? parseGradeRows(text) : [])
    setJustImported(null)
    setGradesUpdated(null)
  }

  const gradeMatch = gradeRows.length > 0 ? updateGrades(state.courses, gradeRows) : null

  const confirmImport = () => {
    if (!preview?.length) return
    actions.importCourses(preview)
    setJustImported(preview.length)
    setPreview(null)
    setRaw('')
    setFilter('dept')
  }

  const prefixes = new Set(state.programs.flatMap(deptPrefixesOf))
  const visible = state.courses.filter((c) =>
    filter === 'dept' ? prefixes.has(deptPrefixOf(c.identifier))
      : filter === 'planned' ? isPlanned(c)
        : true,
  )

  const bySemester = useMemo(() => {
    const groups = new Map<string, Course[]>()
    for (const c of visible) groups.set(c.semester, [...(groups.get(c.semester) ?? []), c])
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [visible])

  return (
    <section className="stack">
      <div className="section-head">
        <h2>匯入成績</h2>
      </div>

      <div className="card stack-sm">
        <textarea
          rows={6}
          placeholder={'myNTU「歷年成績」頁面 → Ctrl+A 全選 → Ctrl+C 複製 → 貼在這裡'}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setUsingSample(false)
          }}
          aria-label="歷年成績原文"
        />
        <div className="row wrap">
          <button className="btn primary" disabled={!raw.trim()} onClick={() => parse(raw)}>解析</button>
          <button
            className="btn ghost"
            onClick={() => {
              setRaw(SYNTHETIC_TRANSCRIPT)
              parse(SYNTHETIC_TRANSCRIPT)
              setUsingSample(true)
            }}
          >
            用範例資料試試
          </button>
        </div>

        {usingSample && preview && (
          <p className="notice">
            範例資料是編造的，本系課的識別碼開頭是 <span className="mono">900</span>。
            想看分類效果，把學程的「識別碼前三碼」設成 900。
          </p>
        )}
        {preview && preview.length === 0 && gradeRows.length === 0 && gradesUpdated === null && (
          <p className="notice warn">
            沒有解析出任何課程。請確認是 myNTU「歷年成績」頁整頁複製的內容。
          </p>
        )}
        {gradeMatch && gradesUpdated === null && (
          <div className="notice warn stack-xs">
            <div>
              這是<strong>手機版頁面</strong>，只有課名和成績，缺少課號、識別碼與學分，無法計算學分。
              請在手機瀏覽器選單切換「電腦版網站」後再複製，或改用電腦。
            </div>
            {gradeMatch.updated > 0 && (
              <div className="row wrap">
                <span>其中 {gradeMatch.updated} 門之前匯入過，可以直接更新成績：</span>
                <button
                  className="btn primary small"
                  onClick={() => {
                    actions.updateGrades(gradeRows)
                    setGradesUpdated(gradeMatch.updated)
                    setGradeRows([])
                    setPreview(null)
                    setRaw('')
                  }}
                >
                  更新 {gradeMatch.updated} 門成績
                </button>
              </div>
            )}
          </div>
        )}
        {gradesUpdated !== null && <p className="notice ok-bg">已更新 {gradesUpdated} 門課的成績。</p>}
        {preview && preview.length > 0 && (
          <div className="stack-sm">
            <p>
              解析出 <strong>{preview.length}</strong> 門課、共{' '}
              <strong>{preview.reduce((s, c) => s + c.credits, 0)}</strong> 學分。
              已經匯入過的課會更新成績，你改過的分類會保留。
            </p>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr><th>學期</th><th>課名</th><th>識別碼</th><th className="num">學分</th><th>成績</th></tr>
                </thead>
                <tbody>
                  {preview.map((c, i) => (
                    <tr key={i}>
                      <td>{c.semester}</td><td>{c.name}</td><td className="mono">{c.identifier}</td>
                      <td className="num">{c.credits}</td><td>{c.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row wrap">
              <button className="btn primary" onClick={confirmImport}>確認匯入</button>
              <button className="btn ghost" onClick={() => setPreview(null)}>取消</button>
            </div>
          </div>
        )}
      </div>

      {justImported !== null && (
        <div className="notice ok-bg">
          已匯入 {justImported} 門課。
          {state.programs.some((p) => p.requiredCourses?.length)
            ? <>系訂必修已依課程規定自動標好，<strong>抵免或群組選修</strong>的課請在下方自己調整。</>
            : <><strong>成績單沒有標示必修或選修</strong>，本系課一律先算「系內選修」。請在下方把系訂必修改掉。</>}
          {state.programs.length === 0 && (
            <> 你還沒設定學程，<button className="link" onClick={() => goTo('programs')}>先去設定</button>才能分類。</>
          )}
        </div>
      )}

      {state.courses.length > 0 && (
        <>
          <div className="section-head row between wrap">
            <h2>課程分類</h2>
            <div className="segmented" role="group" aria-label="篩選">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
              <button className={filter === 'dept' ? 'active' : ''} onClick={() => setFilter('dept')}>本系課</button>
              <button className={filter === 'planned' ? 'active' : ''} onClick={() => setFilter('planned')}>計畫中</button>
            </div>
          </div>

          {visible.length === 0 && <p className="muted">沒有符合的課程。</p>}

          {bySemester.map(([semester, list]) => (
            <div key={semester} className="stack-sm">
              <h3 className="semester-title">
                {semester}
                <span className="muted"> · {list.reduce((s, c) => s + c.credits, 0)} 學分</span>
                {computeGpa(list).overall.ntu !== null && (
                  <span className="muted"> · GPA {fmtGpa(computeGpa(list).overall.ntu)}</span>
                )}
              </h3>
              <ul className="course-list">
                {list.map((c) => (
                  <CourseItem key={c.id} course={c} state={state} actions={actions} />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

function CourseItem({ course, state, actions }: { course: Course; state: AppState; actions: Actions }) {
  const failedOrWithdrawn = course.grade && ['停修', 'F', 'X', '不通過'].includes(course.grade)

  return (
    <li className={failedOrWithdrawn ? 'course dim' : 'course'}>
      <div className="course-main">
        <div className="course-name">
          {course.name}
          {course.overridden && <span className="chip accent">手動</span>}
          {!course.overridden && state.programs.some((p) => isOwnDeptGenEd(course, p)) && (
            <span className="chip warn" title="依規定，畢業學系開授的課可能不採計通識">本系通識，請確認</span>
          )}
        </div>
        <div className="course-meta muted">
          <span className="mono">{course.identifier || course.code || '—'}</span>
          <span>{course.credits} 學分</span>
          <span>{isPlanned(course) ? '計畫中' : `成績 ${course.grade}`}</span>
        </div>
      </div>

      <div className="course-controls">
        {state.programs.map((p) => {
          const current = course.assignments.find((a) => a.programId === p.id)?.category
          return (
            <label key={p.id} className="inline-field">
              {state.programs.length > 1 && <span className="muted">{p.name || p.kind}</span>}
              <select
                value={current ?? ''}
                onChange={(e) => actions.setCourseCategory(course.id, p.id, e.target.value as Category)}
                aria-label={`${course.name} 在 ${p.name || p.kind} 的分類`}
              >
                {!current && <option value="">—</option>}
                {CATEGORIES.map((k) => <option key={k} value={k}>{categoryLabel(k)}</option>)}
              </select>
            </label>
          )
        })}
        <div className="row tight">
          {course.overridden && (
            <button className="btn ghost small" onClick={() => actions.resetCourse(course.id)} title="恢復自動分類">
              恢復自動
            </button>
          )}
          <button
            className="btn ghost small danger-text"
            onClick={() => {
              if (confirm(`刪除「${course.name}」？`)) actions.deleteCourse(course.id)
            }}
            aria-label={`刪除 ${course.name}`}
          >
            刪除
          </button>
        </div>
      </div>
    </li>
  )
}
