import { describe, expect, test } from 'vitest'
import { builtInExercises } from '../../src/exercises'
import {
  calculatePRs, copyPreviousSets, createDraft, dailyMeans, exerciseProgress, fromWorkout, newDraftSet,
  prepareWorkout, previousExercise, sevenDayAverage, weightChartData,
} from '../../src/fitness'
import { isCalendarDate, type Measurement, type ManualPR, type Workout } from '../../src/model'

const stamp = '2026-03-01T00:00:00.000Z'
const exercises = builtInExercises(stamp)
const definitions = new Map(exercises.map(exercise => [exercise.id, exercise]))
const bench = definitions.get('dumbbell-bench-press')!
const squat = definitions.get('barbell-squat')!
const assistance = definitions.get('assisted-pull-up')!
const pushup = definitions.get('push-up')!

function workout(weight: string, date: string, reps = '8') {
  const draft = createDraft(date, 'Upper A', [bench])
  draft.exercises[0].sets = [{ id: 'set1', weight, reps }]
  return prepareWorkout(draft, definitions)
}

describe('Workout editor', () => {
  test('validates sets independently, ignores blank sets/exercises, and normalizes reps-only', () => {
    const draft = createDraft('2026-03-01', '  Upper A  ', [bench, squat, pushup])
    draft.exercises[0].sets = [{ id: '1', weight: '', reps: '' }, { id: '2', weight: '12,5', reps: '8' }]
    draft.exercises[2].sets = [{ id: '3', weight: '', reps: '12' }]
    const result = prepareWorkout(draft, definitions)
    expect(result.name).toBe('Upper A')
    expect(result.exercises.map(exercise => exercise.sets)).toEqual([
      [{ id: '2', weight: 12.5, reps: 8 }], [{ id: '3', weight: 0, reps: 12 }],
    ])
    expect(newDraftSet(draft.exercises[0])).toMatchObject({ weight: '12,5', reps: '' })
    draft.exercises[0].sets[0].weight = '10'
    expect(() => prepareWorkout(draft, definitions)).toThrow('第 1 組')
    draft.exercises[0].sets[0] = { id: '1', weight: '', reps: '7' }
    expect(() => prepareWorkout(draft, definitions)).toThrow('第 1 組')
    draft.exercises[0].sets.shift()
    draft.exercises[1].notes = 'Keep this note'
    expect(() => prepareWorkout(draft, definitions)).toThrow('有備註')
    expect(() => prepareWorkout(createDraft('2026-03-01', 'Empty', [bench]), definitions)).toThrow('至少')
  })

  test('previous data uses Exercise ID and dates strictly before the draft, without sharing Set IDs', () => {
    const history = [workout('10', '2026-03-02'), workout('12.5', '2026-03-08'), workout('15', '2026-03-09')]
    const previous = previousExercise(history, bench.id, '2026-03-08')!
    expect(previous.date).toBe('2026-03-02')
    expect(previousExercise(history, squat.id, '2026-04-01')).toBeUndefined()
    expect(copyPreviousSets(previous.exercise)[0]).toMatchObject({ weight: '10', reps: '8' })
    expect(copyPreviousSets(previous.exercise)[0].id).not.toBe(history[0].exercises[0].sets[0].id)
    expect(fromWorkout(history[0], '2026-03-10').source).toBeNull()
    expect(fromWorkout(history[0], '2026-03-10').exercises[0].sets[0].id).not.toBe('set1')
  })
})

describe('PR and exercise progress', () => {
  test('only chronological increases are PRs, with ties preserving the earlier performance', () => {
    const source = [
      workout('10', '2026-03-01'), workout('12.5', '2026-03-03', '5'),
      workout('12.5', '2026-03-04', '10'), workout('8', '2026-03-05', '20'), workout('15', '2026-03-06', '1'),
    ]
    expect(calculatePRs(exercises, [...source].reverse(), []).get(bench.id)?.map(({ weight, reps }) => [weight, reps]))
      .toEqual([[10, 8], [12.5, 5], [15, 1]])
    expect(calculatePRs(exercises, source.slice(0, -1), []).get(bench.id)?.at(-1)?.weight).toBe(12.5)
  })

  test('assistance and bodyweight are excluded, and manual PR never counts toward workouts or volume', () => {
    const draft = createDraft('2026-03-05', 'Run', [assistance, pushup])
    draft.exercises[0].sets = [{ id: 'assisted', weight: '30', reps: '10' }]
    draft.exercises[1].sets = [{ id: 'push', weight: '', reps: '10' }]
    const source: Workout[] = [workout('10', '2026-03-01'), prepareWorkout(draft, definitions)]
    const manual: ManualPR[] = [{ id: 'manual', exerciseId: bench.id, weight: 20, reps: 2, date: '2026-03-02', createdAt: stamp, updatedAt: stamp }]
    const result = calculatePRs(exercises, source, manual)
    expect([...result.keys()]).toEqual([bench.id])
    expect(result.get(bench.id)?.at(-1)).toMatchObject({ weight: 20, source: 'manual' })
    expect(exerciseProgress(source, bench.id).map(item => item.volume)).toEqual([80])
    expect(exerciseProgress(source, assistance.id)[0]).toMatchObject({ best: 30, volume: null, repetitions: 10 })
  })
})

test('weight averages use calendar days, preserve raw measurements and include earlier points in moving average', () => {
  const row = (id: string, date: string, weight: number, time: string): Measurement => ({ id, date, weight, time, note: '', createdAt: stamp, updatedAt: stamp })
  const measurements = [
    row('old', '2026-02-28', 60, '08:00'), row('a', '2026-03-01', 70, '08:00'),
    row('b', '2026-03-01', 74, '20:00'), row('c', '2026-03-05', 78, '09:00'),
  ]
  const average = sevenDayAverage(dailyMeans(measurements), '2026-03-07')
  expect(average).toEqual({ value: 75, days: 2 })
  const points = weightChartData(measurements, '2026-03-01', '2026-03-07')
  expect(points.map(item => item.weight)).toEqual([70, 74, 78])
  expect(points[1].timestamp - points[0].timestamp).toBe(12 * 3_600_000)
  expect(points.map(item => item.average)).toEqual([null, 66, 70])
  expect(isCalendarDate('2026-02-29')).toBe(false)
  expect(isCalendarDate('2028-02-29')).toBe(true)
})
