import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { EXDB, EXIDX, BODYPARTS, isCardio, isBodyweightEq, allExercises, equipmentOf, smOf, matchExercise, exOr } from './lib/exercises.js'
import { activeProfile, exAvailable, ALL_EQUIPMENT, newProfile } from './lib/equipment.js'
import { fmtDate, fmtNum, capWords, fmtVol, fmtDur, durPart, todayISO, isoOf, uid, exCount, DAYN, DAYS, weekOrder, weekStartOf, weekDayOffset, MONTHS_LONG, ACCENTS } from './lib/format.js'
import { lastEntryFor, bestWeightFor, bestWeightForEntry, buildSets, effectiveRoutineIds, workoutVolume, setsDone, setsDoneActive, setUnitsTotal, lastBW, supersetUnits, unitOf, setLabel, defaultConfig, cleanupSg, modeOf, effortOf, EFFORT, capEffort, stepEffort, isBw, isPerSide, sideReps, workSetsDone, applyIntensifierPlan, MAX_PLANNED_WARMUPS, NOTE_MAX } from './lib/history.js'
import { usesBar, barWeightFor, defaultBarWeight, hasBarOverride } from './lib/bar.js'
import { toScale, rirOf, EFFORT_PRESETS, effortColor } from './lib/effort.js'
import { beep, vibrate } from './lib/sound.js'
import { t, dateLocale, instrFor, exerciseNameFor, getLang, INSTR_LANGS } from './lib/i18n.js'
import { nav } from './lib/nav.js'
import { buildStarterPlan, starterPlanDays, starterPlanOptions } from './lib/starter.js'
import Media, { Thumb } from './components/Media.jsx'
import LineChart from './components/LineChart.jsx'
import Stepper from './components/Stepper.jsx'
import Icon from './components/Icon.jsx'
import { Button, Slider, Switch, Segmented, SelectRow, Row, TextField, NumberField, MultiSelectRow } from './components/ui.jsx'
import { glyphOf, GLYPH_GROUPS, DEFAULT_GLYPH } from './lib/glyphs.js'
import BodyMap from './components/BodyMap.jsx'
import MuscleExplorer from './components/MuscleExplorer.jsx'
import { exerciseMuscleSnapshot, loadOfWorkouts, MUSCLES, MUSCLE_NAME, normalizeMuscleGroups, hasExplicitMuscleMetadata } from './lib/muscles.js'
import { parseImport, mergeImport } from './lib/import-csv.js'
import { importHevyData, HevyApiError, HEVY_DEV_SETTINGS, mergeHevyRoutines } from './lib/import-hevy.js'
import { buildPlanBundle, parsePlan, mergePlan, printPlan } from './lib/plan-share.js'
import { estimate1RM, best1RM, is1RMRecord, REP_CAP } from './lib/onerm.js'
import { exerciseHistory } from './lib/exercise-history.js'
import { nextPrescription, applyPrescription, policyFor, defaultIncrement, POLICIES_FOR, POLICY_NAME, POLICY_DESC, MAX_BW_SETS, weightIncrement } from './lib/progression.js'
import { normalizeRepRange } from './lib/rep-range.js'
import { MOBILE, shareExport } from './lib/mobile.js'
import { buildCompletedWorkout } from './lib/finish-workout.js'
import { isWarmupRow } from './lib/workout-model.js'
import { nextUnfinishedUnit } from './lib/supersetFlow.js'
import { swapActiveExercise } from './lib/active-exercise-swap.js'
import { useSheetKeyboard, useRevealActiveChip, tappable } from './lib/use-sheet-keyboard.js'
import { isFav, toggleFav, sortFavouritesFirst } from './lib/favourites.js'
import { buildSessionEntries } from './lib/session-start.js'
import { buildCombinedEntries, deriveSessionName } from './lib/session-merge.js'
import { workoutsOn, backfillStart, backfillEnd, completeBackfill } from './lib/backfill.js'
import { confirmSheet } from './sheets-mod-a.jsx'
import { customExSheet } from './sheets-mod-a2.jsx'
import { exConfigSheet } from './sheets-mod-a4.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const snd = () => S().sound

