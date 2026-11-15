import { useState } from 'react'
import { Archive, ArrowRight, BookOpen, ChevronRight, Copy, DatabaseBackup, Download, Dumbbell, FileStack, HardDrive, Pencil, Plus, RotateCcw, Search, Settings as SettingsIcon, Trash2, Upload } from 'lucide-react'
import { downloadFile, parseBackup, serializeBackup, serializeCsv } from './backup'
import { db, getSnapshot, markBackup, removeRecord, replaceSnapshot, saveExercise, saveTemplate, type Snapshot } from './db'
import {
  type Exercise, type WorkoutTemplate, equipment, equipmentLabels, localDate, maxTemplateSetCount, muscleLabels, muscles, nowIso, supportsPR, uid, weightLabels, weightTypes,
} from './model'
import {
  BackButton, Button, Confirm, Dialog, Empty, ExercisePicker, Field, FormActions, IconButton, Notice, OrderActions, PageHeading, SectionHeading, Tile,
  moveItem, onSubmit, useAction,
} from './ui'

type Props = { snapshot: Snapshot; navigate: (path: string) => void; notify: (message: string) => void }

export function MorePage({ navigate }: Pick<Props, 'navigate'>) {
  const rows = [
    { title: '動作庫', detail: '瀏覽、建立及封存動作。', icon: BookOpen, tone: 'blue', route: 'library' },
    { title: '管理 Workout Templates', detail: '整理常用動作及排列次序。', icon: FileStack, tone: 'violet', route: 'templates' },
    { title: '備份與還原', detail: '匯出 JSON、CSV，或還原本機備份。', icon: DatabaseBackup, tone: 'teal', route: 'backup' },
    { title: '設定', detail: '查看本地儲存及備份狀態。', icon: SettingsIcon, tone: 'amber', route: 'settings' },
  ]
  return <>
    <PageHeading title="更多" description="管理動作、Template 與本地資料。" />
    <div className="panel">
      {rows.map(row => <button className="more-row" key={row.route} type="button" onClick={() => navigate(`more/${row.route}`)}>
        <Tile icon={row.icon} tone={row.tone} /><span><strong>{row.title}</strong><small>{row.detail}</small></span><ChevronRight size={19} />
      </button>)}
    </div>
  </>
}

