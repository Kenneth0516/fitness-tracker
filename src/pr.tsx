import { useState } from 'react'
import { ChevronDown, Medal, Pencil, Plus, Trash2, Trophy } from 'lucide-react'
import { db, removeRecord, saveManualPR, type Snapshot } from './db'
import { calculatePRs } from './fitness'
import { type Exercise, type ManualPR, displayNumber, localDate, nowIso, parseNumber, uid, weightLabels } from './model'
import { Button, Confirm, Dialog, Empty, Field, FormActions, IconButton, PageHeading, SectionHeading, Tile, onSubmit, useAction } from './ui'

export function PRPage({ snapshot, notify }: { snapshot: Snapshot; notify: (message: string) => void }) {
  const [editing, setEditing] = useState<ManualPR | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ManualPR | null>(null)
  const records = calculatePRs(snapshot.exercises, snapshot.workouts, snapshot.manualPRs)
  const exercises = [...snapshot.exercises].sort((a, b) => a.name.localeCompare(b.name))
  const manual = [...snapshot.manualPRs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  return <>
    <PageHeading title="個人最佳紀錄" description="查看每個負重動作實際完成過的最高重量。"
      action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>手動記錄 PR</Button>} />
    <section className="panel">
      <SectionHeading title="目前 PR" icon={Trophy} tone="amber" count={records.size} />
      {!records.size && <Empty icon={Trophy} large title="尚未建立 PR" message="完成負重動作後，儲存 Workout 即可自動建立 PR。" />}
      {exercises.filter(exercise => records.has(exercise.id)).map(exercise => {
        const history = records.get(exercise.id)!
        const current = history.at(-1)!
        return <details key={exercise.id} className="history-item">
          <summary className="collapse-row pr-summary">
            <Tile icon={Medal} tone="amber" />
            <span><strong>{exercise.name}</strong><small>{current.date} · {current.reps} Reps · {weightLabels[exercise.weightType]}</small></span>
            <span className="pr-weight">{displayNumber.format(current.weight)} <small>kg</small></span>
            <ChevronDown size={18} className="summary-chevron" />
          </summary>
          <div className="history-detail">
            <h3>PR 歷史</h3>
            {[...history].reverse().map((result, index) => <div className="pr-history-row" key={result.source + result.sourceId}>
              <div className="row-text"><strong>{displayNumber.format(result.weight)} kg × {result.reps}</strong>
                <small>{result.date} · {result.source === 'manual' ? '手動 PR' : 'Workout'}</small></div>
              {index === history.length - 1 && <span className="tag">首次 PR</span>}
            </div>)}
          </div>
        </details>
      })}
    </section>
    <section className="panel">
      <SectionHeading title="手動 PR 紀錄" icon={Pencil} count={manual.length} />
      {!manual.length && <p className="panel-copy padded-bottom">沒有手動 PR。可補記獨立於 Workout 的最佳成績。</p>}
      {manual.map(record => <div className="list-row" key={record.id}>
        <div className="row-text"><strong>{exercises.find(exercise => exercise.id === record.exerciseId)?.name}</strong>
          <small>{record.date} · {displayNumber.format(record.weight)} kg × {record.reps}</small></div>
        <div className="inline-actions">
          <IconButton icon={Pencil} label={`編輯 ${record.date} 手動 PR`} onClick={() => setEditing(record)} />
          <IconButton icon={Trash2} label={`刪除 ${record.date} 手動 PR`} variant="quiet" onClick={() => setDeleting(record)} />
        </div>
      </div>)}
    </section>
    {editing && <ManualForm exercises={exercises} original={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); notify('已儲存手動 PR。') }} />}
    {deleting && <Confirm title="刪除手動 PR？" message="刪除後會重新計算目前最高重量及突破歷史。"
      onClose={() => setDeleting(null)} onConfirm={async () => { await removeRecord(db.manualPRs, deleting); notify('已刪除手動 PR。') }} />}
  </>
}

function ManualForm({ original, exercises, onClose, onSaved }: { original?: ManualPR; exercises: Exercise[]; onClose: () => void; onSaved: () => void }) {
  const choices = exercises.filter(exercise => exercise.prEligible && (!exercise.archived || exercise.id === original?.exerciseId))
  const [values, setValues] = useState({
    exerciseId: original?.exerciseId ?? '', date: original?.date ?? localDate(),
    weight: original?.weight.toString() ?? '', reps: original?.reps.toString() ?? '',
  })
  const definition = choices.find(exercise => exercise.id === values.exerciseId)
  const action = useAction()
  return <Dialog title={original ? '編輯手動 PR' : '手動記錄 PR'} onClose={() => { if (!action.pending) onClose() }}>
    <form className="stack compact" onSubmit={onSubmit(action, async () => {
      const weight = parseNumber(values.weight)
      const reps = parseNumber(values.reps)
      if (!Number.isFinite(weight) || weight <= 0 || !Number.isSafeInteger(reps) || reps <= 0) {
        throw new Error('請輸入大於 0 的重量及有效的已完成 Reps。')
      }
      const stamp = nowIso()
      await saveManualPR({
        ...values, weight, reps, id: original?.id ?? uid(), createdAt: original?.createdAt ?? stamp, updatedAt: stamp,
      }, original?.updatedAt)
      onSaved()
    })}>
      <Field label="動作" hint={definition && weightLabels[definition.weightType]}>
        <select autoFocus required value={values.exerciseId} onChange={event => setValues({ ...values, exerciseId: event.target.value })}>
          <option value="">選擇合資格動作</option>
          {choices.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
        </select>
      </Field>
      <Field label="日期"><input required type="date" max={localDate()} value={values.date} onChange={event => setValues({ ...values, date: event.target.value })} /></Field>
      <div className="form-grid">
        <Field label="實際重量（kg）"><input required inputMode="decimal" maxLength={40} value={values.weight} onChange={event => setValues({ ...values, weight: event.target.value })} /></Field>
        <Field label="完成 Reps"><input required inputMode="numeric" maxLength={40} value={values.reps} onChange={event => setValues({ ...values, reps: event.target.value })} /></Field>
      </div>
      <FormActions action={action} onClose={onClose} />
    </form>
  </Dialog>
}
