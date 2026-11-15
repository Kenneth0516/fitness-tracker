import {
  type Draft, type DraftExercise, type Exercise, type ManualPR, type Measurement, type Workout,
  type WorkoutExercise, type WorkoutTemplate, dateFromKey, dateSchema, nowIso, offsetDay, parseNumber, uid,
  workoutSchema, supportsPR,
} from './model'

export function compareWorkouts(a: Workout, b: Workout) {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

export function newDraftExercise(exercise: Exercise): DraftExercise {
  return { id: uid(), exerciseId: exercise.id, weightType: exercise.weightType, notes: '', sets: [] }
}

export function createDraft(date: string, name: string, exercises: Exercise[], template?: WorkoutTemplate): Draft {
  const stamp = nowIso()
  return {
    id: uid(), revision: uid(), date, name, source: null, createdAt: stamp, updatedAt: stamp,
    template: template ? { templateId: template.id, templateName: template.name } : null,
    exercises: exercises.map(exercise => {
      const draftExercise = newDraftExercise(exercise)
      const count = template?.setCounts?.[exercise.id] ?? 0
      draftExercise.sets = Array.from({ length: count }, () => newDraftSet(draftExercise))
      return draftExercise
    }),
  }
}

export function fromWorkout(workout: Workout, duplicateTo?: string): Draft {
  const draft = createDraft(duplicateTo ?? workout.date, workout.name, [])
  return {
    ...draft,
    template: workout.template,
    source: duplicateTo === undefined ? { id: workout.id, revision: workout.revision } : null,
    exercises: workout.exercises.map(exercise => ({
      ...exercise, id: duplicateTo === undefined ? exercise.id : uid(),
      sets: exercise.sets.map(set => ({
        ...set, id: duplicateTo === undefined ? set.id : uid(),
        weight: exercise.weightType === 'bodyweight' ? '' : String(set.weight), reps: String(set.reps),
      })),
    })),
  }
}

export function newDraftSet(exercise: DraftExercise) {
  return { id: uid(), weight: exercise.sets.at(-1)?.weight ?? '', reps: '' }
}

export function copyPreviousSets(previous: WorkoutExercise) {
  return previous.sets.map(set => ({
    id: uid(), weight: previous.weightType === 'bodyweight' ? '' : String(set.weight), reps: String(set.reps),
  }))
}

export function previousExercise(workouts: Workout[], exerciseId: string, before: string, exclude?: string) {
  return workouts.filter(workout => workout.date < before && workout.id !== exclude)
    .sort((a, b) => compareWorkouts(b, a))
    .flatMap(workout => workout.exercises.filter(item => item.exerciseId === exerciseId).map(exercise => ({
      date: workout.date, exercise,
    })))[0]
}

export function prepareWorkout(draft: Draft, exercises: Map<string, Exercise>, original?: Workout): Workout {
  if (!dateSchema.safeParse(draft.date).success) throw new Error('請輸入有效的訓練日期。')
  if (!draft.name.trim()) throw new Error('請輸入 Workout 名稱。')
  const recorded = draft.exercises.flatMap(exercise => {
    const definition = exercises.get(exercise.exerciseId)
    if (!definition || definition.weightType !== exercise.weightType) throw new Error('動作的重量設定已變更。請重新加入該動作。')
    const sets = exercise.sets.flatMap((set, index) => {
      const hasWeight = set.weight.trim() !== ''
      const hasReps = set.reps.trim() !== ''
      if (!hasWeight && !hasReps) return []
      const reps = parseNumber(set.reps)
      const weight = exercise.weightType === 'bodyweight' ? 0 : parseNumber(set.weight)
      if (!Number.isSafeInteger(reps) || reps < 1 || !Number.isFinite(weight) || weight < 0 || weight > Number.MAX_SAFE_INTEGER) {
        throw new Error(`${definition.name} 第 ${index + 1} 組需要有效${exercise.weightType === 'bodyweight' ? ' Reps' : '的重量及 Reps'}。Reps 必須為正整數。`)
      }
      return [{ id: set.id, weight, reps }]
    })
    if (!sets.length && exercise.notes.trim()) {
      throw new Error(`${definition.name} 有備註，請輸入至少一組有效成績，或清除備註。`)
    }
    return sets.length ? [{ ...exercise, sets }] : []
  })
  if (!recorded.length) throw new Error('請至少輸入一組有效成績。')
  return workoutSchema.parse({
    id: original?.id ?? uid(), revision: uid(), createdAt: original?.createdAt ?? nowIso(),
    updatedAt: nowIso(), date: draft.date, name: draft.name, template: draft.template, exercises: recorded,
  })
}

export type PRResult = { exerciseId: string; source: 'workout' | 'manual'; sourceId: string; date: string; createdAt: string; weight: number; reps: number }

export function calculatePRs(exercises: Exercise[], workouts: Workout[], manual: ManualPR[]) {
  const eligible = new Set(exercises.filter(exercise => exercise.prEligible && supportsPR(exercise.weightType)).map(exercise => exercise.id))
  const candidates: PRResult[] = []
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (!eligible.has(exercise.exerciseId) || !supportsPR(exercise.weightType)) continue
      // Each workout contributes its best completed set. Earlier sets win a tie.
      const best = exercise.sets.reduce((current, set) => set.weight > current.weight ? set : current)
      if (best.weight <= 0) continue
      candidates.push({
        exerciseId: exercise.exerciseId, source: 'workout', sourceId: workout.id,
        date: workout.date, createdAt: workout.createdAt, weight: best.weight, reps: best.reps,
      })
    }
  }
  for (const entry of manual) {
    if (eligible.has(entry.exerciseId)) candidates.push({ ...entry, source: 'manual', sourceId: entry.id })
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.sourceId.localeCompare(b.sourceId))
  const records = new Map<string, PRResult[]>()
  for (const candidate of candidates) {
    const history = records.get(candidate.exerciseId) ?? []
    if (candidate.weight <= (history.at(-1)?.weight ?? 0)) continue
    history.push(candidate)
    records.set(candidate.exerciseId, history)
  }
  return records
}