/* ============================ exercise picker ============================ */
// Exercises already used in your routines or past workouts (for the "Chosen" filter + a marker).
function usageMap(st) {
  const u = {}
  st.routines.forEach(r => r.ex.forEach(e => { u[e.id] = (u[e.id] || 0) + 1 }))
  st.workouts.forEach(w => w.entries.forEach(e => { u[e.id] = (u[e.id] || 0) + 1 }))
  return u
}
function ExercisePicker({ onPick, close }) {
  const st = useStore(s => s.S)
  const usage = usageMap(st)
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')          // '' = all, '★' = chosen, '☆' = favourites, else a body part
  const [eq, setEq] = useState('')          // '' = any equipment
  const [showAll, setShowAll] = useState(false)
  const [shown, setShown] = useState(50)
  const [byMuscle, setByMuscle] = useState(false)
  const searchRef = useRef(null)
  const bpStrip = useRef(null), eqStrip = useRef(null)
  const onSearchFocus = useSheetKeyboard(searchRef)
  const all = allExercises(st)
  const profile = activeProfile(st)
  const inScope = e => bp === '★' ? usage[e.id] : bp === '☆' ? isFav(st, e.id) : (!bp || e.bp === bp)
  let base = all.filter(e => inScope(e) && matchExercise(e, q))
  if (bp === '★') base = [...base].sort((a, b) => (usage[b.id] - usage[a.id]) || exerciseNameFor(a).localeCompare(exerciseNameFor(b)))
  const eqFiltered = (profile && !showAll) ? base.filter(e => exAvailable(st, e)) : base
  const eqOpts = equipmentOf(eqFiltered)
  // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
  const eqOn = eqOpts.includes(eq) ? eq : ''
  // Favourites float to the top of whatever the filters left (issue #6), the rest keeps its order.
  const f = sortFavouritesFirst(eqOn ? eqFiltered.filter(e => e.eq === eqOn) : eqFiltered, st)
  const chosenCount = Object.keys(usage).length
  const favCount = (st.favEx || []).length
  const special = bp === '★' || bp === '☆'
  useRevealActiveChip(bpStrip, bp)
  useRevealActiveChip(eqStrip, eqOn)
  if (byMuscle) return <>
    <div className="row between" style={{ marginBottom: 10 }}><h3>{t('Add exercise')}</h3>
      <Button size="sm" variant="ghost" onClick={() => setByMuscle(false)}>{t('All')}</Button>
    </div>
    <MuscleExplorer onPick={onPick} />
  </>

  return <>
    <div className="row between" style={{ marginBottom: 10 }}><h3>{t('Add exercise')}</h3>
      <Button size="sm" variant="tinted" icon="target" onClick={() => setByMuscle(true)}>{t('By muscle')}</Button>
    </div>
    {/* .picker-search is what index.css keys the keyboard-aware sheet layout on: the sheet
        lifts above the keys and the search stays put while the list scrolls under it. */}
    <div className="picker-search"><div className="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input ref={searchRef} className="input" placeholder={t('Search {0} exercises…', all.length)} value={q} onFocus={onSearchFocus} onChange={e => { setQ(e.target.value); setShown(50) }} /></div></div>
    {profile && <div className="small dim row" style={{ margin: '8px 0 2px', gap: 6, alignItems: 'center' }}>
      <Icon name="dumbbell" style={{ fontSize: 13 }} />
      {showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)}
      <button className="chip nocap" style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 12 }} onClick={() => setShowAll(v => !v)}>
        {showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')}
      </button>
    </div>}
    <div className="chips" ref={bpStrip} style={{ margin: eqOpts.length > 1 ? '10px 0 6px' : '10px 0' }}>
      {favCount > 0 && <button className={'chip' + (bp === '☆' ? ' on' : '')} onClick={() => { setBp('☆'); setEq(''); setShown(50) }}><Icon name="starFill" className="fav-star" />{t('Favourites')} ({favCount})</button>}
      {chosenCount > 0 && <button className={'chip' + (bp === '★' ? ' on' : '')} onClick={() => { setBp('★'); setEq(''); setShown(50) }}><Icon name="starFill" style={{ fontSize: 12, display: 'inline-block', marginRight: 4, verticalAlign: '-1px' }} />{t('Chosen')} ({chosenCount})</button>}
      <button className={'chip nocap' + (!bp ? ' on' : '')} onClick={() => { setBp(''); setEq(''); setShown(50) }}>{t('All')}</button>
      {BODYPARTS.map(b => <button key={b} className={'chip' + (bp === b ? ' on' : '')} onClick={() => { setBp(b); setEq(''); setShown(50) }}>{t(b)}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="chips" ref={eqStrip} style={{ marginBottom: 10 }}>
      <button className={'chip nocap' + (!eqOn ? ' on' : '')} onClick={() => { setEq(''); setShown(50) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'chip' + (eqOn === x ? ' on' : '')} onClick={() => { setEq(x); setShown(50) }}>{t(x)}</button>)}
    </div>}
    <div className="list">
      {!special && <div className="item" {...tappable(() => customExSheet(null, ex => onPick(ex), q.trim()))}>
        <div className="thumb thumb-x"><Icon name="sparkles" /></div>
        <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('name + body part, no animation')}</div></div><Icon name="plus" className="chev" />
      </div>}
      {f.slice(0, shown).map(e => <div key={e.id} className="item" {...tappable(() => onPick(e))}>
        <Thumb ex={e} /><div className="grow"><div className="tt capitalize">{isFav(st, e.id) && <Icon name="starFill" className="fav-star" />}{exerciseNameFor(e)}</div><div className="ss capitalize">{t(e.tg || e.bp)} · {t(e.eq)}</div></div>
        {/* Accent tag = already in a routine/log ("Chosen"); the yellow star by the name = favourite. */}
        {usage[e.id] && <span className="tag acc"><Icon name="starFill" /></span>}
        {/* A "+" glyph reads as "add this now" — it used to just open the same detail sheet as
            tapping the row, so it added nothing until you'd scrolled past the sets/reps config
            and found the real button. Now it does what it looks like: adds with the default
            config right away. Tapping the row itself still opens the detail/config sheet, for
            when you want to set sets/reps before adding. */}
        <button className="iconbtn chev" aria-label={t('Add “{0}”', exerciseNameFor(e))} style={{ padding: 8, margin: -8 }}
          onClick={ev => { ev.stopPropagation(); onPick(e, true) }}><Icon name="plus" /></button>
      </div>)}
      {f.length === 0 && bp === '★' && <div className="empty">{t('Nothing chosen yet — add exercises and they’ll show up here.')}</div>}
      {f.length === 0 && bp === '☆' && <div className="empty">{t('No favourites here — tap the star on an exercise to add it.')}</div>}
    </div>
    {f.length > shown && <><div style={{ height: 8 }} /><Button onClick={() => setShown(s => s + 50)}>{t('Show more')}</Button></>}
  </>
}
export const exercisePicker = onPick => ui().openSheet(close => <ExercisePicker onPick={onPick} close={close} />)

