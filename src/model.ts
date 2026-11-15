import { z } from 'zod'

export const muscles = ['chest', 'back', 'shoulders', 'legs', 'arms', 'core'] as const
export const muscleLabels: Record<(typeof muscles)[number], string> = {
  chest: '胸部', back: '背部', shoulders: '肩部', legs: '腿部', arms: '手臂', core: '核心',
}

export const equipment = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'] as const
export const equipmentLabels: Record<(typeof equipment)[number], string> = {
  barbell: '槓鈴', dumbbell: '啞鈴', machine: '器械', cable: '滑輪', bodyweight: '自體重量', other: '其他',
}

export const weightTypes = ['perDumbbell', 'total', 'machine', 'assistance', 'added', 'bodyweight'] as const
export type WeightType = (typeof weightTypes)[number]
export const weightLabels: Record<WeightType, string> = {
  perDumbbell: '每隻啞鈴重量', total: '外加總重量', machine: '器械顯示重量',
  assistance: '輔助重量', added: '額外負重', bodyweight: '自體重量 · 只記 Reps',
}

export function supportsPR(type: WeightType) {
  return type !== 'assistance' && type !== 'bodyweight'
}

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const parsed = new Date(value + 'T00:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const dateSchema = z.string().refine(isCalendarDate, '請輸入有效日期。')
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '請輸入有效時間。')
const id = z.string().min(1).max(150)
const name = z.string().trim().min(1, '請輸入名稱。').max(100, '名稱最多 100 字。')
const note = z.string().max(2000, '備註最多 2,000 字。')
const stamp = z.iso.datetime()
const base = z.object({ id, createdAt: stamp, updatedAt: stamp })
const weight = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const reps = z.int().positive()
const unique = (values: string[]) => new Set(values).size === values.length

export const exerciseSchema = base.extend({
  name, muscle: z.enum(muscles), equipment: z.enum(equipment), weightType: z.enum(weightTypes),
  prEligible: z.boolean(), builtIn: z.boolean(), archived: z.boolean(), notes: note,
}).refine(exercise => !exercise.prEligible || supportsPR(exercise.weightType))

export const maxTemplateSetCount = 99

export const templateSchema = base.extend({
  name, exerciseIds: z.array(id).min(1, '請至少加入一個動作。').refine(unique),
  setCounts: z.record(id, z.int().min(1).max(maxTemplateSetCount)).optional(),
}).refine(template => Object.keys(template.setCounts ?? {}).every(id => template.exerciseIds.includes(id)), {
  path: ['setCounts'], message: '組數設定必須對應此 Template 內的動作。',
})

const workoutSetSchema = z.object({ id, weight, reps })
const workoutExerciseSchema = z.object({
  id, exerciseId: id, weightType: z.enum(weightTypes), notes: note,
  sets: z.array(workoutSetSchema).min(1).refine(sets => unique(sets.map(set => set.id))),
}).refine(exercise => exercise.weightType !== 'bodyweight' || exercise.sets.every(set => set.weight === 0))

const attribution = z.object({ templateId: id, templateName: name })
export const workoutSchema = base.extend({
  revision: id, date: dateSchema, name, template: attribution.nullable(),
  exercises: z.array(workoutExerciseSchema).min(1)
    .refine(items => unique(items.map(item => item.id)) && unique(items.map(item => item.exerciseId))),
})

export const manualSchema = base.extend({
  exerciseId: id, date: dateSchema, weight: weight.positive(), reps,
})
export const measurementSchema = base.extend({
  date: dateSchema, time: timeSchema, weight: weight.positive(), note,
})
export const settingsSchema = base.extend({
  id: z.literal('app'), lastBackupAt: stamp.nullable(), remindedAt: stamp.nullable(),
})
const draftSetSchema = z.object({ id, weight: z.string().max(40), reps: z.string().max(40) })
const draftExerciseSchema = z.object({
  id, exerciseId: id, weightType: z.enum(weightTypes), notes: note,
  sets: z.array(draftSetSchema).refine(sets => unique(sets.map(set => set.id))),
})
export const draftSchema = base.extend({
  revision: id, source: z.object({ id, revision: id }).nullable(),
  date: z.string().max(20), name: z.string().max(100), template: attribution.nullable(),
  exercises: z.array(draftExerciseSchema)
    .refine(items => unique(items.map(item => item.id)) && unique(items.map(item => item.exerciseId))),
})

export type Exercise = z.infer<typeof exerciseSchema>
export type WorkoutTemplate = z.infer<typeof templateSchema>
export type Workout = z.infer<typeof workoutSchema>
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>
export type WorkoutSet = z.infer<typeof workoutSetSchema>
export type ManualPR = z.infer<typeof manualSchema>
export type Measurement = z.infer<typeof measurementSchema>
export type Settings = z.infer<typeof settingsSchema>
export type Draft = z.infer<typeof draftSchema>
export type DraftExercise = z.infer<typeof draftExerciseSchema>
export type DraftSet = z.infer<typeof draftSetSchema>

export function uid() { return crypto.randomUUID() }
export function nowIso() { return new Date().toISOString() }

export function localDate(date = new Date()) {
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
export function localTime(date = new Date()) {
  return [date.getHours(), date.getMinutes()].map(value => String(value).padStart(2, '0')).join(':')
}
export function dateFromKey(date: string, time = '12:00') {
  return new Date(date + 'T' + time + ':00')
}
export function offsetDay(date: string, offset: number) {
  const day = dateFromKey(date)
  day.setDate(day.getDate() + offset)
  return localDate(day)
}
export const displayNumber = new Intl.NumberFormat('zh-HK', { maximumFractionDigits: 3 })
export const displayDate = new Intl.DateTimeFormat('zh-HK', { year: 'numeric', month: 'long', day: 'numeric' })

export function parseNumber(value: string) {
  const normalized = value.trim().replace(',', '.')
  return /^(?:\d+\.?\d*|\.\d+)$/.test(normalized) ? Number(normalized) : NaN
}