export function LibraryPage({ snapshot, navigate, notify }: Props) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [archived, setArchived] = useState(false)
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const [toggling, setToggling] = useState<Exercise | null>(null)
  const used = new Set([
    ...snapshot.workouts.flatMap(item => item.exercises.map(exercise => exercise.exerciseId)),
    ...snapshot.drafts.flatMap(item => item.exercises.map(exercise => exercise.exerciseId)),
    ...snapshot.manualPRs.map(item => item.exerciseId),
  ])
  const shown = snapshot.exercises.filter(exercise => exercise.archived === archived &&
    (!group || exercise.muscle === group) && exercise.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  return <>
    <BackButton onClick={() => navigate('more')}>返回更多</BackButton>
    <PageHeading title="動作庫" description="每個動作都有固定的重量記錄方式。"
      action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>新增自訂動作</Button>} />
    <section className="panel">
      <SectionHeading title={archived ? '已封存動作' : '可用動作'} icon={Dumbbell} count={shown.length} />
      <div className="filter-box">
        <div className="form-grid">
          <div className="search-field"><Search size={17} /><input type="search" aria-label="搜尋動作" placeholder="搜尋動作名稱" value={query} onChange={event => setQuery(event.target.value)} /></div>
          <select aria-label="肌群" value={group} onChange={event => setGroup(event.target.value)}>
            <option value="">所有肌群</option>
            {muscles.map(muscle => <option value={muscle} key={muscle}>{muscleLabels[muscle]}</option>)}
          </select>
        </div>
        <div className="segments">
          <button type="button" aria-pressed={!archived} onClick={() => setArchived(false)}>可用</button>
          <button type="button" aria-pressed={archived} onClick={() => setArchived(true)}>已封存</button>
        </div>
      </div>
      {shown.length ? shown.map(exercise => <div className="list-row library-row" key={exercise.id}>
        <div className="row-text"><strong>{exercise.name}</strong><small>
          {muscleLabels[exercise.muscle]} · {equipmentLabels[exercise.equipment]} · {weightLabels[exercise.weightType]}
          {exercise.prEligible ? ' · PR' : ''} · {exercise.builtIn ? '內置' : '自訂'}
        </small>{exercise.notes && <p className="record-note">{exercise.notes}</p>}</div>
        <div className="inline-actions">
          <IconButton icon={Pencil} label={`編輯 ${exercise.name}`} onClick={() => setEditing(exercise)} />
          <IconButton icon={exercise.archived ? RotateCcw : Archive} label={`${exercise.archived ? '解除封存' : '封存'} ${exercise.name}`} variant="quiet" onClick={() => setToggling(exercise)} />
        </div>
      </div>) : <Empty icon={Search} title="沒有符合的動作" />}
    </section>
    {editing && <ExerciseForm original={editing === 'new' ? undefined : editing} inUse={editing !== 'new' && used.has(editing.id)}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify('已儲存動作。') }} />}
    {toggling && <Confirm title={toggling.archived ? '解除封存此動作？' : '封存此動作？'}
      message={toggling.archived ? `「${toggling.name}」將重新出現在動作選單。` : `「${toggling.name}」會從新增動作的選單隱藏。既有歷史仍可查看。`}
      label={toggling.archived ? '解除封存' : '封存'} danger={false} onClose={() => setToggling(null)}
      onConfirm={async () => {
        await saveExercise({ ...toggling, archived: !toggling.archived, updatedAt: nowIso() }, toggling.updatedAt)
        notify(toggling.archived ? '已解除封存。' : '已封存動作。')
      }} />}
  </>
}

function ExerciseForm({ original, inUse, onClose, onSaved }: { original?: Exercise; inUse: boolean; onClose: () => void; onSaved: () => void }) {
  const stamp = nowIso()
  const [values, setValues] = useState<Exercise>(() => original ?? {
    id: uid(), createdAt: stamp, updatedAt: stamp, name: '', muscle: 'chest', equipment: 'dumbbell',
    weightType: 'perDumbbell', prEligible: true, builtIn: false, archived: false, notes: '',
  })
  const locked = Boolean(original?.builtIn || inUse)
  const action = useAction()
  return <Dialog title={original ? '編輯動作' : '新增自訂動作'} onClose={() => { if (!action.pending) onClose() }}>
    <form className="stack compact" onSubmit={onSubmit(action, async () => {
      await saveExercise({ ...values, updatedAt: nowIso() }, original?.updatedAt)
      onSaved()
    })}>
      <Field label="動作名稱"><input autoFocus required maxLength={100} value={values.name} onChange={event => setValues({ ...values, name: event.target.value })} /></Field>
      <div className="form-grid">
        <Field label="主要肌群"><select disabled={original?.builtIn} value={values.muscle} onChange={event => setValues({ ...values, muscle: event.target.value as Exercise['muscle'] })}>
          {muscles.map(item => <option key={item} value={item}>{muscleLabels[item]}</option>)}
        </select></Field>
        <Field label="器材"><select disabled={original?.builtIn} value={values.equipment} onChange={event => setValues({ ...values, equipment: event.target.value as Exercise['equipment'] })}>
          {equipment.map(item => <option key={item} value={item}>{equipmentLabels[item]}</option>)}
        </select></Field>
      </div>
      <Field label="重量記錄類型" hint={locked ? '此動作的重量類型及 PR 設定已鎖定。' : undefined}>
        <select disabled={locked} value={values.weightType} onChange={event => {
          const weightType = event.target.value as Exercise['weightType']
          setValues({ ...values, weightType, prEligible: supportsPR(weightType) })
        }}>
          {weightTypes.map(item => <option key={item} value={item}>{weightLabels[item]}</option>)}
        </select>
      </Field>
      <label className="check-row"><input type="checkbox" disabled={locked || !supportsPR(values.weightType)} checked={values.prEligible}
        onChange={event => setValues({ ...values, prEligible: event.target.checked })} /> 計入 PR</label>
      <Field label="備註（選填）"><textarea rows={3} maxLength={2000} value={values.notes} onChange={event => setValues({ ...values, notes: event.target.value })} /></Field>
      <FormActions action={action} onClose={onClose} />
    </form>
  </Dialog>
}

