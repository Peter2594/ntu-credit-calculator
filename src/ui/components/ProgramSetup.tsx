import type { AppState } from '../../core/storage'
import type { Program, ProgramKind, Requirements } from '../../core/types'
import type { Actions, Tab } from '../App'
import { newId } from '../constants'

type Field = { key: keyof Requirements; label: string; hint?: string }

const MAIN_FIELDS: Field[] = [
  { key: 'total', label: '畢業總學分' },
  { key: 'major', label: '系訂必修' },
  { key: 'elective', label: '選修' },
  { key: 'electiveInMajor', label: '其中限本系選修', hint: '選修裡至少要有幾學分是本系課' },
  { key: 'common', label: '共同必修＋通識', hint: '國文、外文、通識合計' },
  { key: 'pe', label: '體育', hint: '不計入畢業總學分' },
]

const DETAIL_FIELDS: Field[] = [
  { key: 'chinese', label: '國文' },
  { key: 'foreign', label: '外文' },
  { key: 'genEd', label: '通識' },
]

const KINDS: ProgramKind[] = ['主修', '雙主修', '輔系']

function blankProgram(kind: ProgramKind): Program {
  return { id: newId(), kind, name: '', deptPrefix: '', requirements: {} }
}

type Props = { state: AppState; actions: Actions; goTo(tab: Tab): void }

export function ProgramSetup({ state, actions, goTo }: Props) {
  const { programs } = state
  const hasMajor = programs.some((p) => p.kind === '主修')

  return (
    <section className="stack">
      <div className="section-head">
        <h2>學程設定</h2>
        <p className="muted">
          填入系上的畢業門檻。數字在
          <a href="https://curri.aca.ntu.edu.tw/" target="_blank" rel="noreferrer"> 台大必修課程查詢系統 </a>
          或系網的「應修學分」可以查到。沒有規定的欄位留空即可。
        </p>
      </div>

      {programs.length === 0 && (
        <div className="notice">
          先新增你的主修。之後到「課程」貼上 myNTU 歷年成績，就能看到進度。
        </div>
      )}

      {programs.map((p) => (
        <ProgramCard
          key={p.id}
          program={p}
          onChange={actions.updateProgram}
          onDelete={() => {
            if (confirm(`刪除「${p.name || p.kind}」？課程上對應的分類也會一併移除。`)) {
              actions.deleteProgram(p.id)
            }
          }}
        />
      ))}

      <div className="row wrap">
        <button className="btn primary" onClick={() => actions.addProgram(blankProgram(hasMajor ? '雙主修' : '主修'))}>
          ＋ 新增{hasMajor ? '學程' : '主修'}
        </button>
        {programs.length > 0 && (
          <button className="btn" onClick={() => goTo('courses')}>下一步：匯入成績 →</button>
        )}
      </div>

      {(programs.length > 0 || state.courses.length > 0) && (
        <details className="danger-zone">
          <summary>清除資料</summary>
          <p className="muted">刪除這台瀏覽器裡所有學程與課程，無法復原。</p>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('確定清除所有學程與課程？')) actions.clearAll()
            }}
          >
            清除全部資料
          </button>
        </details>
      )}
    </section>
  )
}

function ProgramCard({ program, onChange, onDelete }: {
  program: Program
  onChange(p: Program): void
  onDelete(): void
}) {
  const setReq = (key: keyof Requirements, raw: string) => {
    const requirements = { ...program.requirements }
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(n) || n < 0) delete requirements[key]
    else requirements[key] = n
    onChange({ ...program, requirements })
  }

  const renderField = (f: Field) => (
    <label key={f.key} className="field">
      <span className="field-label">{f.label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={program.requirements[f.key] ?? ''}
        onChange={(e) => setReq(f.key, e.target.value)}
      />
      {f.hint && <span className="field-hint">{f.hint}</span>}
    </label>
  )

  return (
    <article className="card">
      <div className="grid-3">
        <label className="field">
          <span className="field-label">名稱</span>
          <input
            placeholder="例：資訊管理學系"
            value={program.name}
            onChange={(e) => onChange({ ...program, name: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">類型</span>
          <select
            value={program.kind}
            onChange={(e) => onChange({ ...program, kind: e.target.value as ProgramKind })}
          >
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">識別碼前三碼</span>
          <input
            placeholder="例：705"
            maxLength={3}
            value={program.deptPrefix}
            onChange={(e) => onChange({ ...program, deptPrefix: e.target.value.trim().toUpperCase() })}
          />
          <span className="field-hint">成績單上課程識別碼的開頭，用來認出本系課</span>
        </label>
      </div>

      <div className="grid-3">{MAIN_FIELDS.map(renderField)}</div>

      <details>
        <summary>國文、外文、通識各自的門檻（選填）</summary>
        <p className="field-hint">
          填了才能正確處理超修：國文與通識超修不計入選修，外文超修會計入選修。
        </p>
        <div className="grid-3">{DETAIL_FIELDS.map(renderField)}</div>
      </details>

      <div className="row end">
        <button className="btn ghost danger-text" onClick={onDelete}>刪除這個學程</button>
      </div>
    </article>
  )
}
