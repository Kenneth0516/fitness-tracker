import type { Exercise } from './model'
import { supportsPR } from './model'

type Seed = [string, string, Exercise['muscle'], Exercise['equipment'], Exercise['weightType']]

const seed: Seed[] = [
  ['barbell-bench-press', 'Barbell Bench Press', 'chest', 'barbell', 'total'],
  ['dumbbell-bench-press', 'Dumbbell Bench Press', 'chest', 'dumbbell', 'perDumbbell'],
  ['incline-dumbbell-bench-press', 'Incline Dumbbell Bench Press', 'chest', 'dumbbell', 'perDumbbell'],
  ['machine-chest-press', 'Machine Chest Press', 'chest', 'machine', 'machine'],
  ['push-up', 'Push-up', 'chest', 'bodyweight', 'bodyweight'],
  ['pull-up', 'Pull-up', 'back', 'bodyweight', 'bodyweight'],
  ['assisted-pull-up', 'Assisted Pull-up', 'back', 'machine', 'assistance'],
  ['lat-pulldown', 'Lat Pulldown', 'back', 'cable', 'machine'],
  ['seated-cable-row', 'Seated Cable Row', 'back', 'cable', 'machine'],
  ['dumbbell-row', 'Dumbbell Row', 'back', 'dumbbell', 'perDumbbell'],
  ['barbell-row', 'Barbell Row', 'back', 'barbell', 'total'],
  ['dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'shoulders', 'dumbbell', 'perDumbbell'],
  ['barbell-overhead-press', 'Barbell Overhead Press', 'shoulders', 'barbell', 'total'],
  ['dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'shoulders', 'dumbbell', 'perDumbbell'],
  ['cable-face-pull', 'Cable Face Pull', 'shoulders', 'cable', 'machine'],
  ['barbell-squat', 'Barbell Squat', 'legs', 'barbell', 'total'],
  ['deadlift', 'Deadlift', 'legs', 'barbell', 'total'],
  ['romanian-deadlift', 'Romanian Deadlift', 'legs', 'barbell', 'total'],
  ['leg-press', 'Leg Press', 'legs', 'machine', 'machine'],
  ['leg-extension', 'Leg Extension', 'legs', 'machine', 'machine'],
  ['leg-curl', 'Leg Curl', 'legs', 'machine', 'machine'],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'legs', 'dumbbell', 'perDumbbell'],
  ['calf-raise', 'Calf Raise', 'legs', 'machine', 'machine'],
  ['dumbbell-biceps-curl', 'Dumbbell Biceps Curl', 'arms', 'dumbbell', 'perDumbbell'],
  ['hammer-curl', 'Hammer Curl', 'arms', 'dumbbell', 'perDumbbell'],
  ['rope-triceps-pushdown', 'Rope Triceps Pushdown', 'arms', 'cable', 'machine'],
  ['cable-overhead-triceps-extension', 'Cable Overhead Triceps Extension', 'arms', 'cable', 'machine'],
  ['crunch', 'Crunch', 'core', 'bodyweight', 'bodyweight'],
  ['hanging-knee-raise', 'Hanging Knee Raise', 'core', 'bodyweight', 'bodyweight'],
  ['reverse-crunch', 'Reverse Crunch', 'core', 'bodyweight', 'bodyweight'],
  ['cable-crunch', 'Cable Crunch', 'core', 'cable', 'machine'],
]
export const builtInIds = new Set(seed.map(([id]) => id))

export function builtInExercises(stamp: string): Exercise[] {
  return seed.map(([id, name, muscle, equipment, weightType]) => ({
    id, name, muscle, equipment, weightType, prEligible: supportsPR(weightType), builtIn: true,
    archived: false, notes: '', createdAt: stamp, updatedAt: stamp,
  }))
}
