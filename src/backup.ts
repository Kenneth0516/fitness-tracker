import { z } from 'zod'
import { type Snapshot } from './db'
import { builtInIds } from './exercises'
import {
  draftSchema, exerciseSchema, manualSchema, measurementSchema, nowIso, settingsSchema, templateSchema, workoutSchema,
} from './model'

const backupSchema = z.object({
  format: z.literal('fitness-tracker'),
  schemaVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  data: z.object({
    exercises: z.array(exerciseSchema), templates: z.array(templateSchema), workouts: z.array(workoutSchema),
    manualPRs: z.array(manualSchema), measurements: z.array(measurementSchema), settings: settingsSchema,
    drafts: z.array(draftSchema),
  }),
})

export function serializeBackup(data: Snapshot) {
  return JSON.stringify({ format: 'fitness-tracker', schemaVersion: 1, exportedAt: nowIso(), data }, null, 2)
}

export function parseBackup(text: string) {
  let json: unknown
  try { json = JSON.parse(text) } catch { throw new Error('無法讀取 JSON，請選擇有效的備份檔案。') }
  if (typeof json === 'object' && json !== null && 'schemaVersion' in json && json.schemaVersion !== 1) {
    throw new Error('此備份的 Schema Version 尚未支援。')
  }
  const result = backupSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(`備份欄位無效（${issue.path.join('.')}）。`)
  }
  const { data } = result.data
  for (const items of [data.exercises, data.templates, data.workouts, data.manualPRs, data.measurements, data.drafts]) {
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('備份內有重複的記錄 ID。')
  }
  const definitions = new Map(data.exercises.map(item => [item.id, item]))
  if ([...builtInIds].some(id => !definitions.get(id)?.builtIn) ||
    data.exercises.some(item => item.builtIn !== builtInIds.has(item.id))) {
    throw new Error('備份的內置動作資料不完整。')
  }
  if (data.templates.some(template => template.exerciseIds.some(id => !definitions.has(id)))) {
    throw new Error('Template 引用的動作不存在。')
  }
  if ([...data.workouts, ...data.drafts].some(workout => workout.exercises.some(item => definitions.get(item.exerciseId)?.weightType !== item.weightType))) {
    throw new Error('訓練或草稿引用的動作或重量類型無效。')
  }
  if (data.manualPRs.some(entry => !definitions.get(entry.exerciseId)?.prEligible)) {
    throw new Error('手動 PR 引用了不合資格的動作。')
  }
  const sources = new Map(data.workouts.map(workout => [workout.id, workout.revision]))
  const editDrafts = data.drafts.flatMap(draft => draft.source ? [draft.source] : [])
  if (new Set(editDrafts.map(source => source.id)).size !== editDrafts.length ||
    editDrafts.some(source => sources.get(source.id) !== source.revision)) {
    throw new Error('編輯草稿引用的訓練版本不正確。')
  }
  return data
}

type Cell = string | number
function csvCell(value: Cell) {
  let text = String(value)
  if (typeof value === 'string' && /^[\s]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r\n]/.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}

export function serializeCsv(data: Snapshot, kind: 'workouts' | 'weight' | 'pr') {
  const names = new Map(data.exercises.map(exercise => [exercise.id, exercise.name]))
  let rows: Cell[][]
  switch (kind) {
    case 'workouts':
      rows = [['Date', 'Workout ID', 'Workout', 'Template', 'Exercise ID', 'Exercise', 'Weight Type', 'Set', 'Weight kg', 'Reps', 'Notes'],
        ...data.workouts.flatMap(workout => workout.exercises.flatMap(exercise => exercise.sets.map((set, index) =>
          [workout.date, workout.id, workout.name, workout.template?.templateName ?? '', exercise.exerciseId,
            names.get(exercise.exerciseId) ?? exercise.exerciseId, exercise.weightType, index + 1, set.weight, set.reps, exercise.notes])))]; break
    case 'weight':
      rows = [['Date', 'Time', 'Weight kg', 'Note'], ...data.measurements.map(item => [item.date, item.time, item.weight, item.note])]; break
    case 'pr':
      rows = [['Date', 'Exercise ID', 'Exercise', 'Weight kg', 'Reps'],
        ...data.manualPRs.map(item => [item.date, item.exerciseId, names.get(item.exerciseId) ?? item.exerciseId, item.weight, item.reps])]; break
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  try { anchor.click() } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
