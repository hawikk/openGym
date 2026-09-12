import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { EXIDX, exOr } from './lib/exercises.js'
import { fmtDate, fmtNum, capWords, fmtVol, fmtDur, durPart, todayISO, isoOf, uid, exCount, DAYN, DAYS, weekOrder, weekStartOf, weekDayOffset, MONTHS_LONG } from './lib/format.js'
import { lastEntryFor, bestWeightFor, bestWeightForEntry, effectiveRoutineIds, workoutVolume, setsDone, setsDoneActive, setUnitsTotal, lastBW, supersetUnits, unitOf, setLabel, workSetsDone, NOTE_MAX } from './lib/history.js'
import { t, dateLocale, exerciseNameFor } from './lib/i18n.js'
import { nav } from './lib/nav.js'
import Icon from './components/Icon.jsx'
import { Button, Switch, SelectRow, Row, NumberField } from './components/ui.jsx'
import { glyphOf } from './lib/glyphs.js'
import BodyMap from './components/BodyMap.jsx'
import { loadOfWorkouts, exerciseMuscleSnapshot } from './lib/muscles.js'
import { buildPlanBundle, parsePlan, mergePlan, printPlan } from './lib/plan-share.js'
import { is1RMRecord } from './lib/onerm.js'
import { MOBILE, shareExport } from './lib/mobile.js'
import { buildCompletedWorkout } from './lib/finish-workout.js'
import { isWarmupRow } from './lib/workout-model.js'
import { nextUnfinishedUnit } from './lib/supersetFlow.js'
import { useSheetKeyboard, tappable } from './lib/use-sheet-keyboard.js'
import { buildSessionEntries } from './lib/session-start.js'
import { buildCombinedEntries, deriveSessionName } from './lib/session-merge.js'
import { workoutsOn, backfillStart, backfillEnd, completeBackfill } from './lib/backfill.js'
import { beep } from './lib/sound.js'
import Stepper from './components/Stepper.jsx'
import { Thumb } from './components/Media.jsx'
import { confirmSheet, bwSheet, WeightInput } from './sheets-mod-a.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const snd = () => S().sound

/* ============================ share / print / import a plan ============================ */
export const planToolsSheet = () => ui().openSheet(close => <PlanTools close={close} />)

function PlanTools({ close }) {
  const st = useStore(s => s.S)
  const user = useStore(s => s.user)
  const fileRef = useRef(null)
  const hasRoutines = (st.routines || []).some(r => r.ex && r.ex.length)

  const exportFile = async () => {
    const bundle = buildPlanBundle(st, user?.name ? t('{0}’s plan', user.name) : '')
    const json = JSON.stringify(bundle, null, 2)
    const name = 'opengym-plan-' + todayISO() + '.json'
    if (MOBILE) { try { await shareExport(json, name) } catch (e) { /* dismissed */ } close(); return }
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
    close(); toast(t('Plan file saved — send it to a friend'))
  }
  const pickFile = ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try { const bundle = parsePlan(rd.result); close(); planImportSheet(bundle) }
      catch (e) { toast(t('Import failed: {0}', e.message)) }
    }
    rd.readAsText(f)
  }

  return <>
    <h3>{t('Share your plan')}</h3>
    <div className="muted small" style={{ marginBottom: 16 }}>{t('Send your routines to a friend, or put your week on paper.')}</div>
    <Button variant="primary" icon="upload" onClick={exportFile} disabled={!hasRoutines}>{t('Export plan file')}</Button>
    <div className="dim small" style={{ margin: '7px 2px 0', lineHeight: 1.4 }}>{t('A small file a friend imports into their own openGym — routines only, none of your workouts or weigh-ins.')}</div>
    {!MOBILE && <>
      <div style={{ height: 12 }} />
      <Button variant="tinted" icon="download" onClick={() => { close(); printPlan(st, user?.name || '') }} disabled={!hasRoutines}>{t('Print / Save as PDF')}</Button>
      <div className="dim small" style={{ margin: '7px 2px 0', lineHeight: 1.4 }}>{t('A clean one-page-per-plan printout — no exercise ever splits across a page.')}</div>
    </>}
    {!hasRoutines && <div className="dim small" style={{ margin: '12px 2px 0' }}>{t('Add an exercise to a routine first — an empty plan has nothing to share.')}</div>}
    <h4 className="sec">{t('Got a plan from a friend?')}</h4>
    <Button variant="ghost" icon="folder" onClick={() => fileRef.current?.click()}>{t('Import a plan file')}</Button>
    <input ref={fileRef} type="file" accept="application/json,.json" onChange={pickFile} hidden />
  </>
}

export const planImportSheet = bundle => ui().openSheet(close => <PlanImport bundle={bundle} close={close} />)