export function TemplatesPage({ snapshot, navigate, notify, creating }: Props & { creating: boolean }) {
  const [editing, setEditing] = useState<{ template: WorkoutTemplate; duplicate: boolean } | null>(null)
  const [deleting, setDeleting] = useState<WorkoutTemplate | null>(null)
  const templates = [...snapshot.templates].sort((a, b) => a.name.localeCompare(b.name))
  const byId = new Map(snapshot.exercises.map(exercise => [exercise.id, exercise]))
  function close() { setEditing(null); if (creating) navigate('more/templates') }
  return <>
    <BackButton onClick={() => navigate('more')}>返回更多</BackButton>
    <PageHeading title="Workout Templates" description="儲存常用動作、順序與組數，開始 Workout 時直接套用。"
      action={<Button variant="primary" icon={Plus} onClick={() => navigate('more/templates/new')}>新增 Template</Button>} />
    <section className="panel">
      <SectionHeading title="我的 Templates" icon={FileStack} tone="violet" count={templates.length} />
      {templates.length ? templates.map(template => <div key={template.id} className="list-row">
        <div className="row-text"><strong>{template.name}</strong><small>{template.exerciseIds.length} 個動作 · {template.exerciseIds.map(id => {
          const name = byId.get(id)?.name ?? id
          const count = template.setCounts?.[id]
          return count === undefined ? name : `${name} × ${count} 組`
        }).join('、')}</small></div>
        <div className="inline-actions">
          <IconButton icon={Pencil} label={`編輯 ${template.name}`} onClick={() => setEditing({ template, duplicate: false })} />
          <IconButton icon={Copy} label={`複製 ${template.name}`} onClick={() => setEditing({ template, duplicate: true })} />
          <IconButton icon={Trash2} label={`刪除 ${template.name}`} variant="quiet" onClick={() => setDeleting(template)} />
        </div>
      </div>) : <Empty icon={FileStack} large title="尚未建立 Template" message="建立第一份動作組合，供日後訓練使用。" />}
    </section>
    {(creating || editing) && <TemplateForm snapshot={snapshot} initial={editing?.template} duplicate={editing?.duplicate} onClose={close}
      onSaved={() => { close(); notify('已儲存 Template。') }} />}
    {deleting && <Confirm title="刪除 Template？" message={`「${deleting.name}」將從 Template 清單移除。舊 Workout 保留建立時的 Template 名稱。`}
      onClose={() => setDeleting(null)} onConfirm={async () => { await removeRecord(db.templates, deleting); notify('已刪除 Template。') }} />}
  </>
}

