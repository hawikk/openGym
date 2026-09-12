import { describe, expect, it } from 'vitest'
import { EXIDX } from './exercises.js'
import { parsePlan } from './plan-share.js'
import { DAVID_ROUTINES, DAVID_SCHEDULE, davidPlanBundle } from './david-plan.js'
import { buildStarterPlan } from './starter.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const FRONT_RAISE = /front raise/i

describe('David PPL+PP (Sheet calendar)', () => {
  it('is five named routines in trainer order', () => {
    expect(DAVID_ROUTINES.map(r => r.name)).toEqual(['Push A', 'Pull A', 'Legs', 'Push B', 'Pull B'])
  })

  it('schedules the Sheet week: Mon–Wed, Fri, Sat — Thu and Sun off', () => {
    expect(DAVID_SCHEDULE).toEqual([
      [1, 'push-a'],
      [2, 'pull-a'],
      [3, 'legs'],
      [5, 'push-b'],
      [6, 'pull-b'],
    ])
    const days = DAVID_SCHEDULE.map(([d]) => d)
    expect(days).not.toContain(4)
    expect(days).not.toContain(0)
  })

  it('starts Pull B with dominadas/chin-ups, not a row', () => {
    expect(DAVID_ROUTINES.find(r => r.key === 'pull-b').ex[0].id).toBe('1326')
  })

  it('does not put a front raise on Push B', () => {
    const pushB = DAVID_ROUTINES.find(r => r.key === 'push-b')
    for (const e of pushB.ex) {
      expect(EXIDX[e.id].n, e.id).not.toMatch(FRONT_RAISE)
    }
  })

  it('rests compounds 3 min', () => {
    expect(DAVID_ROUTINES.find(r => r.key === 'push-a').ex[0].restSec).toBe(180)
    expect(DAVID_ROUTINES.find(r => r.key === 'pull-a').ex[0].restSec).toBe(180)
  })

  it('resolves every exercise id in the catalogue', () => {
    for (const r of DAVID_ROUTINES) {
      for (const e of r.ex) expect(EXIDX[e.id], e.id).toBeTruthy()
    }
  })

  it('builds a starter whose weekdays match the Sheet', () => {
    const { routines, schedule } = buildStarterPlan('ppl-pp')
    const nameOf = Object.fromEntries(routines.map(r => [r.id, r.name]))
    expect(schedule.map(({ day, routineId }) => [day, nameOf[routineId]])).toEqual([
      [1, 'Push A'],
      [2, 'Pull A'],
      [3, 'Legs'],
      [5, 'Push B'],
      [6, 'Pull B'],
    ])
  })

  it('round-trips through the openGym plan file', () => {
    const bundle = parsePlan(davidPlanBundle())
    expect(bundle.dropped).toBe(0)
    expect(bundle.routines.map(r => r.name)).toEqual(['Push A', 'Pull A', 'Legs', 'Push B', 'Pull B'])
    expect(Object.keys(bundle.week).sort()).toEqual(['1', '2', '3', '5', '6'])
  })

  it('keeps the committed plan JSON aligned with the module', () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const raw = readFileSync(join(dir, '../../../plans/david-vaquerizo.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual(davidPlanBundle())
  })
})
