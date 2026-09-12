// David Vaquerizo — PPL + PP hypertrophy, from the training spreadsheet.
// Source: docs/trainer-plan.md (Sheet calendar). Do not add a second split.
//
// Week (JS getDay(): Sun=0 … Sat=6):
//   Mon Push A, Tue Pull A, Wed Legs, Thu OFF, Fri Push B, Sat Pull B, Sun OFF.
// Coach-chat default was Mon–Fri (Thu Push B, Fri Pull B). Seed the Sheet, not that.

const COMPOUND_REST = 180
const ISOLATION_REST = 90

function lift(id, sets, repsMin, reps, extra = {}) {
  const row = { id, sets, repsMin, reps }
  if (extra.weight != null && extra.weight !== 0) row.weight = extra.weight
  if (extra.restSec > 0) row.restSec = extra.restSec
  if (extra.side) row.side = true
  if (extra.note) row.note = extra.note
  if (extra.warmupSets > 0) row.warmupSets = extra.warmupSets
  if (extra.bodyweight != null) row.bodyweight = extra.bodyweight
  return row
}

const C = extra => ({ restSec: COMPOUND_REST, ...extra })
const I = extra => ({ restSec: ISOLATION_REST, ...extra })

export const DAVID_ROUTINES = [
  {
    key: 'push-a',
    name: 'Push A',
    emoji: 'barbell',
    prog: 'double',
    ex: [
      lift('0047', 4, 6, 10, C({ weight: 70, warmupSets: 3, note: 'PRIORITY inclinada barra' })),
      lift('0289', 3, 8, 12, C({ weight: 30, note: '~30/hand' })),
      lift('0405', 3, 8, 12, C({ weight: 22, note: '~22/hand' })),
      lift('0334', 3, 12, 15, I({ weight: 8, note: '~8/hand' })),
      lift('0201', 3, 10, 15, I({ weight: 25 })),
      lift('0430', 2, 10, 15, I({ weight: 12, note: '~12/hand DB' })),
      lift('1761', 2, 10, 15, I()),
      lift('0175', 2, 10, 15, I()),
    ],
  },
  {
    key: 'pull-a',
    name: 'Pull A',
    emoji: 'pullup',
    prog: 'double',
    ex: [
      lift('0652', 4, 6, 10, C({ weight: 5, warmupSets: 3, note: 'Dominadas lastradas · PRIORITY · BW+5' })),
      lift('0049', 3, 8, 12, C({ weight: 70, note: 'chest-supported preferred' })),
      lift('0861', 3, 8, 12, C({ weight: 55, note: 'neutral' })),
      lift('0203', 3, 12, 15, I({ weight: 20, note: 'rear delt / face pull' })),
      lift('0447', 3, 8, 12, I({ weight: 30 })),
      lift('0318', 2, 10, 15, I({ weight: 10, note: '~10/hand' })),
      lift('0857', 2, 8, 12, I()),
      lift('0276', 2, 8, 12, I()),
    ],
  },
  {
    key: 'legs',
    name: 'Legs',
    emoji: 'legs',
    prog: 'double',
    ex: [
      lift('0043', 3, 6, 10, C({ weight: 60, warmupSets: 3, note: 'W1 conservative ~60 squat' })),
      lift('0586', 3, 8, 12, I({ weight: 40, note: 'sheet: lying curl, not RDL' })),
      lift('0336', 3, 16, 24, C({ weight: 12, side: true, note: '8–12/leg @ ~12/hand' })),
      lift('0605', 3, 10, 15, I({ weight: 40 })),
      lift('0585', 2, 12, 15, I({ weight: 35, note: 'optional' })),
      lift('0862', 2, 20, 24, I({ weight: 20, side: true, note: '10–12/side woodchop/Pallof' })),
    ],
  },
  {
    key: 'push-b',
    name: 'Push B',
    emoji: 'barbell',
    prog: 'double',
    ex: [
      lift('0314', 4, 6, 10, C({ weight: 28, warmupSets: 3, note: 'PRIORITY ~28/hand · swap vs A' })),
      lift('0596', 3, 10, 15, I({ weight: 15, note: '~15/side' })),
      lift('0334', 4, 12, 15, I({ weight: 8, note: 'extra volume ~8/hand' })),
      lift('0603', 3, 8, 12, C({ weight: 40 })),
      lift('0194', 3, 10, 15, I({ weight: 25 })),
      lift('0200', 2, 12, 15, I({ weight: 20 })),
      lift('0333', 2, 12, 15, I({ weight: 8, note: '~8 kickback' })),
    ],
  },
  {
    key: 'pull-b',
    name: 'Pull B',
    emoji: 'pullup',
    prog: 'double',
    ex: [
      lift('1326', 4, 6, 10, C({ weight: 5, warmupSets: 3, note: 'Dominadas/chin lastradas · PRIORITY · BW+5' })),
      lift('0218', 3, 8, 12, C({ weight: 60 })),
      lift('2330', 3, 8, 12, C({ weight: 50, note: 'if pull-ups fatigued' })),
      lift('0203', 3, 12, 15, I({ weight: 20 })),
      lift('0313', 3, 10, 15, I({ weight: 12, note: '~12/hand' })),
      lift('1627', 3, 10, 15, I({ weight: 20, note: '~20 EZ' })),
    ],
  },
]

// Thu (4) and Sun (0) omitted — rest days, not a second split.
export const DAVID_SCHEDULE = [
  [1, 'push-a'],
  [2, 'pull-a'],
  [3, 'legs'],
  [5, 'push-b'],
  [6, 'pull-b'],
]

export function davidWeek(idOf) {
  const week = {}
  DAVID_SCHEDULE.forEach(([day, key]) => { week[day] = [idOf(key)] })
  return week
}

export function davidPlanBundle() {
  const routines = DAVID_ROUTINES.map(r => ({
    id: r.key,
    name: r.name,
    emoji: r.emoji,
    prog: r.prog,
    ex: r.ex.map(e => ({ ...e })),
  }))
  const idOf = key => key
  return {
    opengym_plan: 1,
    exported: '2026-09-12',
    name: 'PPL + PP hypertrophy',
    week: davidWeek(idOf),
    dayPlan: {},
    routines,
    customEx: [],
  }
}