export function exerciseProgress(workouts: Workout[], exerciseId: string) {
  return [...workouts].sort(compareWorkouts).flatMap(workout => workout.exercises
    .filter(exercise => exercise.exerciseId === exerciseId)
    .map(exercise => {
      const repetitions = exercise.sets.reduce((sum, set) => sum + set.reps, 0)
      const volume = supportsPR(exercise.weightType) ? exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0) : null
      return {
        id: workout.id, date: workout.date, name: workout.name, exercise, repetitions, volume,
        best: exercise.weightType === 'bodyweight' ? null : exercise.weightType === 'assistance'
          ? Math.min(...exercise.sets.map(set => set.weight)) : Math.max(...exercise.sets.map(set => set.weight)),
      }
    }))
}

export function compareMeasurements(a: Measurement, b: Measurement) {
  return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

export function dailyMeans(measurements: Measurement[]) {
  const daily = new Map<string, { sum: number; count: number }>()
  for (const measurement of measurements) {
    const totals = daily.get(measurement.date) ?? { sum: 0, count: 0 }
    totals.sum += measurement.weight
    totals.count++
    daily.set(measurement.date, totals)
  }
  return new Map([...daily].map(([date, values]) => [date, values.sum / values.count]))
}

export function sevenDayAverage(means: Map<string, number>, end: string) {
  let total = 0
  let days = 0
  for (let offset = -6; offset <= 0; offset++) {
    const mean = means.get(offsetDay(end, offset))
    if (mean !== undefined) {
      total += mean
      days++
    }
  }
  return { value: days ? total / days : null, days }
}

export function weightChartData(measurements: Measurement[], start: string, end: string) {
  const means = dailyMeans(measurements)
  const points = measurements.filter(item => item.date >= start && item.date <= end).sort(compareMeasurements)
  return points.map((item, index) => ({
    ...item, timestamp: dateFromKey(item.date, item.time).getTime(),
    average: item.date !== points[index + 1]?.date ? sevenDayAverage(means, item.date).value : null,
  }))
}