function TemplateForm({ initial, duplicate, snapshot, onClose, onSaved }: {
  initial?: WorkoutTemplate; duplicate?: boolean; snapshot: Snapshot; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(duplicate && initial ? `${initial.name.slice(0, 95)}（副本）` : initial?.name ?? '')
  const [rows, setRows] = useState(() => initial?.exerciseIds.map(id => ({
    id, setCount: initial.setCounts?.[id]?.toString() ?? '',
  })) ?? [])
  const [picking, setPicking] = useState(false)
  const byId = new Map(snapshot.exercises.map(exercise => [exercise.id, exercise]))
  const action = useAction()
  const original = duplicate ? undefined : initial
  return <>
    <Dialog wide title={duplicate ? '複製 Template' : initial ? '編輯 Template' : '新增 Template'} onClose={() => { if (!action.pending) onClose() }}>
      <form className="stack compact" onSubmit={onSubmit(action, async () => {
        const stamp = nowIso()
        const setCounts = Object.fromEntries(rows.filter(row => row.setCount !== '').map(row => [row.id, Number(row.setCount)]))
        await saveTemplate({ id: original?.id ?? uid(), name, exerciseIds: rows.map(row => row.id),
          setCounts: Object.keys(setCounts).length ? setCounts : undefined,
          createdAt: original?.createdAt ?? stamp, updatedAt: stamp }, original?.updatedAt)
        onSaved()
      })}>
        <Field label="Template 名稱"><input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></Field>
        <div className="editor-heading"><h3>動作順序</h3><Button onClick={() => setPicking(true)} icon={Plus}>加入動作</Button></div>
        <p className="muted">{rows.length ? '組數可留空。套用 Template 時，會按組數建立空白 Sets。' : '尚未加入動作。'}</p>
        <ol className="template-order">
          {rows.map((row, index) => {
            const exercise = byId.get(row.id)
            const exerciseName = exercise?.name ?? row.id
            return <li key={row.id}>
              <div className="template-exercise">
                <span className="set-index">{index + 1}</span><span className="row-text"><strong>{exerciseName}</strong>
                  {exercise?.archived && <small>已封存</small>}</span>
              </div>
              <label className="template-set-count">組數
                <input type="number" inputMode="numeric" min={1} max={maxTemplateSetCount} step={1} placeholder="—"
                  aria-label={`${exerciseName} 組數`} value={row.setCount} onChange={event => {
                    const setCount = event.target.value
                    setRows(current => current.map(item => item.id === row.id ? { ...item, setCount } : item))
                  }} />
              </label>
              <OrderActions index={index} count={rows.length} label={exerciseName}
                onMove={delta => setRows(current => moveItem(current, index, delta))}
                onRemove={() => setRows(current => current.filter(item => item.id !== row.id))} />
            </li>
          })}
        </ol>
        <FormActions action={action} onClose={onClose} />
      </form>
    </Dialog>
    {picking && <ExercisePicker exercises={snapshot.exercises} excluded={rows.map(row => row.id)} onClose={() => setPicking(false)}
      onSelect={selected => { setRows(current => [...current, ...selected.map(exercise => ({ id: exercise.id, setCount: '' }))]); setPicking(false) }} />}
  </>
}

export async function exportBackup() {
  const data = await getSnapshot()
  downloadFile(`fitness-tracker-backup-${localDate()}.json`, serializeBackup(data), 'application/json')
  await markBackup('export')
}

export function BackupPage({ navigate, notify }: Props) {
  const [preview, setPreview] = useState<Snapshot | null>(null)
  const [filename, setFilename] = useState('')
  const [kind, setKind] = useState<'workouts' | 'weight' | 'pr'>('workouts')
  const action = useAction()
  return <>
    <BackButton onClick={() => navigate('more')}>返回更多</BackButton>
    <PageHeading title="備份與還原" description="將健身紀錄備份成檔案，或在此裝置還原。" />
    <Notice kind="info">清除瀏覽器資料、換裝置或裝置損壞可能導致本地紀錄消失。請把備份檔案另行保存。</Notice>
    <div className="feature-grid">
      <section className="panel">
        <SectionHeading title="匯出 JSON 備份" icon={Download} />
        <p className="panel-copy">包含動作、Template、Workout、PR、體重、設定與草稿。</p>
        <div className="panel-bottom"><Button variant="primary" icon={Download} disabled={action.pending} onClick={() => void action.run(async () => {
          await exportBackup(); notify('已觸發備份下載。請查看瀏覽器的下載項目。')
        })}>匯出備份</Button></div>
      </section>
      <section className="panel">
        <SectionHeading title="匯入 JSON 備份" icon={Upload} tone="teal" />
        <p className="panel-copy">先檢查檔案並預覽內容，確認後完整取代目前資料。</p>
        <div className="panel-bottom">
          <label className={`button button-secondary file-control ${action.pending ? 'disabled' : ''}`}>
            <Upload size={17} aria-hidden="true" />選擇 JSON 檔案
            <input type="file" accept=".json,application/json" aria-label="選擇 JSON 檔案" disabled={action.pending} onChange={event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void action.run(async () => { setPreview(parseBackup(await file.text())); setFilename(file.name) })
            }} />
          </label>
        </div>
      </section>
    </div>
    <section className="panel">
      <SectionHeading title="匯出 CSV" icon={FileStack} tone="violet" />
      <p className="panel-copy">可用試算表查閱及分析單一類型的紀錄。</p>
      <div className="panel-bottom csv-controls">
        <select aria-label="CSV 資料類型" value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
          <option value="workouts">Workout Sets</option><option value="weight">體重紀錄</option><option value="pr">手動 PR</option>
        </select>
        <Button icon={Download} disabled={action.pending} onClick={() => void action.run(async () => {
          downloadFile(`fitness-tracker-${kind}-${localDate()}.csv`, serializeCsv(await getSnapshot(), kind), 'text/csv;charset=utf-8')
          notify('已觸發 CSV 下載。')
        })}>匯出 CSV</Button>
      </div>
    </section>
    {action.error && <Notice>{action.error}</Notice>}
    {preview && <RestoreDialog preview={preview} file={filename} onClose={() => setPreview(null)} onRestored={() => {
      setPreview(null); notify('已還原備份，PR 與統計已重新計算。')
    }} />}
  </>
}

