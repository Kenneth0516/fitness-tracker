import { useState } from 'react'
import { Activity, ArrowRight, CalendarDays, ChevronDown, ClipboardList, Copy, Dumbbell, FileStack, History, Pencil, Plus, SlidersHorizontal, Trash2, TrendingUp } from 'lucide-react'
import { beginDraft, deleteWorkout, discardDraft, type Snapshot } from './db'
import { compareWorkouts, createDraft, exerciseProgress, fromWorkout } from './fitness'
import { type Draft, type Workout, type WorkoutTemplate, dateSchema, displayNumber, localDate, weightLabels } from './model'
import { BackButton, Button, Confirm, Dialog, Empty, Field, FormActions, Notice, PageHeading, SectionHeading, Tile, onSubmit, useAction } from './ui'
import { setLabel } from './workout-editor'
import { ProgressChart } from './charts'

type Props = { snapshot: Snapshot; navigate: (path: string) => void; notify: (message: string) => void }

export function WorkoutPage({ snapshot, navigate, notify }: Props) {
  const [start, setStart] = useState<string | null>(null)
  const [filters, setFilters] = useState(false)
  const [range, setRange] = useState({ from: '', to: '', template: '', exercise: '' })
  const [deleting, setDeleting] = useState<Workout | null>(null)
  const [discarding, setDiscarding] = useState<Draft | null>(null)
  const action = useAction()
  const byId = new Map(snapshot.exercises.map(exercise => [exercise.id, exercise]))
  const templateNames = new Map<string, string>()
  for (const workout of snapshot.workouts) if (workout.template) templateNames.set(workout.template.templateId, workout.template.templateName)
  for (const template of snapshot.templates) templateNames.set(template.id, template.name)
  const activeFilter = Object.values(range).some(Boolean)
  const history = snapshot.workouts.filter(workout =>
    (!range.from || workout.date >= range.from) && (!range.to || workout.date <= range.to) &&
    (!range.template || workout.template?.templateId === range.template) &&
    (!range.exercise || workout.exercises.some(exercise => exercise.exerciseId === range.exercise)))
    .sort((a, b) => compareWorkouts(b, a))
  const templates = [...snapshot.templates].sort((a, b) => a.name.localeCompare(b.name))
  const drafts = [...snapshot.drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  async function openDraft(draft: Draft) {
    const created = await beginDraft(draft)
    navigate(`workout/edit/${created.id}`)
  }

  return <>
    <PageHeading title="訓練紀錄" description="管理 Workout、Template 與動作進度。" />
    <section className="workout-hero" aria-labelledby="hero-title">
      <img src={import.meta.env.BASE_URL + 'workout-hero.webp'} alt="" fetchPriority="high" />
      <div className="hero-content">
        <span className="hero-icon"><Dumbbell size={22} strokeWidth={1.8} aria-hidden="true" /></span>
        <h2 id="hero-title">記下今天的訓練</h2>
        <p>完成訓練後，一次記錄所有動作與 Sets。</p>
        <Button variant="primary" icon={Plus} onClick={() => setStart('')}>新增 Workout</Button>
      </div>
    </section>
    {drafts.length > 0 && <section className="panel draft-list">
      <SectionHeading title="未完成草稿" icon={ClipboardList} count={drafts.length} />
      {drafts.map(draft => <div className="list-row" key={draft.id}>
        <div className="row-text"><strong>{draft.name || '未命名 Workout'}</strong><small>{draft.date || '未填日期'} · {draft.exercises.length} 個動作{draft.source ? ' · 編輯中' : ''}</small></div>
        <div className="inline-actions">
          <Button onClick={() => setDiscarding(draft)} variant="quiet">捨棄</Button>
          <Button icon={Pencil} onClick={() => navigate(`workout/edit/${draft.id}`)}>繼續編輯</Button>
        </div>
      </div>)}
    </section>}
    <div className="workout-layout">
      <section className="panel history">
        <SectionHeading title="訓練歷史" icon={History} count={history.length}
          action={<Button icon={SlidersHorizontal} onClick={() => setFilters(!filters)} aria-expanded={filters} className={activeFilter ? 'selected' : ''}>篩選</Button>} />
        {filters && <div className="filter-box form-grid">
          <Field label="開始日期"><input type="date" value={range.from} onChange={event => setRange({ ...range, from: event.target.value })} /></Field>
          <Field label="結束日期"><input type="date" value={range.to} onChange={event => setRange({ ...range, to: event.target.value })} /></Field>
          <Field label="Template"><select value={range.template} onChange={event => setRange({ ...range, template: event.target.value })}>
            <option value="">所有 Template</option>
            {[...templateNames].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></Field>
          <Field label="動作"><select value={range.exercise} onChange={event => setRange({ ...range, exercise: event.target.value })}>
            <option value="">所有動作</option>{snapshot.exercises.map(exercise => <option value={exercise.id} key={exercise.id}>{exercise.name}</option>)}
          </select></Field>
          {activeFilter && <Button onClick={() => setRange({ from: '', to: '', template: '', exercise: '' })}>清除篩選</Button>}
        </div>}
        {action.error && <div className="padded"><Notice>{action.error}</Notice></div>}
        {history.length > 0 ? <div className="history-list">
          {history.map(workout => <details className="history-item" key={workout.id}>
            <summary className="collapse-row">
              <Tile icon={CalendarDays} />
              <span><strong>{workout.name}</strong><small>{workout.date} · {workout.exercises.length} 個動作 · {workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0)} Sets</small></span>
              <ChevronDown size={18} className="summary-chevron" />
            </summary>
            <div className="history-detail">
              {workout.template && <span className="tag">{workout.template.templateName}</span>}
              {workout.exercises.map(exercise => <div className="history-exercise" key={exercise.id}>
                <strong>{byId.get(exercise.exerciseId)?.name ?? exercise.exerciseId}</strong>
                <small className="muted">{weightLabels[exercise.weightType]}</small>
                <div className="set-pills">{exercise.sets.map(set => <span key={set.id} className="tag">{setLabel(set, exercise.weightType === 'bodyweight')}</span>)}</div>
                {exercise.notes && <p className="record-note">{exercise.notes}</p>}
              </div>)}
              <div className="inline-actions">
                <Button icon={Pencil} disabled={action.pending} onClick={() => void action.run(() => openDraft(fromWorkout(workout)))}>編輯</Button>
                <Button icon={Copy} disabled={action.pending} onClick={() => void action.run(() => openDraft(fromWorkout(workout, localDate())))}>複製為新 Workout</Button>
                <Button icon={Trash2} variant="quiet" className="text-danger" onClick={() => setDeleting(workout)}>刪除</Button>
              </div>
            </div>
          </details>)}
        </div> : <Empty icon={CalendarDays} large title={activeFilter ? '沒有符合篩選的紀錄' : '尚未有訓練紀錄'}
          message={activeFilter ? '調整日期、Template 或動作篩選。' : '儲存第一個 Workout 後，訓練詳情就會顯示在這裡。'} />}
      </section>
      <div className="stack compact">
        <section className="panel">
          <SectionHeading title="Workout Templates" icon={FileStack} tone="violet" />
          {templates.length ? <div className="template-quick">
            {templates.map(template => <button key={template.id} type="button" className="quick-row" onClick={() => setStart(template.id)}>
              <span><strong>{template.name}</strong><small>{template.exerciseIds.length} 個動作</small></span><ArrowRight size={17} />
            </button>)}
          </div> : <p className="panel-copy">建立常用的動作組合，下次記錄更快。</p>}
          <div className="panel-bottom">
            <Button icon={templates.length ? ArrowRight : Plus} onClick={() => navigate(templates.length ? 'more/templates' : 'more/templates/new')}>
              {templates.length ? '管理 Template' : '建立 Template'}
            </Button>
          </div>
        </section>
        <section className="panel">
          <SectionHeading title="動作進度" icon={TrendingUp} tone="teal" />
          <p className="panel-copy">查看每個動作的訓練重量、組數與訓練量。</p>
          <div className="panel-bottom"><Button icon={ArrowRight} onClick={() => navigate('workout/progress')}>查看動作進度</Button></div>
        </section>
      </div>
    </div>
    {start !== null && <StartWorkout templates={templates} snapshot={snapshot} initialTemplate={start} onClose={() => setStart(null)} onStart={openDraft} />}
    {deleting && <Confirm title="刪除這筆 Workout？" message={`「${deleting.name}」及其 Sets 將被永久刪除。動作進度及 PR 會自動重新計算。`}
      onClose={() => setDeleting(null)} onConfirm={async () => { await deleteWorkout(deleting); notify('已刪除 Workout。') }} />}
    {discarding && <Confirm title="捨棄草稿？" label="捨棄草稿" message="這份草稿及其未提交的更改將被刪除。"
      onClose={() => setDiscarding(null)} onConfirm={async () => { await discardDraft(discarding); notify('已捨棄草稿。') }} />}
  </>
}

function StartWorkout({ templates, snapshot, initialTemplate, onStart, onClose }: {
  templates: WorkoutTemplate[]; snapshot: Snapshot; initialTemplate: string; onStart: (draft: Draft) => Promise<void>; onClose: () => void
}) {
  const [date, setDate] = useState(localDate)
  const [templateId, setTemplateId] = useState(initialTemplate)
  const [name, setName] = useState(templates.find(template => template.id === initialTemplate)?.name ?? '我的 Workout')
  const action = useAction()
  const template = templates.find(item => item.id === templateId)
  const available = new Map(snapshot.exercises.filter(exercise => !exercise.archived).map(exercise => [exercise.id, exercise]))
  const exercises = template?.exerciseIds.flatMap(id => available.has(id) ? [available.get(id)!] : []) ?? []
  return <Dialog title="新增 Workout" onClose={() => { if (!action.pending) onClose() }}>
    <form className="stack compact" onSubmit={onSubmit(action, async () => {
      dateSchema.parse(date)
      if (!name.trim()) throw new Error('請輸入 Workout 名稱。')
      await onStart(createDraft(date, name.trim(), exercises, template))
    })}>
      <Field label="訓練日期"><input autoFocus type="date" required value={date} onChange={event => setDate(event.target.value)} /></Field>
      <Field label="Workout Template"><select value={templateId} onChange={event => {
        const next = templates.find(item => item.id === event.target.value)
        setTemplateId(event.target.value)
        setName(next?.name ?? '我的 Workout')
      }}>
        <option value="">空白 Workout</option>
        {templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
      {template && exercises.length < template.exerciseIds.length && <Notice kind="info">已封存的動作會略過。</Notice>}
      <Field label="Workout 名稱"><input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></Field>
      <FormActions action={action} onClose={onClose} label="開始記錄" />
    </form>
  </Dialog>
}

export function ExerciseProgressPage({ snapshot, navigate }: Props) {
  const recorded = new Set(snapshot.workouts.flatMap(workout => workout.exercises.map(exercise => exercise.exerciseId)))
  const choices = snapshot.exercises.filter(exercise => recorded.has(exercise.id)).sort((a, b) => a.name.localeCompare(b.name))
  const [selected, setSelected] = useState('')
  const exercise = choices.find(item => item.id === selected) ?? choices[0]
  const data = exercise ? exerciseProgress(snapshot.workouts, exercise.id) : []
  return <>
    <BackButton onClick={() => navigate('workout')}>返回 Workout</BackButton>
    <PageHeading title="動作進度" description="查看每次訓練的重量、Reps 與訓練量。" />
    {!exercise ? <section className="panel"><Empty icon={Activity} large title="尚未有動作紀錄" message="儲存 Workout 後即可查看動作進度。" /></section> : <>
      <section className="panel padded stack compact">
        <Field label="選擇動作"><select value={exercise.id} onChange={event => setSelected(event.target.value)}>
          {choices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></Field>
        <ProgressChart data={data} weightType={exercise.weightType} />
      </section>
      <section className="panel">
        <SectionHeading title="訓練明細" icon={History} count={data.length} />
        {[...data].reverse().map(item => <details key={item.id} className="history-item">
          <summary className="collapse-row"><span><strong>{item.date} · {item.name}</strong><small>
            {item.exercise.sets.length} Sets · {item.repetitions} Reps
            {item.best !== null && ` · ${displayNumber.format(item.best)} kg`}
            {item.volume !== null && ` · ${displayNumber.format(item.volume)} kg·Reps`}
          </small></span><ChevronDown size={18} className="summary-chevron" /></summary>
          <div className="history-detail"><div className="set-pills">{item.exercise.sets.map(set => <span className="tag" key={set.id}>{setLabel(set, item.exercise.weightType === 'bodyweight')}</span>)}</div>
            {item.exercise.notes && <p className="record-note">{item.exercise.notes}</p>}</div>
        </details>)}
      </section>
    </>}
  </>
}
