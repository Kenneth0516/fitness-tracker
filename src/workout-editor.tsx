import { useRef, useState } from 'react'
import { ChevronDown, Clipboard, Dumbbell, Plus, Save, Trash2 } from 'lucide-react'
import { commitDraft, updateDraft, type Snapshot } from './db'
import { copyPreviousSets, newDraftExercise, newDraftSet, previousExercise } from './fitness'
import { type Draft, type DraftExercise, type WorkoutSet, displayNumber, nowIso, uid, weightLabels } from './model'
import { BackButton, Button, Confirm, Empty, ExercisePicker, Field, IconButton, Notice, OrderActions, PageHeading, errorMessage, moveItem, onSubmit, useAction } from './ui'

export function setLabel(set: WorkoutSet, bodyweight: boolean) {
  return bodyweight ? `${set.reps} Reps` : `${displayNumber.format(set.weight)} kg × ${set.reps}`
}

export function WorkoutEditor({ initial, snapshot, onBack, onSaved }: {
  initial: Draft; snapshot: Snapshot; onBack: () => void; onSaved: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const latest = useRef(initial)
  const persisted = useRef(initial.revision)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const [open, setOpen] = useState(() => new Set(initial.exercises.slice(0, 1).map(exercise => exercise.id)))
  const [picking, setPicking] = useState(false)
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [draftError, setDraftError] = useState('')
  const action = useAction()
  const definitions = new Map(snapshot.exercises.map(exercise => [exercise.id, exercise]))

  function enqueue(next: Draft) {
    setStatus('saving')
    queue.current = queue.current.then(async () => {
      try {
        await updateDraft(next, persisted.current)
        persisted.current = next.revision
        if (latest.current.revision === next.revision) { setStatus('saved'); setDraftError('') }
      } catch (problem) {
        if (latest.current.revision === next.revision) { setStatus('error'); setDraftError(errorMessage(problem)) }
      }
    })
  }
  function change(patch: Partial<Draft>) {
    const next = { ...latest.current, ...patch, revision: uid(), updatedAt: nowIso() }
    latest.current = next
    setDraft(next)
    enqueue(next)
  }
  function changeExercise(id: string, patch: Partial<DraftExercise>) {
    change({ exercises: latest.current.exercises.map(exercise => exercise.id === id ? { ...exercise, ...patch } : exercise) })
  }
  async function save() {
    await queue.current
    if (persisted.current !== latest.current.revision) throw new Error('草稿尚未儲存，請先解決儲存問題。')
    await commitDraft(draft.id, latest.current.revision)
    onSaved()
  }

  return <>
    <BackButton onClick={() => void queue.current.then(() => {
      if (persisted.current === latest.current.revision) onBack()
      else setDraftError('草稿仍有未儲存的變更。請重試，或重新開啟其他頁面已儲存的版本。')
    })}>返回 Workout</BackButton>
    <PageHeading title={draft.source ? '編輯 Workout' : '記錄 Workout'} description="輸入完成的重量與 Reps。" />
    <form className="stack" onSubmit={onSubmit(action, save)}>
      <fieldset disabled={action.pending}>
        <div className="panel padded form-grid">
          <Field label="Workout 名稱"><input required maxLength={100} value={draft.name} onChange={event => change({ name: event.target.value })} /></Field>
          <Field label="訓練日期"><input type="date" required value={draft.date} onChange={event => change({ date: event.target.value })} /></Field>
        </div>
        <div className="editor-heading"><h2>訓練動作</h2><Button icon={Plus} onClick={() => setPicking(true)}>加入動作</Button></div>
        {draft.exercises.length === 0 && <div className="panel"><Empty icon={Dumbbell} title="尚未加入動作" message="從動作庫選擇你這次完成的動作。" /></div>}
        <div className="stack compact">
          {draft.exercises.map((exercise, index) => {
            const name = definitions.get(exercise.exerciseId)?.name ?? exercise.exerciseId
            return <ExerciseCard key={exercise.id} exercise={exercise} name={name}
              open={open.has(exercise.id)} onToggle={() => setOpen(current => {
                const next = new Set(current)
                if (next.has(exercise.id)) next.delete(exercise.id)
                else next.add(exercise.id)
                return next
              })}
              index={index} count={draft.exercises.length}
              onChange={patch => changeExercise(exercise.id, patch)}
              onMove={delta => change({ exercises: moveItem(latest.current.exercises, index, delta) })}
              onRemove={() => change({ exercises: latest.current.exercises.filter(item => item.id !== exercise.id) })}
              previous={previousExercise(snapshot.workouts, exercise.exerciseId, draft.date, draft.source?.id)}
            />
          })}
        </div>
      </fieldset>
      {draftError && <Notice>{draftError}<div className="inline-actions">
        <Button onClick={() => enqueue(latest.current)}>重試儲存草稿</Button>
        <Button onClick={onBack}>返回 Workout</Button>
      </div></Notice>}
      {action.error && <Notice>{action.error}</Notice>}
      <div className="panel editor-save">
        <span role="status" className="muted">{status === 'saving' ? '儲存草稿中…' : status === 'error' ? '部分變更未儲存' : '草稿已儲存於此裝置'}</span>
        <Button variant="primary" icon={Save} disabled={action.pending} type="submit">{action.pending ? '儲存中…' : '儲存 Workout'}</Button>
      </div>
    </form>
    {picking && <ExercisePicker exercises={snapshot.exercises} excluded={draft.exercises.map(exercise => exercise.exerciseId)}
      onClose={() => setPicking(false)} onSelect={items => {
        const newItems = items.map(newDraftExercise)
        if (!latest.current.exercises.length && newItems[0]) setOpen(new Set([newItems[0].id]))
        change({ exercises: [...latest.current.exercises, ...newItems] })
        setPicking(false)
      }} />}
  </>
}

function ExerciseCard({ exercise, name, open, onToggle, index, count, onChange, onMove, onRemove, previous }: {
  exercise: DraftExercise; name: string; open: boolean; onToggle: () => void; index: number; count: number
  onChange: (patch: Partial<DraftExercise>) => void; onMove: (delta: number) => void; onRemove: () => void
  previous: ReturnType<typeof previousExercise>
}) {
  const [confirm, setConfirm] = useState<'copy' | 'remove' | null>(null)
  const bodyweight = exercise.weightType === 'bodyweight'
  const copy = () => { if (previous) onChange({ sets: copyPreviousSets(previous.exercise) }) }
  const recorded = exercise.sets.filter(set => set.reps.trim() && (bodyweight || set.weight.trim())).length
  const sectionId = `exercise-${exercise.id}`
  return <article className="panel exercise-card">
    <button type="button" className="collapse-row" aria-expanded={open} aria-controls={sectionId} onClick={onToggle}>
      <span><strong>{name}</strong><small>{recorded} Sets · {weightLabels[exercise.weightType]}</small></span>
      <ChevronDown size={19} className={open ? 'rotate' : ''} />
    </button>
    <div id={sectionId} hidden={!open} className="exercise-content">
      <div className="exercise-tools">
        <div className="previous">
          <span>上一次紀錄{previous && ` · ${previous.date} · ${previous.exercise.sets.length} Sets`}</span>
          <div>{previous ? previous.exercise.sets.map(set => setLabel(set, bodyweight)).join(' / ') : '沒有較早的訓練紀錄'}</div>
        </div>
        {previous && <Button icon={Clipboard} onClick={() => {
          if (exercise.sets.some(set => set.weight.trim() || set.reps.trim())) setConfirm('copy')
          else copy()
        }}>複製上次</Button>}
      </div>
      <div className={`set-grid set-head ${bodyweight ? 'bodyweight' : ''}`} aria-hidden="true">
        <span>組</span>{!bodyweight && <span>Weight (kg)</span>}<span>Reps</span><span />
      </div>
      {exercise.sets.map((set, setIndex) => <div key={set.id} className={`set-grid ${bodyweight ? 'bodyweight' : ''}`}>
        <span className="set-index">{setIndex + 1}</span>
        {!bodyweight && <input aria-label={`${name} 第 ${setIndex + 1} 組 Weight`} inputMode="decimal" placeholder="0" maxLength={40} value={set.weight} onChange={event => {
          const weight = event.target.value
          onChange({ sets: exercise.sets.map(value => value.id === set.id ? { ...value, weight } : value) })
        }} />}
        <input aria-label={`${name} 第 ${setIndex + 1} 組 Reps`} inputMode="numeric" placeholder="–" maxLength={40} value={set.reps} onChange={event => {
          const reps = event.target.value
          onChange({ sets: exercise.sets.map(value => value.id === set.id ? { ...value, reps } : value) })
        }} />
        <IconButton label={`刪除第 ${setIndex + 1} 組`} icon={Trash2} variant="quiet" onClick={() => onChange({ sets: exercise.sets.filter(value => value.id !== set.id) })} />
      </div>)}
      <Button icon={Plus} className="add-set" onClick={() => onChange({ sets: [...exercise.sets, newDraftSet(exercise)] })}>新增 Set</Button>
      <Field label="動作備註（選填）"><textarea rows={2} maxLength={2000} value={exercise.notes} onChange={event => onChange({ notes: event.target.value })} /></Field>
      <OrderActions index={index} count={count} label={name} onMove={onMove} onRemove={() => {
        if (exercise.notes || exercise.sets.some(set => set.weight || set.reps)) setConfirm('remove')
        else onRemove()
      }} />
    </div>
    {confirm && <Confirm title={confirm === 'copy' ? '覆蓋目前 Sets？' : '移除此動作？'}
      message={confirm === 'copy' ? '上一次紀錄的 Sets 將取代此動作目前輸入的 Sets。' : `${name} 及其 Sets 將從這份草稿移除。`}
      danger={confirm === 'remove'} label={confirm === 'copy' ? '複製並覆蓋' : '移除動作'}
      onClose={() => setConfirm(null)} onConfirm={confirm === 'copy' ? copy : onRemove} />}
  </article>
}