/** Start a safe swap for one exact active-workout occurrence. */
export function swapActiveWorkoutExercise(index) {
  const active = S().active
  if (!active?.entries?.[index]) return

  // The "+" on a picker row commits with the default config, exactly as it does in the add
  // flows; tapping the row still opens the config sheet first.
  const picker = exercisePicker((ex, quick) => quick ? swapTo(ex, defaultConfig(ex.id)) : exConfigSheet(ex, null, cfg => swapTo(ex, cfg), null, null))
  function swapTo(ex, cfg) {
    // The picker is a chooser here, not a stack you keep adding from: one swap, then back to
    // the workout. (The add flow deliberately leaves it open.)
    picker.close()
    const full = { ...cfg, id: ex.id }
    const st = S()
    const current = st.active?.entries?.[index]
    if (!current) return
    // A swap is an in-place substitution — routine identity is unchanged, so the replacement
    // keeps the slot's own `rid` and reads its prescription from that routine (not a
    // session-wide one). A slot with no `rid` is freestyle.
    const slotRoutine = current.rid ? st.routines.find(r => r.id === current.rid) : null
    const freestyle = !slotRoutine
    // Same rows the add flow builds: last time's loads and, in a planned session, the
    // prescription — swapping barbell for dumbbell bench must not start you at an empty bar.
    const step = modeOf(full) === 'reps' ? weightIncrement(full, st.unit) : defaultIncrement(ex.id, st.unit)
    const plan = freestyle ? null : nextPrescription(st, full, slotRoutine)
    const built = buildSets(st, full, { step, ...(freestyle ? { preferLast: true } : {}), ...(plan?.kind === 'off' ? { useTarget: true } : {}) })
    const replacement = {
      id: ex.id,
      target: { ...cfg },
      plan,
      sets: applyIntensifierPlan(freestyle ? built : applyPrescription(built, plan, step), full),
      ...(current.rid ? { rid: current.rid } : {}),
    }

    const apply = options => {
      // A timed callback closes over entry/set indexes. Invalidate it, and the current rest,
      // before the selected occurrence can be replaced or a new entry shifts those indexes.
      ui().stopWork()
      ui().stopRest()
      update(state => { swapActiveExercise(state.active, index, replacement, options) }, true)
    }
    const logged = (current.sets || []).some(set => set.done === true)
    if (!logged) { apply(); return }

    if (current.sg) {
      ui().openSheet(close => <>
        <h3>{t('Swap exercise?')}</h3>
        <div className="muted small" style={{ marginBottom: 12 }}>
          {t('Logged sets stay with the original exercise. Choose where the replacement belongs.')}
        </div>
        <Button variant="primary" onClick={() => { close(); apply({ loggedConfirmed: true, groupDisposition: 'keep' }) }}>
          {t('Keep replacement in this group')}
        </Button>
        <div style={{ height: 8 }} />
        <Button variant="ghost" onClick={() => { close(); apply({ loggedConfirmed: true, groupDisposition: 'detach' }) }}>
          {t('Insert after this group')}
        </Button>
      </>)
      return
    }

    confirmSheet({
      title: t('Swap exercise?'),
      message: t('Logged sets stay with the original exercise. The replacement will be inserted afterward.'),
      confirmText: t('Continue'),
      onConfirm: () => apply({ loggedConfirmed: true })
    })
  }
}