function RestoreDialog({ preview, file, onClose, onRestored }: {
  preview: Snapshot; file: string; onClose: () => void; onRestored: () => void
}) {
  const action = useAction()
  const counts: [string, number][] = [
    ['動作', preview.exercises.length], ['Templates', preview.templates.length], ['Workouts', preview.workouts.length],
    ['手動 PR', preview.manualPRs.length], ['體重紀錄', preview.measurements.length], ['草稿', preview.drafts.length],
  ]
  return <Dialog title="還原備份預覽" onClose={() => { if (!action.pending) onClose() }}>
    <form className="stack compact" onSubmit={onSubmit(action, async () => { await replaceSnapshot(preview); onRestored() })}>
      <p className="muted break-text">{file} · Schema v1</p>
      <dl className="backup-counts">{counts.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
      <Notice kind="info">還原將完整取代此網站目前的資料及草稿。</Notice>
      <label className="check-row"><input type="checkbox" required /> 我確認要取代目前資料</label>
      <FormActions action={action} onClose={onClose} label="確認還原" />
    </form>
  </Dialog>
}

export function SettingsPage({ snapshot, navigate }: Props) {
  const history = snapshot.settings.lastBackupAt
  return <>
    <BackButton onClick={() => navigate('more')}>返回更多</BackButton>
    <PageHeading title="設定" />
    <section className="panel">
      <SectionHeading title="本地儲存" icon={HardDrive} />
      <p className="panel-copy padded-bottom">所有健身紀錄都存於此瀏覽器的 IndexedDB，依網站及瀏覽器設定檔分開保存。清除瀏覽器資料前請先匯出備份。</p>
    </section>
    <section className="panel">
      <SectionHeading title="備份提醒" icon={DatabaseBackup} tone="teal" />
      <div className="panel-copy">
        <p>開啟網站時，如距上次匯出已滿七日便會提示備份。「稍後提醒」會延後一天。</p>
        <p>上次觸發匯出︰{history ? new Date(history).toLocaleString('zh-HK') : '尚未匯出'}</p>
      </div>
      <div className="panel-bottom"><Button icon={ArrowRight} onClick={() => navigate('more/backup')}>前往備份與還原</Button></div>
    </section>
  </>
}