function PlanImport({ bundle, close }) {
  const [schedule, setSchedule] = useState(false)
  const apply = () => {
    update(s => mergePlan(s, bundle, { schedule }))
    close()
    toast(t('Added {0} routines to your plan', bundle.routineCount))
    nav('/plan')
  }
  return <>
    <h3>{bundle.name ? t('Import “{0}”', bundle.name) : t('Import this plan')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t(bundle.routineCount === 1 ? '{0} routine' : '{0} routines', bundle.routineCount)}
      {' · ' + exCount(bundle.exerciseCount)}
      {bundle.scheduledDays > 0
        ? ' · ' + t(bundle.scheduledDays === 1 ? 'scheduled on {0} day' : 'scheduled on {0} days', bundle.scheduledDays)
        : ''}
    </div>
    <div className="dim small" style={{ marginBottom: 14, lineHeight: 1.4 }}>{t('These are added as new routines — nothing you already have is changed.')}</div>
    {bundle.dropped > 0 && <div className="small" style={{ color: 'var(--yellow)', marginBottom: 14, lineHeight: 1.4 }}>
      {t(bundle.dropped === 1
        ? '{0} exercise in the file isn’t in your library and was left out.'
        : '{0} exercises in the file aren’t in your library and were left out.', bundle.dropped)}
    </div>}
    {bundle.scheduledDays > 0 && <div className="row between" style={{ padding: '10px 2px', borderTop: '1px solid var(--sep)', borderBottom: '1px solid var(--sep)', marginBottom: 16, gap: 12 }}>
      <div><div className="tt" style={{ fontSize: 15 }}>{t('Use this weekly schedule')}</div><div className="small dim">{t('Replaces your current Mon–Sun assignments.')}</div></div>
      <Switch checked={schedule} onChange={setSchedule} />
    </div>}
    <Button variant="primary" onClick={apply}>{t('Add to my plan')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

/* ============================ day override / assign ============================ */
function DayOverride({ iso, close }) {
  const st = useStore(s => s.S)
  const wd = new Date(iso + 'T12:00:00').getDay()
  const weeklyNames = [].concat(st.week[wd] || []).map(id => st.routines.find(r => r.id === id)?.name).filter(Boolean)
  const hasOvr = st.dayPlan[iso] !== undefined
  // A weekday can hold several routines; the per-date override stays single-pick, so picking
  // one here collapses a combined day to it (docs/COMBINE_ROUTINES.md §8). The check marks
  // show everything currently planned for the day.
  const effIds = effectiveRoutineIds(st, iso)
  const set = v => {
    update(s => { if (!v) delete s.dayPlan[iso]; else s.dayPlan[iso] = v })
    close()
    toast(v === '' ? t('Back to weekly plan') : v === 'rest' ? t('{0} set to rest', fmtDate(iso)) : t('{0} planned for {1}', (st.routines.find(r => r.id === v) || {}).name, fmtDate(iso)))
  }
  return <>
    <h3>{fmtDate(iso, true)}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Weekly plan:')} {weeklyNames.length ? deriveSessionName(weeklyNames) : t('Rest')}{hasOvr && <span style={{ color: 'var(--orange)' }}> · {t('changed for this day')}</span>}<br />{t('Sick, missed a day or want a different session? Pick what to train instead.')}</div>
    <div className="list">
      {st.routines.map(r => <div key={r.id} className="item" {...tappable(() => set(r.id))}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {effIds.includes(r.id) && <Icon name="check" className="accent" />}</div>)}
      <div className="item" {...tappable(() => set('rest'))}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="moon" /></span><div className="grow"><div className="tt">{t('Rest / skip this day')}</div></div>{effIds.length === 0 && <Icon name="check" className="accent" />}</div>
      {hasOvr && <div className="item" {...tappable(() => set(''))}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="reset" /></span><div className="grow"><div className="tt">{t('Back to weekly plan')}</div></div></div>}
    </div>
  </>
}
export const dayOverrideSheet = iso => ui().openSheet(close => <DayOverride iso={iso} close={close} />)

function DayAssign({ day, close }) {
  const st = useStore(s => s.S)
  // A weekday holds a routine-id list; this single-pick sheet sets an empty day to exactly one
  // routine (or rest). The inline ＋ Add routine on the Plan screen is what appends to a
  // populated day.
  const cur = [].concat(st.week[day] || [])
  const set = v => { update(s => { if (v) s.week[day] = [v]; else delete s.week[day] }); close() }
  return <>
    <h3>{t(DAYN[day])}</h3>
    <div className="list">
      <div className="item" {...tappable(() => set(''))}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="moon" /></span><div className="grow"><div className="tt">{t('Rest day')}</div></div>{!cur.length && <Icon name="check" className="accent" />}</div>
      {st.routines.map(r => <div key={r.id} className="item" {...tappable(() => set(r.id))}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {cur.includes(r.id) && <Icon name="check" className="accent" />}</div>)}
    </div>
  </>
}
export const dayAssignSheet = day => ui().openSheet(close => <DayAssign day={day} close={close} />)

// ＋ Add routine on a populated weekday: single-pick, appends to the day's list. A routine
// already on that day is disabled; picking one closes the sheet.
function DayAddRoutine({ day, close }) {
  const st = useStore(s => s.S)
  const on = new Set([].concat(st.week[day] || []))
  const add = id => { update(s => { s.week[day] = [...[].concat(s.week[day] || []), id] }); close() }
  return <>
    <h3>{t('Add routine')}</h3>
    <div className="list">
      {st.routines.map(r => {
        const already = on.has(r.id)
        return <div key={r.id} className={'item' + (already ? ' disabled' : '')} aria-disabled={already || undefined}
          {...tappable(already ? null : () => add(r.id))}>
          <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
          <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
          {already ? <span className="tag">{t('already added')}</span> : <Icon name="chevronRight" className="chev" />}
        </div>
      })}
    </div>
  </>
}
export const dayAddRoutineSheet = day => ui().openSheet(close => <DayAddRoutine day={day} close={close} />)

/* ============================ workout detail ============================ */
function WorkoutDetail({ w, close }) {
  const noteRef = useRef(null)
  const onNoteFocus = useSheetKeyboard(noteRef)
  const st = useStore(s => s.S)
  const update = useStore(s => s.update)
  // The session note is editable here rather than only at the finish sheet: what you want to
  // record about a session is often clearer once you have looked at what you actually did.
  const [note, setNote] = useState(w.note || '')
  const saveNote = () => update(s => {
    const rec = s.workouts.find(x => x.id === w.id)
    if (!rec) return
    const text = note.trim().slice(0, NOTE_MAX)
    if (text) rec.note = text; else delete rec.note
  })
  // onBlur alone loses the note: Escape, the Android back gesture and swipe-to-dismiss all
  // close the sheet without ever moving focus out of the textarea. Flush on unmount too. The
  // ref is what makes that work — a cleanup closes over the note from its own render, which
  // is the empty string this started with.
  const latest = useRef(note)
  latest.current = note
  const initial = useRef(w.note || '')
  useEffect(() => () => {
    const text = latest.current.trim().slice(0, NOTE_MAX)
    if (text === initial.current) return
    update(s => {
      const rec = s.workouts.find(x => x.id === w.id)
      if (!rec) return                       // deleted from this very sheet
      if (text) rec.note = text; else delete rec.note
    })
  }, [])
  // A combined session's entries carry a `rid`; group them into per-routine sections in merge
  // order. A legacy single-routine workout (one routineIds, or no rid anywhere) renders flat.
  const entryRow = (e, i) => {
    const ex = EXIDX[e.id]
    return <div key={i} className="row" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
      {ex && <Thumb ex={ex} />}
      <div className="grow"><div className="tt capitalize" style={{ fontWeight: 600 }}>{ex ? exerciseNameFor(ex) : (e.n || e.id)} {w.prs && w.prs.includes(e.id) && <span className="pr"><Icon name="trophy" />PR</span>}</div>
        <div className="ss">{e.sets.filter(s => s.done).map(s => setLabel(e.id, s, e.target)).join('  ·  ') || t('no sets')}</div>
        {e.note && <div className="small dim" style={{ marginTop: 3 }}>
          {e.notePin && <Icon name="flag" style={{ fontSize: 12, marginRight: 4, verticalAlign: '-1px', color: 'var(--yellow)' }} />}{e.note}
        </div>}</div>
    </div>
  }
  const groups = []
  w.entries.forEach((e, i) => {
    const key = e.rid || '__none'
    let g = groups.find(x => x.key === key)
    if (!g) { g = { key, rid: e.rid || null, items: [] }; groups.push(g) }
    g.items.push([e, i])
  })
  const grouped = groups.length > 1 || (groups[0] && groups[0].rid && (w.routineIds || []).length > 1)
  return <>
    <h3>{w.name}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{[fmtDate(w.d, true), ...durPart(w.end - w.start), fmtVol(w.vol, st.unit), ...(w.bw ? [fmtNum(w.bw) + ' ' + st.unit] : [])].join(' · ')}</div>
    {grouped ? groups.map(g => {
      const r = g.rid ? st.routines.find(x => x.id === g.rid) : null
      const setN = g.items.reduce((n, [e]) => n + e.sets.filter(s => s.done && !isWarmupRow(s)).length, 0)
      const vol = workoutVolume({ entries: g.items.map(([e]) => e) })
      return <div key={g.key}>
        <div className="row between" style={{ margin: '2px 0 8px', paddingBottom: 6, borderBottom: '1px solid var(--sep)' }}>
          <div className="row" style={{ gap: 7, fontWeight: 600 }}>
            {r && <Icon name={glyphOf(r.emoji)} />}{r ? r.name : t('Freestyle')}
          </div>
          <div className="small dim">{t('{0} sets', setN)} · {fmtVol(vol, st.unit)}</div>
        </div>
        {g.items.map(([e, i]) => entryRow(e, i))}
      </div>
    }) : w.entries.map((e, i) => entryRow(e, i))}
    <div className="small muted" style={{ margin: '4px 0 6px' }}>{t('Session note')}</div>
    <textarea ref={noteRef} className="input" rows={2} maxLength={NOTE_MAX} value={note}
      placeholder={t('How the session went as a whole.')}
      onFocus={onNoteFocus} onChange={e => setNote(e.target.value)} onBlur={saveNote} />
    <div style={{ height: 14 }} />
    <Button variant="danger" onClick={() => confirmSheet({ title: t('Delete workout?'), message: t('This removes it from your history for good.'), confirmText: t('Delete'), danger: true, onConfirm: () => { update(s => { s.workouts = s.workouts.filter(x => x.id !== w.id) }); close(); toast(t('Workout deleted')) } })}>{t('Delete workout')}</Button>
  </>
}
export const workoutDetailSheet = w => ui().openSheet(close => <WorkoutDetail w={w} close={close} />)

/* ============================ calendar ============================ */
function Calendar({ start, close }) {
  const st = useStore(s => s.S)
  const [cur, setCur] = useState(() => { const d = start ? new Date(start) : new Date(); d.setDate(1); return d })
  const y = cur.getFullYear(), mo = cur.getMonth()
  const byDay = {}
  st.workouts.forEach(w => (byDay[w.d] = byDay[w.d] || []).push(w))
  // Which column the 1st sits in, and therefore how many blanks come before it.
  const ws = weekStartOf(st)
  const startOffset = weekDayOffset(new Date(y, mo, 1).getDay(), ws)
  const daysIn = new Date(y, mo + 1, 0).getDate()
  const monthWs = st.workouts.filter(w => w.d.startsWith(y + '-' + String(mo + 1).padStart(2, '0')))
  const monthVol = monthWs.reduce((a, w) => a + (w.vol || 0), 0)
  const monthMs = monthWs.reduce((a, w) => a + Math.max(0, (w.end || w.start) - w.start), 0)
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(<div key={'e' + i} />)
  for (let d = 1; d <= daysIn; d++) {
    const iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const ws = byDay[iso], planned = effectiveRoutineIds(st, iso).length > 0, ovr = st.dayPlan[iso] !== undefined
    const dotCls = ws ? 'done' : ovr && planned ? 'ovr' : planned ? 'plan' : ''
    cells.push(<button key={d} className={'cal-d' + (ws ? ' has' : '') + (iso === todayISO() ? ' today' : '')} onClick={() => {
      if (!ws) { close(); dayOverrideSheet(iso); return }
      if (ws.length === 1) { close(); workoutDetailSheet(ws[0]); return }
      close(); ui().openSheet(c2 => <><h3>{fmtDate(iso, true)}</h3><div className="list">{ws.map(w => <WorkoutRow key={w.id} w={w} onClick={() => { c2(); workoutDetailSheet(w) }} />)}</div></>)
    }}><span>{d}</span><i className={dotCls} /></button>)
  }
  return <>
    <div className="row between" style={{ marginBottom: 2 }}>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo - 1, 1))} aria-label="Previous month"><Icon name="chevronLeft" /></button>
      <h3 style={{ margin: 0 }}>{t(MONTHS_LONG[mo])} {y}</h3>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo + 1, 1))} aria-label="Next month"><Icon name="chevronRight" /></button>
    </div>
    <div className="small muted" style={{ textAlign: 'center' }}>{monthWs.length ? `${t(monthWs.length === 1 ? '{0} workout' : '{0} workouts', monthWs.length)} · ${fmtDur(monthMs)} · ${fmtVol(monthVol, st.unit)}` : t('No workouts this month')}</div>
    <div className="cal-grid">{weekOrder(ws).map(d => <div key={d} className="cal-h">{t(DAYS[d])}</div>)}{cells}</div>
    <div className="cal-legend">
      <span><i style={{ background: 'var(--acc)' }} />{t('Trained')}</span>
      <span><i style={{ background: 'var(--label-3)' }} />{t('Planned')}</span>
      <span><i style={{ background: 'var(--orange)' }} />{t('Rescheduled')}</span>
    </div>
    <div className="small dim" style={{ textAlign: 'center', marginTop: 10 }}>{t('Tap a trained day for details · tap any other day to plan a session')}</div>
  </>
}
export const calendarSheet = start => ui().openSheet(close => <Calendar start={start} close={close} />)