/* ============================ equipment profiles ============================ */
// Create or edit one profile ("Home", "Gym", ...): a name plus a checklist of what you have.
function EquipmentProfileSheet({ profile, close }) {
  const update = useStore(s => s.update)
  const nameRef = useRef(null)
  const [checked, setChecked] = useState(new Set(profile?.equipment || []))
  const toggle = k => setChecked(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const save = () => {
    const name = (nameRef.current.value || '').trim()
    if (!name) { return }
    update(s => {
      s.equipProfiles = s.equipProfiles || []
      const equipment = [...checked]
      if (profile) {
        const p = s.equipProfiles.find(x => x.id === profile.id)
        if (p) { p.name = name; p.equipment = equipment }
      } else {
        const p = newProfile(name); p.equipment = equipment
        s.equipProfiles.push(p)
        if (!s.activeEquipId) s.activeEquipId = p.id
      }
    })
    close()
  }
  return <>
    <h3>{profile ? t('Edit profile') : t('New equipment profile')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t('Name it after where you train — e.g. "Home" or "Gym" — then check what you have there.')}
    </div>
    <TextField ref={nameRef} defaultValue={profile?.name || ''} placeholder={t('Profile name')} maxLength={40} />
    <div style={{ height: 12 }} />
    <div className="chips">
      {ALL_EQUIPMENT.map(k => (
        <button key={k} className={'chip' + (checked.has(k) ? ' on' : '')} onClick={() => toggle(k)}>{t(k)}</button>
      ))}
    </div>
    <div className="dim small" style={{ marginTop: 10 }}>
      {t('Body-weight exercises are always available, in every profile.')}
    </div>
    <div style={{ height: 14 }} /><Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}
export const equipmentProfileSheet = profile => ui().openSheet(close => <EquipmentProfileSheet profile={profile} close={close} />)
