import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { parseBackup, serializeBackup, serializeCsv } from '../../src/backup'
import {
  backupDue, beginDraft, commitDraft, db, deleteWorkout, getSnapshot, replaceSnapshot,
  saveExercise, saveManualPR, saveMeasurement, saveTemplate, updateDraft,
} from '../../src/db'
import { calculatePRs, createDraft, fromWorkout } from '../../src/fitness'
import { nowIso, uid } from '../../src/model'

beforeEach(async () => { await db.open() })
afterEach(async () => { await db.delete() })

async function example(weight = '12.5') {
  const data = await getSnapshot()
  const exercise = data.exercises.find(item => item.id === 'dumbbell-bench-press')!
  const draft = await beginDraft(createDraft('2025-02-03', 'Upper A', [exercise]))
  const updated = { ...draft, revision: uid(), exercises: draft.exercises.map(item => ({
    ...item, sets: [{ id: uid(), weight, reps: '8' }],
  })) }
  await updateDraft(updated, draft.revision)
  return { exercise, draft, updated }
}

test('publishes a draft atomically, deduplicates concurrent saves, and guards stale revisions', async () => {
  const { draft, updated } = await example()
  await expect(updateDraft(draft, draft.revision)).rejects.toThrow('草稿')
  const results = await Promise.allSettled([commitDraft(updated.id, updated.revision), commitDraft(updated.id, updated.revision)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const data = await getSnapshot()
  expect(data.drafts).toHaveLength(0)
  expect(data.workouts).toHaveLength(1)
  expect(data.workouts[0].exercises[0].sets[0]).toMatchObject({ weight: 12.5, reps: 8 })
})

test('preserves draft after a validation error, and deletes editing drafts with the original workout', async () => {
  const { draft, updated } = await example()
  const invalid = { ...updated, revision: uid(), exercises: updated.exercises.map(item => ({
    ...item, sets: [{ id: uid(), weight: '12', reps: '' }],
  })) }
  await updateDraft(invalid, updated.revision)
  await expect(commitDraft(draft.id, invalid.revision)).rejects.toThrow('第 1 組')
  expect((await getSnapshot()).drafts).toHaveLength(1)
  await updateDraft(updated, invalid.revision)
  const saved = await commitDraft(updated.id, updated.revision)
  const edit = await beginDraft(fromWorkout(saved))
  expect((await beginDraft(fromWorkout(saved))).id).toBe(edit.id)
  await deleteWorkout(saved)
  expect((await getSnapshot()).drafts).toHaveLength(0)
  expect((await getSnapshot()).workouts).toHaveLength(0)
})

test('templates preserve historical attribution and recorded exercises can be renamed but retain weight definition', async () => {
  const { exercise } = await example()
  const now = nowIso()
  const template = { id: 'temp', name: 'Full Body A', exerciseIds: [exercise.id], createdAt: now, updatedAt: now }
  await saveTemplate(template)
  const draft = createDraft('2025-01-01', 'Full Body A', [exercise], template)
  draft.exercises[0].sets = [{ id: uid(), weight: '10', reps: '10' }]
  await beginDraft(draft)
  await commitDraft(draft.id, draft.revision)
  await saveTemplate({ ...template, name: 'Upper B', updatedAt: nowIso() }, template.updatedAt)
  await saveExercise({ ...exercise, name: 'DB Bench', updatedAt: nowIso() }, exercise.updatedAt)
  const data = await getSnapshot()
  expect(data.workouts[0].template?.templateName).toBe('Full Body A')
  expect(data.exercises.find(item => item.id === exercise.id)?.name).toBe('DB Bench')
  await expect(saveExercise({ ...data.exercises.find(item => item.id === exercise.id)!, weightType: 'total' },
    data.exercises.find(item => item.id === exercise.id)!.updatedAt)).rejects.toThrow('鎖定')
})

test('manual PR must beat the current maximum even when entered on an old date', async () => {
  const { exercise, updated } = await example()
  await commitDraft(updated.id, updated.revision)
  const stamp = nowIso()
  const entry = { id: 'attempt', date: '2025-01-01', weight: 12.5, reps: 12, exerciseId: exercise.id, updatedAt: stamp, createdAt: stamp }
  await expect(saveManualPR(entry)).rejects.toThrow('超越')
  await saveManualPR({ ...entry, weight: 20 })
  const snapshot = await getSnapshot()
  expect(snapshot.workouts).toHaveLength(1)
  expect(calculatePRs(snapshot.exercises, snapshot.workouts, snapshot.manualPRs).get(exercise.id)?.map(item => item.weight)).toEqual([20])
})

test('round trips complete JSON, checks references, and preserves old records when replacement rolls back', async () => {
  const { updated } = await example()
  await commitDraft(updated.id, updated.revision)
  const stamp = nowIso()
  const measurement = { id: 'a', date: '2026-02-28', time: '20:30', weight: 72, note: '=SUM(1;2)', createdAt: stamp, updatedAt: stamp }
  await saveMeasurement(measurement)
  await saveMeasurement({ ...measurement, id: 'b', weight: 72.2 })
  const data = await getSnapshot()
  const json = serializeBackup(data)
  expect(parseBackup(json)).toEqual(data)
  expect(serializeCsv(data, 'weight')).toContain("'=SUM")
  expect(() => parseBackup(json.replace('"schemaVersion": 1', '"schemaVersion": 2'))).toThrow('Schema Version')
  expect(() => parseBackup(serializeBackup({ ...data, templates: [{
    id: 'broken', name: 'Broken', exerciseIds: ['missing'], createdAt: stamp, updatedAt: stamp,
  }] }))).toThrow('不存在')
  await expect(replaceSnapshot({ ...data, workouts: [...data.workouts, ...data.workouts] })).rejects.toThrow()
  expect((await getSnapshot()).measurements).toHaveLength(2)
  await replaceSnapshot({ ...data, workouts: [] })
  expect((await getSnapshot()).workouts).toHaveLength(0)
  await replaceSnapshot(parseBackup(json))
  expect((await getSnapshot()).workouts).toEqual(data.workouts)
})

test('reminders start after seven days and snooze lasts one day', async () => {
  const { settings } = await getSnapshot()
  const day = 86_400_000
  const start = Date.parse(settings.createdAt)
  expect(backupDue(settings, start + 7 * day - 1)).toBe(false)
  expect(backupDue(settings, start + 7 * day)).toBe(true)
  const remindedAt = new Date(start + 7 * day).toISOString()
  expect(backupDue({ ...settings, remindedAt }, start + 7 * day + 1)).toBe(false)
  expect(backupDue({ ...settings, remindedAt }, start + 8 * day)).toBe(true)
})