/* shared small workout row (used in lists) */
export function WorkoutRow({ w, onClick }) {
  const st = useStore(s => s.S)
  const glyph = glyphOf((st.routines.find(r => r.id === w.routineId) || {}).emoji)
  return <div className="item" {...tappable(onClick)}>
    <span className="lrow-i" style={{ width: 34, height: 34, borderRadius: 8, fontSize: 19 }}><Icon name={glyph} /></span>
    <div className="grow"><div className="tt">{w.name}</div>
      <div className="ss">{[fmtDate(w.d, true), ...durPart(w.end - w.start), t('{0} sets', setsDone(w)), fmtVol(w.vol, st.unit)].join(' · ')}</div></div>
    {w.prs && w.prs.length > 0 && <span className="pr"><Icon name="trophy" />{w.prs.length} PR</span>}
    <Icon name="chevronRight" className="chev" />
  </div>
}

/* ============================ workout lifecycle ============================ */
// `routineIds` accepts `string | string[] | null` — `[r.id]` for one routine,
// `effectiveRoutineIds(...)` for today's planned session, `[]` / null for explicit freestyle.
export function startFlow(routineIds) {
  bwSheet({ required: true, onDone: bw => beginWorkout(routineIds, bw) })
}
export function beginWorkout(routineIds, bw) {
  const st = S()
  const { entries, routineIds: rids, routines } = buildCombinedEntries(st, routineIds)
  update(s => {
    s.active = {
      id: uid(), d: todayISO(), start: Date.now(),
      // A session tracks its routines as a list; per-entry `rid` carries which one each
      // exercise came from. No top-level `excludeFromProgression` — per-entry `noProg` does it.
      routineIds: rids,
      name: routines.length ? deriveSessionName(routines.map(r => r.name)) : t('Freestyle'),
      bw: bw || null, cur: 0, entries,
      // Snapshot the layout at start so the header ⋮ can change it for this session only —
      // changing the saved default (Settings → Workout view) mid-session leaves it alone.
      workoutView: st.workoutView || 'cards',
    }
  })
  useUI.getState().stopRest()
  nav('/workout')
}

