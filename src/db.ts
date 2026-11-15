import Dexie, { type Table } from 'dexie'
import {
  type Draft, type Exercise, type ManualPR, type Measurement, type Settings, type Workout, type WorkoutTemplate,
  draftSchema, exerciseSchema, manualSchema, measurementSchema, nowIso, settingsSchema, templateSchema,
} from './model'
import { builtInExercises } from './exercises'
import { calculatePRs, prepareWorkout } from './fitness'

export class FitnessDatabase extends Dexie {
  exercises!: Table<Exercise, string>
  templates!: Table<WorkoutTemplate, string>
  workouts!: Table<Workout, string>
  manualPRs!: Table<ManualPR, string>
  measurements!: Table<Measurement, string>
  settings!: Table<Settings, string>
  drafts!: Table<Draft, string>

  constructor(name = 'fitness-tracker-v1') {
    super(name)
    // Exercises and sets are ordered children of a workout, saved in the same record.
    this.version(1).stores({
      exercises: 'id, muscle',
      templates: 'id, updatedAt',
      workouts: 'id, date, updatedAt',
      manualPRs: 'id, exerciseId, date',
      measurements: 'id, [date+time]',
      settings: 'id',
      drafts: 'id, updatedAt, source.id',
    })
    this.on('populate', async () => {
      const stamp = nowIso()
      await this.exercises.bulkAdd(builtInExercises(stamp))
      await this.settings.add({ id: 'app', createdAt: stamp, updatedAt: stamp, lastBackupAt: null, remindedAt: null })
    })
  }
}

export const db = new FitnessDatabase()

export async function getSnapshot() {
  return db.transaction('r', db.tables, async () => {
    const [exercises, templates, workouts, manualPRs, measurements, settings, drafts] = await Promise.all([
      db.exercises.toArray(), db.templates.toArray(), db.workouts.toArray(), db.manualPRs.toArray(),
      db.measurements.toArray(), db.settings.get('app'), db.drafts.toArray(),
    ])
    if (!settings) throw new Error('無法載入應用程式設定。')
    return { exercises, templates, workouts, manualPRs, measurements, settings, drafts }
  })
}
export type Snapshot = Awaited<ReturnType<typeof getSnapshot>>

function requireCurrent<T extends { updatedAt: string }>(current: T | undefined, expected: string | undefined) {
  if (current?.updatedAt !== expected) throw new Error('這筆資料已在其他頁面變更，請重新開啟後再操作。')
}

export async function saveExercise(input: Exercise, expected?: string) {
  const exercise = exerciseSchema.parse(input)
  return db.transaction('rw', db.exercises, db.workouts, db.manualPRs, db.drafts, async () => {
    const original = await db.exercises.get(exercise.id)
    requireCurrent(original, expected)
    if (original && (original.weightType !== exercise.weightType || original.prEligible !== exercise.prEligible)) {
      const inUse = await exerciseHasRecords(exercise.id)
      if (inUse) throw new Error('此動作已有紀錄或草稿，重量類型及 PR 設定已鎖定。')
    }
    await db.exercises.put(exercise)
  })
}

export async function exerciseHasRecords(id: string) {
  const [workout, manual, draft] = await Promise.all([
    db.workouts.filter(item => item.exercises.some(exercise => exercise.exerciseId === id)).first(),
    db.manualPRs.where('exerciseId').equals(id).first(),
    db.drafts.filter(item => item.exercises.some(exercise => exercise.exerciseId === id)).first(),
  ])
  return Boolean(workout || manual || draft)
}

export async function saveTemplate(input: WorkoutTemplate, expected?: string) {
  const template = templateSchema.parse(input)
  return db.transaction('rw', db.templates, db.exercises, async () => {
    const original = await db.templates.get(template.id)
    requireCurrent(original, expected)
    const definitions = await db.exercises.bulkGet(template.exerciseIds)
    if (definitions.some(exercise => !exercise)) {
      throw new Error('有動作無法使用，請重新選擇。')
    }
    await db.templates.put(template)
  })
}

export async function beginDraft(input: Draft) {
  const draft = draftSchema.parse(input)
  return db.transaction('rw', db.drafts, db.workouts, db.exercises, async () => {
    if (draft.source) {
      const existing = await db.drafts.where('source.id').equals(draft.source.id).first()
      if (existing) return existing
      if ((await db.workouts.get(draft.source.id))?.revision !== draft.source.revision) {
        throw new Error('訓練紀錄已更新，請重新開啟。')
      }
    }
    const definitions = await db.exercises.bulkGet(draft.exercises.map(exercise => exercise.exerciseId))
    if (draft.exercises.some((exercise, index) => definitions[index]?.weightType !== exercise.weightType)) {
      throw new Error('動作的重量設定已變更，請重新選擇。')
    }
    await db.drafts.add(draft)
    return draft
  })
}

