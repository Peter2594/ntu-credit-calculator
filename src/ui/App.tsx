import { useEffect, useState } from 'react'
import type { Category, Course, Program } from '../core/types'
import type { GradeRow, ParsedCourse } from '../core/parser'
import {
  mergeImported, reclassifyAll, removeProgram, resetCategory, setCategory,
  unwaiveRequired, updateGrades, waiveRequired,
} from '../core/courses'
import type { RequiredCourse } from '../core/types'
import { useAppState } from './useAppState'
import { Dashboard } from './components/Dashboard'
import { CoursesView } from './components/CoursesView'
import { ScheduleView } from './components/ScheduleView'
import { TrialView } from './components/TrialView'
import { ProgramSetup } from './components/ProgramSetup'
import { loadPrograms, refreshCreditPrograms } from './components/CreditProgramPicker'
import { loadYear, refreshMainRules, type OfficialYear } from './officialData'

export type Tab = 'dashboard' | 'courses' | 'schedule' | 'trial' | 'programs'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: '進度' },
  { id: 'courses', label: '課程' },
  { id: 'schedule', label: '課表' },
  { id: 'trial', label: '試算' },
  { id: 'programs', label: '學程設定' },
]

export type Actions = {
  addProgram(p: Program): void
  updateProgram(p: Program): void
  deleteProgram(id: string): void
  importCourses(parsed: ParsedCourse[]): void
  updateGrades(rows: GradeRow[]): void
  addCourses(courses: Course[]): void
  deleteCourse(id: string): void
  setCourseCategory(courseId: string, programId: string, category: Category): void
  resetCourse(courseId: string): void
  clearAll(): void
  waive(programId: string, required: RequiredCourse, courseId?: string): void
  unwaive(programId: string, key: string): void
}

export function App() {
  const { state, setState, saveFailed } = useAppState()
  const [tab, setTab] = useState<Tab>(state.programs.length === 0 ? 'programs' : 'dashboard')

  // 已選的學分學程換成最新的課程清單與門檻
  const hasCreditProgram = state.programs.some((p) => p.source?.kind === '學程')
  useEffect(() => {
    if (!hasCreditProgram) return
    loadPrograms()
      .then((data) =>
        setState((s) => {
          const programs = refreshCreditPrograms(s.programs, data)
          return programs ? { programs, courses: reclassifyAll(s.courses, programs) } : s
        }),
      )
      .catch(() => {})
  }, [hasCreditProgram, setState])

  // 主修補上系上的超修、本系通識、新生課程規定與指定通識領域
  const mainYears = [...new Set(state.programs.flatMap((p) => (p.kind === '主修' && p.source ? [p.source.year] : [])))].sort().join(',')
  useEffect(() => {
    if (!mainYears) return
    Promise.all(mainYears.split(',').map((y) => loadYear(y).then((d): [string, OfficialYear] => [y, d])))
      .then((entries) =>
        setState((s) => {
          const programs = refreshMainRules(s.programs, new Map(entries))
          return programs ? { programs, courses: reclassifyAll(s.courses, programs) } : s
        }),
      )
      .catch(() => {})
  }, [mainYears, setState])

  const actions: Actions = {
    addProgram: (p) =>
      setState((s) => {
        const programs = [...s.programs, p]
        return { programs, courses: reclassifyAll(s.courses, programs) }
      }),
    updateProgram: (p) =>
      setState((s) => {
        const programs = s.programs.map((x) => (x.id === p.id ? p : x))
        return { programs, courses: reclassifyAll(s.courses, programs) }
      }),
    deleteProgram: (id) =>
      setState((s) => ({
        programs: s.programs.filter((x) => x.id !== id),
        courses: removeProgram(s.courses, id),
      })),
    importCourses: (parsed) =>
      setState((s) => ({ ...s, courses: mergeImported(s.courses, parsed, s.programs) })),
    updateGrades: (rows) =>
      setState((s) => ({ ...s, courses: reclassifyAll(updateGrades(s.courses, rows).courses, s.programs) })),
    addCourses: (courses) =>
      setState((s) => ({ ...s, courses: reclassifyAll([...s.courses, ...courses], s.programs) })),
    deleteCourse: (id) =>
      setState((s) => ({ ...s, courses: s.courses.filter((c) => c.id !== id) })),
    setCourseCategory: (courseId, programId, category) =>
      setState((s) => ({
        ...s,
        courses: s.courses.map((c) => (c.id === courseId ? setCategory(c, programId, category) : c)),
      })),
    resetCourse: (courseId) =>
      setState((s) => ({
        ...s,
        courses: s.courses.map((c) => (c.id === courseId ? resetCategory(c, s.programs, s.courses) : c)),
      })),
    clearAll: () => setState({ programs: [], courses: [] }),
    waive: (programId, required, courseId) =>
      setState((s) => {
        const target = s.programs.find((p) => p.id === programId)
        if (!target) return s
        const { program, courses } = waiveRequired(target, s.courses, required, courseId)
        return { programs: s.programs.map((p) => (p.id === programId ? program : p)), courses }
      }),
    unwaive: (programId, key) =>
      setState((s) => ({
        ...s,
        programs: s.programs.map((p) => (p.id === programId ? unwaiveRequired(p, key) : p)),
      })),
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">學</span>
            <h1>學分計算表</h1>
          </div>
          <span className="privacy-badge" title="沒有伺服器，資料不會上傳">
            <span className="lock" aria-hidden="true">●</span> 資料只存在本機
          </span>
        </div>
        <nav className="tabs" aria-label="主選單">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={t.id === tab ? 'tab active' : 'tab'}
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {saveFailed && (
          <p className="notice warn">
            瀏覽器不允許儲存資料（可能是私密瀏覽），關掉分頁後內容會消失。
          </p>
        )}
        {tab === 'dashboard' && <Dashboard state={state} actions={actions} goTo={setTab} />}
        {tab === 'courses' && <CoursesView state={state} actions={actions} goTo={setTab} />}
        {tab === 'schedule' && <ScheduleView state={state} actions={actions} />}
        {tab === 'trial' && <TrialView state={state} actions={actions} />}
        {tab === 'programs' && <ProgramSetup state={state} actions={actions} goTo={setTab} />}
      </main>

      <footer className="footer">非官方工具 · 以系辦審查為準</footer>
    </div>
  )
}