/* ============================ log a past workout ============================ */
// The same screen as a live session, pointed at another day. `backfill` on the active
// session is what tells the workout screen to drop the clock and the rest timers, and tells
// the finish path to file the workout where its date belongs instead of at the end.
function LogPastWorkout({ close }) {
  const st = useStore(s => s.S)
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const [date, setDate] = useState(isoOf(yesterday))
  const [time, setTime] = useState('18:00')
  const [dur, setDur] = useState(60)
  const [routineId, setRoutineId] = useState('')
  const today = todayISO()
  const options = [{ value: '', label: t('Freestyle') }, ...st.routines.map(r => ({ value: r.id, label: r.name }))]

  const go = replaceId => {
    close()
    beginBackfill({ iso: date, time, durationMin: dur, routineId: routineId || null, replaceId })
  }
  const submit = () => {
    if (!date || date > today) { toast(t('Pick a day up to today')); return }
    const existing = workoutsOn(st, date)
    if (!existing.length) { go(null); return }
    ui().openSheet(c => <SameDayChoice iso={date} existing={existing} close={c}
      onReplace={id => { c(); go(id) }} onAdd={() => { c(); go(null) }} />, { kind: 'center' })
  }

  return <>
    <h3>{t('Log a past workout')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Logged on the usual workout screen, without timers.')}</div>
    <Row icon="calendar" title={t('Date')}>
      <input type="date" className="timef" value={date} max={today} onChange={e => setDate(e.target.value)} /></Row>
    <Row icon="clock" title={t('Start time')}>
      <input type="time" className="timef" value={time} onChange={e => setTime(e.target.value)} /></Row>
    <Stepper label={t('Duration')} unit="min" value={dur} step={5} decimal={false} onChange={v => setDur(Math.max(1, Math.round(v)))} />
    <div style={{ height: 8 }} />
    <SelectRow icon="dumbbell" title={t('Routine')} value={routineId} options={options} onChange={setRoutineId} />
    <div style={{ height: 18 }} />
    <Button variant="primary" onClick={submit}>{t('Continue')}</Button>
  </>
}
// Three ways out when the day already has a workout. Replacing with several on that day means
// picking which one; the rest of the day is left alone.
function SameDayChoice({ iso, existing, onReplace, onAdd, close }) {
  return <div style={{ textAlign: 'center', padding: '4px 0' }}>
    <h3 style={{ marginBottom: 8 }}>{fmtDate(iso, true)}</h3>
    <div className="muted" style={{ marginBottom: 18, lineHeight: 1.5 }}>{t('There is already a workout on that day.')}</div>
    {existing.map(w => <div key={w.id} style={{ marginBottom: 8 }}>
      <button className="btn danger" onClick={() => onReplace(w.id)}>{existing.length > 1 ? t('Replace') + ' · ' + w.name : t('Replace')}</button>
    </div>)}
    <button className="btn primary" onClick={onAdd}>{t('Add as second workout')}</button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </div>
}
export function logPastWorkoutSheet() {
  if (S().active) { toast(t('Finish the current workout first.')); return }
  ui().openSheet(close => <LogPastWorkout close={close} />)
}
// Backfill stays single-routine (the LogPastWorkout UI is one picker), but it emits the new
// shape: a one-element (or empty) routine list, per-entry rid, no top-level routineId.
function beginBackfill({ iso, time, durationMin, routineId, replaceId }) {
  const st = S()
  const { entries, routineIds: rids, routines } = buildCombinedEntries(st, routineId ? [routineId] : [])
  update(s => {
    s.active = {
      id: uid(), d: iso, start: backfillStart(iso, time),
      routineIds: rids,
      name: routines.length ? deriveSessionName(routines.map(r => r.name)) : t('Freestyle'),
      bw: null, cur: 0, entries,
      backfill: { durationMin, replaceId: replaceId || null },
      // Same layout snapshot as a live session (see beginWorkout).
      workoutView: st.workoutView || 'cards',
    }
  })
  useUI.getState().stopRest()
  nav('/workout')
}

/* ============================ add a routine mid-session ============================ */
// The workout header ⋮ → Add routine. Single-pick: a routine already in the session, or one
// with no exercises, is shown disabled and tagged. Picking one appends its entries (each
// stamped with its `rid`), extends `s.active.routineIds`, and re-derives the session name.
// `s.active.cur` is left where it is — the appended block is reached by scrolling / Next.
function AddRoutineToSession({ close }) {
  const st = useStore(s => s.S)
  const active = st.active
  if (!active) return null
  const inSession = new Set([].concat(active.routineIds || []))
  const add = r => {
    const entries = buildSessionEntries(st, r).map(e => ({ ...e, rid: r.id }))
    update(s => {
      if (!s.active) return
      s.active.entries.push(...entries)
      s.active.routineIds = [...[].concat(s.active.routineIds || []), r.id]
      s.active.name = deriveSessionName(s.active.routineIds.map(id => s.routines.find(x => x.id === id)?.name).filter(Boolean))
    })
    close()
    toast(t('{0} added — {1}', r.name, exCount(r.ex.length)))
  }
  return <>
    <h3>{t('Add routine')}</h3>
    <div className="list">
      {st.routines.map(r => {
        const already = inSession.has(r.id)
        const empty = !(r.ex || []).length
        const disabled = already || empty
        return <div key={r.id} className={'item' + (disabled ? ' disabled' : '')} aria-disabled={disabled || undefined}
          {...tappable(disabled ? null : () => add(r))}>
          <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
          <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
          {already ? <span className="tag">{t('already added')}</span> : empty ? <span className="tag">{t('no exercises')}</span> : <Icon name="chevronRight" className="chev" />}
        </div>
      })}
    </div>
  </>
}
export function addRoutineToSessionSheet() {
  if (!S().active) return
  ui().openSheet(close => <AddRoutineToSession close={close} />)
}

function TopWeight({ entryIdx, close }) {
  const st = useStore(s => s.S)
  const A = st.active
  // The workout can end underneath this sheet: finishing from the last exercise clears
  // `active`, and this re-renders before the sheet is torn down. Everything below is
  // read defensively and the sheet dismisses itself — reading A.entries straight took
  // the whole app down with it. Hooks still run unconditionally, so the bail-out has
  // to sit after every one of them.
  const entry = A ? A.entries[entryIdx] : null
  const ex = entry && EXIDX[entry.id]
  const maxSet = entry ? Math.max(0, ...entry.sets.filter(s => s.done && !isWarmupRow(s)).map(s => s.w || 0)) : 0
  const prevBest = entry ? Math.max((st.exWeights[entry.id] || {}).w || 0, bestWeightFor(st, entry.id)) : 0
  const [v, setV] = useState(entry ? (Math.max(maxSet, prevBest) || entry.target.weight || 0) : 0)
  useEffect(() => { if (!entry) close() }, [!entry])

  const units = supersetUnits(A ? A.entries : [])
  const unit = entry ? unitOf(units, entryIdx) : []
  const unitDone = !!entry && unit.every(i => A.entries[i].sets.every(s => s.done))
  const nextUnit = unitDone ? nextUnfinishedUnit(A.entries, units, entryIdx) : null
  const workoutDone = unitDone && !nextUnit
  if (!entry || !ex) return null

  const commit = advance => {
    const n = Math.round((v || 0) * 10) / 10
    if (!isFinite(n) || n < 0) { toast(t('Enter a valid weight')); return }
    update(s => {
      s.active.entries[entryIdx].topW = n
      const cur = s.exWeights[entry.id]
      s.exWeights[entry.id] = { w: Math.max(n, cur ? cur.w : 0), d: todayISO() }
    })
    close()
    if (advance && unitDone) {
      if (workoutDone) workoutCompleteSheet()               // no unfinished unit → finish/continue prompt
      else update(s => { s.active.cur = nextUnit[0] })
    } else toast(t('Tracked — next time starts at {0}', fmtNum(S().exWeights[entry.id].w) + ' ' + st.unit))
  }
  return <>
    <h3 className="capitalize row" style={{ gap: 8 }}><Icon name="checkCircle" style={{ color: 'var(--acc)' }} />{t('{0} done', exerciseNameFor(ex))}</h3>
    <div className="muted small">{t('Confirm the weight you worked with — your highest becomes the default next time.')}{!unitDone && unit.length > 1 ? ' ' + t('Then finish the superset partner.') : ''}</div>
    <WeightInput value={v} setValue={setV} unit={st.unit} />
    <div style={{ height: 10 }} />
    {prevBest > 0 ? <div className="small dim" style={{ textAlign: 'center', marginBottom: 12 }}>{t('Previous best:')} {fmtNum(prevBest)} {st.unit}{maxSet > prevBest && <span style={{ color: 'var(--yellow)' }}> — {t('new record!')}</span>}</div> : <div style={{ height: 4 }} />}
    {unitDone ? <>
      <Button variant="primary" trailingIcon={workoutDone ? null : 'chevronRight'} onClick={() => commit(true)}>{workoutDone ? t('Save') : t('Save & next exercise')}</Button>
      <div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={() => commit(false)}>{t('Just close')}</Button>
    </> : <Button variant="primary" onClick={() => commit(false)}>{t('Save weight')}</Button>}
  </>
}
export const topWeightSheet = entryIdx => ui().openSheet(close => <TopWeight entryIdx={entryIdx} close={close} />)

/* ============================ exercise notes ============================
   Two notes, one sheet, because from the user's side it is one question — "what do I want to
   remember about this exercise?" — with two different lifetimes:

     · today's note belongs to this session and is stored on the workout entry. It is history:
       what happened, how it felt. The PIN is the user saying "this one is for next time", which
       only they can know at the moment of writing — see pinnedNoteFor.
     · the standing note belongs to the exercise itself and lives in S.exNotes. Seat height, pin
       position, a form cue. True every session, so it is shown every session and never expires.

   A routine's own `note` (a plan's instruction for this exercise) is edited in the config sheet
   and is deliberately not here: it belongs to the plan, not to the day or to the movement. */
function ExerciseNote({ entryIdx, close }) {
  const noteRef = useRef(null)
  const onNoteFocus = useSheetKeyboard(noteRef)
  const st = useStore(s => s.S)
  const update = useStore(s => s.update)
  const A = st.active
  const entry = A ? A.entries[entryIdx] : null
  const ex = entry ? exOr(entry.id) : null
  const [note, setNote] = useState(entry?.note || '')
  const [pin, setPin] = useState(!!entry?.notePin)
  const [standing, setStanding] = useState(entry ? (st.exNotes?.[entry.id] || '') : '')
  useEffect(() => { if (!entry) close() }, [!entry])
  if (!entry) return null

  const save = () => {
    const today = note.trim().slice(0, NOTE_MAX)
    const always = standing.trim().slice(0, NOTE_MAX)
    update(s => {
      const e = s.active?.entries?.[entryIdx]
      if (e) {
        if (today) { e.note = today; if (pin) e.notePin = true; else delete e.notePin }
        else { delete e.note; delete e.notePin }
      }
      s.exNotes = s.exNotes || {}
      if (always) s.exNotes[entry.id] = always
      else delete s.exNotes[entry.id]
    })
    close()
  }

  return <>
    <h3 className="capitalize">{exerciseNameFor(ex)}</h3>
    <div className="small muted" style={{ marginBottom: 6 }}>{t('This session')}</div>
    <textarea ref={noteRef} className="input" rows={3} maxLength={NOTE_MAX} value={note}
      placeholder={t('How it went, what to change — kept with today’s workout.')}
      onFocus={onNoteFocus} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 10 }} />
    <div className="sect-b">
      <Row icon="flag" iconTint="var(--yellow)" title={t('Show this next time')}
        subtitle={t('Brings it up again the next time you train this exercise.')}>
        <Switch checked={pin} onChange={setPin} disabled={!note.trim()} />
      </Row>
    </div>
    <div style={{ height: 18 }} />
    <div className="small muted" style={{ marginBottom: 6 }}>{t('Always for this exercise')}</div>
    <textarea className="input" rows={2} maxLength={NOTE_MAX} value={standing}
      placeholder={t('Seat height, pin position, a form cue — shown every session.')}
      onChange={e => setStanding(e.target.value)} />
    <div style={{ height: 18 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}
export const exerciseNoteSheet = entryIdx => ui().openSheet(close => <ExerciseNote entryIdx={entryIdx} close={close} />)

/* The session note: how the whole workout went, as opposed to how one exercise went. It lives
   on the active session, so buildCompletedWorkout carries it onto the finished workout and it
   shows up again in history — where it stays editable. Written here rather than only after the
   fact because "notes you can write during a workout" is the point; a note you can only add
   once the session is filed is a different, smaller feature. */
function SessionNote({ close }) {
  const noteRef = useRef(null)
  const onNoteFocus = useSheetKeyboard(noteRef)
  const st = useStore(s => s.S)
  const update = useStore(s => s.update)
  const A = st.active
  const [note, setNote] = useState(A?.note || '')
  useEffect(() => { if (!A) close() }, [!A])
  if (!A) return null

  const save = () => {
    const text = note.trim().slice(0, NOTE_MAX)
    update(s => { if (!s.active) return; if (text) s.active.note = text; else delete s.active.note })
    close()
  }

  return <>
    <h3>{t('Session note')}</h3>
    <textarea ref={noteRef} className="input" rows={4} maxLength={NOTE_MAX} value={note}
      placeholder={t('How the session went as a whole.')}
      onFocus={onNoteFocus} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 18 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}
export const sessionNoteSheet = () => ui().openSheet(close => <SessionNote close={close} />)

/* Drop-set drops and rest-pause bursts are edited inline on the set row itself (Workout.jsx) —
   no sheet, no timer. A planned exercise (see the "Intensifier" config below) arrives with them
   already computed via applyIntensifierPlan; an unplanned straight set can still grow one live
   by tapping "+ Drop"/"+ Burst", which appends with the same suggested-next-value math. */

// Shown when the last exercise's last set is checked — finish, or keep going.
function WorkoutComplete({ close }) {
  return <div style={{ textAlign: 'center', padding: '8px 0' }}>
    <div style={{ fontSize: 44, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="checkCircle" /></div>
    <h3 style={{ margin: '8px 0' }}>{t("That's the whole workout!")}</h3>
    <div className="muted small" style={{ marginBottom: 16 }}>{t('Every exercise done — great work. Finish up, or keep going and add another exercise.')}</div>
    <Button variant="primary" icon="flag" onClick={() => { close(); finishWorkout() }}>{t('Finish workout')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={() => { close(); useUI.getState().toast(t('Keep going — tap “+ Add exercise” below')) }}>{t('Continue workout')}</Button>
  </div>
}
export const workoutCompleteSheet = () => ui().openSheet(close => <WorkoutComplete close={close} />, { kind: 'center' })

function FinishSummary({ w, prs, e1prs = [], close }) {
  const st = useStore(s => s.S)
  return <div style={{ textAlign: 'center', padding: '8px 0' }}>
    <div style={{ fontSize: 44, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="trophy" /></div>
    <h3 style={{ margin: '8px 0' }}>{t('Workout complete!')}</h3>
    <div className="tiles" style={{ textAlign: 'left' }}>
      <div className="tile"><div className="l">{t('Duration')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtDur(w.end - w.start)}</div></div>
      <div className="tile"><div className="l">{t('Volume')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fmtVol(w.vol, st.unit)}</div></div>
      <div className="tile"><div className="l">{t('Sets')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{t('{0} sets · {1} work', setsDone(w), workSetsDone(w))}</div></div>
      <div className="tile"><div className="l">{t('PRs')}</div><div className="v" style={{ fontSize: 20 }}>{prs.length || '—'}</div></div>
    </div>
    {(prs.length > 0 || e1prs.length > 0) && <div style={{ textAlign: 'left', marginBottom: 12 }}>
      {prs.map(id => <div key={id} className="small accent row" style={{ gap: 5 }}><Icon name="trophy" style={{ fontSize: 13 }} />{t('New PR:')} <span className="capitalize">{EXIDX[id] ? exerciseNameFor(EXIDX[id]) : id}</span></div>)}
      {e1prs.map(p => <div key={p.id} className="small accent row" style={{ gap: 5 }}><Icon name="chartLine" style={{ fontSize: 13 }} />{t('Best estimated 1RM:')} <span className="capitalize">{EXIDX[p.id] ? exerciseNameFor(EXIDX[p.id]) : p.id}</span> · {fmtNum(p.est)} {st.unit}</div>)}
    </div>}
    <h4 className="sec" style={{ textAlign: 'left' }}>{t('What you just trained')}</h4>
    <BodyMap load={loadOfWorkouts([w])} body={st.body} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => { close(); nav('/home') }}>{t('Nice!')}</Button>
  </div>
}
export function finishWorkout() {
  const A = S().active
  if (!A) return
  const done = setsDoneActive(A)
  const total = setUnitsTotal(A.entries)
  if (!done) { confirmSheet({ title: t('Nothing logged yet'), message: t('You haven’t checked off any sets. Finish the workout anyway?'), confirmText: t('Finish anyway'), onConfirm: doFinishWorkout }); return }
  if (done < total) { confirmSheet({ title: t('Finish early?'), message: t(total - done === 1 ? '{0} set still unchecked. Finish the workout now?' : '{0} sets still unchecked. Finish the workout now?', total - done), confirmText: t('Finish workout'), onConfirm: doFinishWorkout }); return }
  doFinishWorkout()
}
function doFinishWorkout() {
  const st = S()
  const A = st.active
  if (!A) return
  const past = !!A.backfill
  const prs = []
  const e1prs = []
  // A workout logged into the past cannot claim records against the history that came after
  // it, so a backfilled session reports none and leaves the confirmed weights alone.
  if (!past) A.entries.forEach(e => {
    const mx = Math.max(0, ...e.sets.filter(s => s.done && !isWarmupRow(s)).map(s => s.w))
    if (mx > 0 && mx > bestWeightFor(st, e.id)) prs.push(e.id)
    // A heavier estimate without a heavier top set is its own kind of progress —
    // same weight for more reps. Reported separately so it can't be read as a load PR.
    const rec = is1RMRecord(st, e.id, e)
    if (rec && !prs.includes(e.id)) e1prs.push({ id: e.id, ...rec })
  })
  const w = buildCompletedWorkout(A, {
    end: past ? backfillEnd(A) : Date.now(),
    prs,
    snapshotFor: e => EXIDX[e.id]?.custom ? exerciseMuscleSnapshot(EXIDX[e.id]) : null,
  })
  w.vol = workoutVolume(w)
  update(s => {
    if (past) {
      s.workouts = completeBackfill(s.workouts, A, w)
    } else {
      w.entries.forEach(e => {
        const mx = bestWeightForEntry(e)
        if (mx > 0) { const cur = s.exWeights[e.id]; if (!cur || mx > cur.w) s.exWeights[e.id] = { w: mx, d: w.d } }
      })
      s.workouts.push(w)
    }
    s.active = null
  })
  useStore.getState().autoBackupNow()
  useUI.getState().stopRest()
  beep(snd(), 880, 0.15); beep(snd(), 1100, 0.15, 0.18); beep(snd(), 1320, 0.3, 0.36)
  ui().openSheet(close => <FinishSummary w={w} prs={prs} e1prs={e1prs} close={close} />, { kind: 'center', locked: true })
}