export async function updateDraft(input: Draft, expectedRevision: string) {
  const draft = draftSchema.parse(input)
  await db.transaction('rw', db.drafts, db.exercises, async () => {
    const current = await db.drafts.get(draft.id)
    if (current?.revision !== expectedRevision) throw new Error('草稿已在其他頁面更新，請重新開啟。')
    const definitions = await db.exercises.bulkGet(draft.exercises.map(exercise => exercise.exerciseId))
    if (draft.exercises.some((exercise, index) => definitions[index]?.weightType !== exercise.weightType)) {
      throw new Error('動作的重量設定已變更，請重新選擇。')
    }
    await db.drafts.put(draft)
  })
}

export async function discardDraft(draft: Draft) {
  await db.transaction('rw', db.drafts, async () => {
    if ((await db.drafts.get(draft.id))?.revision !== draft.revision) throw new Error('草稿已變更，請重新開啟。')
    await db.drafts.delete(draft.id)
  })
}

export async function commitDraft(id: string, revision: string) {
  return db.transaction('rw', db.drafts, db.workouts, db.exercises, async () => {
    const draft = await db.drafts.get(id)
    if (!draft || draft.revision !== revision) throw new Error('草稿已變更，請重新開啟。')
    const original = draft.source ? await db.workouts.get(draft.source.id) : undefined
    if (draft.source && original?.revision !== draft.source.revision) {
      throw new Error('原本的 Workout 已更新或刪除，請重新開啟。')
    }
    const definitions = await db.exercises.bulkGet(draft.exercises.map(exercise => exercise.exerciseId))
    const workout = prepareWorkout(draft, new Map(definitions.filter(item => item !== undefined).map(item => [item.id, item])), original)
    await db.workouts.put(workout)
    await db.drafts.delete(id)
    return workout
  })
}

export async function deleteWorkout(workout: Workout) {
  await db.transaction('rw', db.workouts, db.drafts, async () => {
    if ((await db.workouts.get(workout.id))?.revision !== workout.revision) throw new Error('Workout 已變更，請重新開啟。')
    await db.workouts.delete(workout.id)
    await db.drafts.where('source.id').equals(workout.id).delete()
  })
}

export async function saveManualPR(input: ManualPR, expected?: string) {
  const entry = manualSchema.parse(input)
  await db.transaction('rw', db.manualPRs, db.exercises, db.workouts, async () => {
    const original = await db.manualPRs.get(entry.id)
    requireCurrent(original, expected)
    const exercise = await db.exercises.get(entry.exerciseId)
    if (!exercise?.prEligible || (exercise.archived && original?.exerciseId !== entry.exerciseId)) {
      throw new Error('請選擇可以記錄 PR 的負重動作。')
    }
    const workouts = await db.workouts.toArray()
    const manual = await db.manualPRs.where('exerciseId').equals(entry.exerciseId).toArray()
    const history = calculatePRs([exercise], workouts, manual.filter(item => item.id !== entry.id)).get(entry.exerciseId) ?? []
    // A new entry must beat the current maximum. A correction can still be a valid historical PR.
    const comparison = original?.exerciseId === entry.exerciseId
      ? history.filter(item => item.date < entry.date || (item.date === entry.date &&
          (item.createdAt < entry.createdAt || (item.createdAt === entry.createdAt && item.sourceId < entry.id))))
      : history
    const maximum = comparison.at(-1)?.weight
    if (maximum !== undefined && entry.weight <= maximum) {
      throw new Error(`重量必須超越 ${maximum} kg 才可記錄成 PR。`)
    }
    await db.manualPRs.put(entry)
  })
}

export async function saveMeasurement(input: Measurement, expected?: string) {
  const measurement = measurementSchema.parse(input)
  await db.transaction('rw', db.measurements, async () => {
    requireCurrent(await db.measurements.get(measurement.id), expected)
    await db.measurements.put(measurement)
  })
}

export async function removeRecord<T extends { id: string; updatedAt: string }>(table: Table<T, string>, record: T) {
  await db.transaction('rw', table, async () => {
    requireCurrent(await table.get(record.id), record.updatedAt)
    await table.delete(record.id)
  })
}

export async function markBackup(kind: 'export' | 'dismiss') {
  const stamp = nowIso()
  const changes = kind === 'export' ? { lastBackupAt: stamp, remindedAt: null } : { remindedAt: stamp }
  await db.settings.update('app', { ...changes, updatedAt: stamp })
}

export function backupDue(settings: Settings, time = Date.now()) {
  const day = 86_400_000
  return time - Date.parse(settings.lastBackupAt ?? settings.createdAt) >= 7 * day &&
    (!settings.remindedAt || time - Date.parse(settings.remindedAt) >= day)
}

export async function replaceSnapshot(snapshot: Snapshot) {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()))
    await Promise.all([
      db.exercises.bulkAdd(snapshot.exercises), db.templates.bulkAdd(snapshot.templates), db.workouts.bulkAdd(snapshot.workouts),
      db.manualPRs.bulkAdd(snapshot.manualPRs), db.measurements.bulkAdd(snapshot.measurements),
      db.settings.add(settingsSchema.parse(snapshot.settings)),
      // Invalidate pending autosaves from tabs opened before the replacement.
      db.drafts.bulkAdd(snapshot.drafts.map(draft => ({ ...draft, revision: crypto.randomUUID() }))),
    ])
  })
}
