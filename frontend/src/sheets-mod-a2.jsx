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
import { confirmSheet, WeightInput } from './sheets-mod-a.jsx'
import { exConfigSheet } from './sheets-mod-a4.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const snd = () => S().sound

/* ============================ import from another app ============================ */
// Shows what a parsed export would actually do before anything is written. An import is
// the one action where "just try it" is expensive — it's someone's entire training
// history — so the numbers, the unit conversion and the exercises we couldn't recognise
// are all on screen before the confirm button.
function ImportSummary({ parsed, close }) {
  const st = useStore(s => s.S)
  const isBW = parsed.kind === 'bodyweight'
  const have = isBW
    ? parsed.bodyweight.filter(b => st.bodyweight.some(x => x.d === b.d)).length
    : parsed.workouts.filter(w => st.workouts.some(x => x.d === w.d)).length
  const fresh = (isBW ? parsed.bodyweight.length : parsed.workouts.length) - have

  const doImport = () => {
    let res
    update(s => { res = mergeImport(s, parsed) })
    close()
    toast(isBW
      ? t('{0} weigh-ins imported', res.added)
      : t('{0} workouts imported', res.added))
  }

  return <>
    <h3>{parsed.source ? t('Import from {0}', parsed.source) : t('Import history')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>
      {parsed.from === parsed.to ? fmtDate(parsed.from, true) : fmtDate(parsed.from, true) + ' – ' + fmtDate(parsed.to, true)}
    </div>

    <div className="tiles" style={{ textAlign: 'left' }}>
      {isBW ? <>
        <div className="tile"><div className="l">{t('Weigh-ins')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.bodyweight.length}</div></div>
        <div className="tile"><div className="l">{t('New')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{fresh}</div></div>
      </> : <>
        <div className="tile"><div className="l">{t('Workouts')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.workouts.length}</div></div>
        <div className="tile"><div className="l">{t('Sets')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.sets}</div></div>
        <div className="tile"><div className="l">{t('Exercises matched')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.matched}</div></div>
        <div className="tile"><div className="l">{t('Added as your own')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{parsed.created}</div></div>
      </>}
    </div>

    {parsed.mixedUnits ? <div className="small" style={{ color: 'var(--yellow)', marginBottom: 10 }}>
      {t('The file mixes kg and lb — each set is converted to {0}.', st.unit)}
    </div> : parsed.converted ? <div className="small" style={{ color: 'var(--yellow)', marginBottom: 10 }}>
      {t('The file is in {0} and your profile is in {1} — weights will be converted.', parsed.fileUnit, st.unit)}
    </div> : null}
    {!isBW && !parsed.fileUnit && !parsed.mixedUnits && <div className="small dim" style={{ marginBottom: 10 }}>
      {t('The file does not say which unit it uses — numbers are imported as they are.')}
    </div>}
    {have > 0 && <div className="small dim" style={{ marginBottom: 10 }}>
      {t('{0} days already have data here and will be left alone.', have)}
    </div>}
    {/* The file rated its sets. Say so: the column is off by default, so the ratings would
        otherwise arrive invisibly and look like they had been dropped. */}
    {!isBW && (parsed.rirSets + parsed.rpeSets) > 0 && <div className="small dim" style={{ marginBottom: 10 }}>
      {t(effortOf(st) === 'none'
        ? '{0} sets bring an {1} with them — switch on Effort per set in Settings to see it.'
        : '{0} sets bring an {1} with them.',
      parsed.rirSets || parsed.rpeSets, parsed.rirSets ? 'RIR' : 'RPE')}
    </div>}
    {!isBW && parsed.unmatchedNames.length > 0 && <>
      <h4 className="sec">{t('Not in the library — added as your own exercises')}</h4>
      <div className="mchips" style={{ marginBottom: 12 }}>
        {parsed.unmatchedNames.slice(0, 12).map(n => <span key={n} className="mchip capitalize">{n}</span>)}
        {parsed.unmatchedNames.length > 12 && <span className="mchip">+{parsed.unmatchedNames.length - 12}</span>}
      </div>
    </>}

    <Button variant="primary" onClick={doImport} disabled={!fresh}>
      {fresh ? t('Import') : t('Nothing new to import')}
    </Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

/** Read a CSV/XML export, then show what it would do. */
export function importFromApp(file, onDone) {
  const rd = new FileReader()
  rd.onload = () => {
    let parsed
    try { parsed = parseImport(String(rd.result), { unit: S().unit }) }
    catch (e) { toast(t('Could not read that file')); return }
    if (parsed.error === 'empty') { toast(t('That file is empty')); return }
    if (parsed.error) { toast(t("That file's columns aren't recognised — see the docs for supported apps.")); return }
    if (parsed.kind === 'bodyweight' ? !parsed.bodyweight.length : !parsed.workouts.length) {
      toast(t('Nothing to import from that file')); return
    }
    ui().openSheet(close => <ImportSummary parsed={parsed} close={close} />)
    onDone && onDone()
  }
  rd.onerror = () => toast(t('Could not read that file'))
  rd.readAsText(file)
}

/* ============================ import from Hevy API ============================ */
// The key lives in React state for this sheet only — dismissed with the sheet, never
// written to the store / localStorage / the server. After a successful fetch the user
// picks workouts and/or weigh-ins before anything is merged.

export function importFromHevy() {
  ui().openSheet(close => <HevyImportSheet close={close} />)
}

function hevyProgressLabel(p) {
  if (!p) return t('Fetching from Hevy…')
  if (p.stage === 'templates') return t('Fetching exercises… ({0}/{1})', p.page, p.pageCount)
  if (p.stage === 'workouts') return t('Fetching workouts… ({0}/{1})', p.page, p.pageCount)
  if (p.stage === 'routines') return t('Fetching routines… ({0}/{1})', p.page, p.pageCount)
  if (p.stage === 'body') return t('Fetching weigh-ins… ({0}/{1})', p.page, p.pageCount)
  if (p.stage === 'parse') return t('Matching exercises…')
  return t('Fetching from Hevy…')
}

function HevyImportSheet({ close }) {
  const st = useStore(s => s.S)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [payload, setPayload] = useState(null) // { workouts, routines, bodyweight }
  const [wantWorkouts, setWantWorkouts] = useState(true)
  const [wantRoutines, setWantRoutines] = useState(true)
  const [wantBody, setWantBody] = useState(true)
  const keyRef = useRef(null)

  // Drop the key from memory when the sheet goes away (unmount or successful import).
  useEffect(() => () => { setApiKey('') }, [])

  const wipeKey = () => { setApiKey(''); if (keyRef.current) keyRef.current.value = '' }

  const fetchAccount = async () => {
    const key = apiKey.trim()
    if (!key) { toast(t('Paste your Hevy API key first')); return }
    setBusy(true)
    setProgress({ stage: 'templates', page: 1, pageCount: 1 })
    setPayload(null)
    try {
      const data = await importHevyData(key, { unit: st.unit, onProgress: setProgress })
      wipeKey()
      const empty = !data.workouts.workouts.length && !data.routines.routines.length && !data.bodyweight.bodyweight.length
      if (empty) {
        toast(t('Nothing to import from Hevy'))
        return
      }
      setWantWorkouts(!!data.workouts.workouts.length)
      setWantRoutines(!!data.routines.routines.length)
      setWantBody(!!data.bodyweight.bodyweight.length)
      setPayload(data)
    } catch (e) {
      if (e instanceof HevyApiError && e.message === 'auth') toast(t('That Hevy API key was refused'))
      else if (e instanceof HevyApiError && e.message === 'rate-limit') toast(t('Hevy is rate-limiting requests — wait a minute and try again'))
      else if (e instanceof HevyApiError && e.message === 'empty') toast(t('Paste your Hevy API key first'))
      else toast(t('Could not reach Hevy — check the key and try again'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const doImport = () => {
    if (!payload) return
    const parts = []
    let addedW = 0, addedR = 0, addedB = 0
    update(s => {
      if (wantWorkouts && payload.workouts.workouts.length) {
        const res = mergeImport(s, payload.workouts)
        addedW = res.added
        parts.push(t('{0} workouts imported', res.added))
      }
      if (wantRoutines && payload.routines.routines.length) {
        const res = mergeHevyRoutines(s, payload.routines)
        addedR = res.added
        parts.push(t('{0} routines imported', res.added))
      }
      if (wantBody && payload.bodyweight.bodyweight.length) {
        const res = mergeImport(s, payload.bodyweight)
        addedB = res.added
        parts.push(t('{0} weigh-ins imported', res.added))
      }
    })
    close()
    if (!addedW && !addedR && !addedB) toast(t('Nothing new to import'))
    else toast(parts.join(' · '))
  }

  if (!payload) {
    return <>
      <h3>{t('Import from Hevy')}</h3>
      <div className="muted small" style={{ marginBottom: 14, lineHeight: 1.5 }}>
        {t('Pull your history with a Hevy Pro API key. The key is only used for this import and is not saved.')}
      </div>
      <label className="small dim" style={{ display: 'block', marginBottom: 6 }}>{t('Hevy API key')}</label>
      <TextField
        ref={keyRef}
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        value={apiKey}
        disabled={busy}
        onChange={e => setApiKey(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !busy) fetchAccount() }}
      />
      <div className="small" style={{ margin: '10px 0 16px', lineHeight: 1.45 }}>
        <a href={HEVY_DEV_SETTINGS} target="_blank" rel="noopener noreferrer">{t('Get your API key')}</a>
        <span className="dim"> — {t('Hevy → Settings → Developer')}</span>
      </div>
      {busy && <div className="small dim" style={{ marginBottom: 12 }}>{hevyProgressLabel(progress)}</div>}
      <Button variant="primary" onClick={fetchAccount} disabled={busy || !apiKey.trim()}>
        {busy ? t('Fetching from Hevy…') : t('Fetch from Hevy')}
      </Button>
      <div style={{ height: 8 }} />
      <Button variant="ghost" className="dim" onClick={close} disabled={busy}>{t('Cancel')}</Button>
    </>
  }

  const w = payload.workouts
  const r = payload.routines
  const b = payload.bodyweight
  const haveW = w.workouts.filter(x => st.workouts.some(y => y.d === x.d)).length
  const freshW = w.workouts.length - haveW
  const haveB = b.bodyweight.filter(x => st.bodyweight.some(y => y.d === x.d)).length
  const freshB = b.bodyweight.length - haveB
  // Routines are always added as new copies (same as plan import).
  const freshR = r.routines.length
  const canImport = (wantWorkouts && freshW > 0) || (wantRoutines && freshR > 0) || (wantBody && freshB > 0)
  const unmatched = [...new Set([
    ...(wantWorkouts ? w.unmatchedNames : []),
    ...(wantRoutines ? r.unmatchedNames : []),
  ])].sort()

  return <>
    <h3>{t('Import from Hevy')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>
      {w.from && (w.from === w.to ? fmtDate(w.from, true) : fmtDate(w.from, true) + ' – ' + fmtDate(w.to, true))}
      {!w.from && b.from && (b.from === b.to ? fmtDate(b.from, true) : fmtDate(b.from, true) + ' – ' + fmtDate(b.to, true))}
    </div>

    <div className="tiles" style={{ textAlign: 'left' }}>
      <div className="tile"><div className="l">{t('Workouts')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{w.workouts.length}</div></div>
      <div className="tile"><div className="l">{t('Routines')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{r.routines.length}</div></div>
      <div className="tile"><div className="l">{t('Exercises matched')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{w.matched + r.matched}</div></div>
      <div className="tile"><div className="l">{t('Added as your own')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{w.created + r.created}</div></div>
    </div>

    {w.workouts.length > 0 && <div className="row between" style={{ padding: '10px 2px', borderTop: '1px solid var(--sep)', gap: 12 }}>
      <div>
        <div className="tt" style={{ fontSize: 15 }}>{t('Import workouts')}</div>
        <div className="small dim">{t('{0} new · {1} days already here', freshW, haveW)}</div>
      </div>
      <Switch checked={wantWorkouts} onChange={setWantWorkouts} />
    </div>}
    {r.routines.length > 0 && <div className="row between" style={{ padding: '10px 2px', borderTop: '1px solid var(--sep)', gap: 12 }}>
      <div>
        <div className="tt" style={{ fontSize: 15 }}>{t('Import routines')}</div>
        <div className="small dim">{t('{0} routines · {1} exercises — added as new plans', freshR, r.exerciseCount)}</div>
      </div>
      <Switch checked={wantRoutines} onChange={setWantRoutines} />
    </div>}
    {b.bodyweight.length > 0 && <div className="row between" style={{ padding: '10px 2px', borderTop: '1px solid var(--sep)', borderBottom: '1px solid var(--sep)', gap: 12, marginBottom: 8 }}>
      <div>
        <div className="tt" style={{ fontSize: 15 }}>{t('Import weigh-ins')}</div>
        <div className="small dim">{t('{0} new · {1} days already here', freshB, haveB)}</div>
      </div>
      <Switch checked={wantBody} onChange={setWantBody} />
    </div>}
    {!b.bodyweight.length && <div style={{ borderBottom: '1px solid var(--sep)', marginBottom: 8 }} />}

    {(w.converted || r.converted) && <div className="small" style={{ color: 'var(--yellow)', marginBottom: 10 }}>
      {t('Hevy stores weights in kg — they will be converted to {0}.', st.unit)}
    </div>}
    {wantWorkouts && (w.rirSets + w.rpeSets) > 0 && <div className="small dim" style={{ marginBottom: 10 }}>
      {t(effortOf(st) === 'none'
        ? '{0} sets bring an {1} with them — switch on Effort per set in Settings to see it.'
        : '{0} sets bring an {1} with them.',
      w.rirSets || w.rpeSets, w.rirSets ? 'RIR' : 'RPE')}
    </div>}
    {unmatched.length > 0 && <>
      <h4 className="sec">{t('Not in the library — added as your own exercises')}</h4>
      <div className="mchips" style={{ marginBottom: 12 }}>
        {unmatched.slice(0, 12).map(n => <span key={n} className="mchip capitalize">{n}</span>)}
        {unmatched.length > 12 && <span className="mchip">+{unmatched.length - 12}</span>}
      </div>
    </>}

    <Button variant="primary" onClick={doImport} disabled={!canImport}>
      {canImport ? t('Import') : t('Nothing new to import')}
    </Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={() => { setPayload(null); wipeKey() }}>{t('Back')}</Button>
  </>
}

/* ============================ target weight ============================ */
export function bwDeltaColor(delta, currentW) {
  if (!delta) return 'var(--label-2)'
  if (!S().targetW) return 'var(--label)'
  const up = S().targetW > currentW
  return (delta > 0) === up ? 'var(--acc)' : 'var(--red)'
}
function GoalSheet({ close }) {
  const st = S()
  const bw = lastBW(st)
  const [v, setV] = useState(st.targetW || (bw ? bw.w : 70))
  return <>
    <h3>{t('Target weight')}</h3>
    <div className="muted small">{t('Your goal is drawn as a line through the weight charts, and gains/losses are colored by whether they move toward it.')}</div>
    <WeightInput value={v} setValue={setV} unit={st.unit} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => {
      const n = Math.round((v || 0) * 10) / 10
      if (!n || n <= 0) { toast(t('Enter a valid weight')); return }
      update(s => { s.targetW = n }); close()
      const b = lastBW(S()); toast(t('Goal set: {0}', fmtNum(n) + ' ' + st.unit) + (b ? ' (' + t('{0} to go', fmtNum(Math.abs(n - b.w))) + ')' : ''))
    }}>{t('Save goal')}</Button>
    {st.targetW && <><div style={{ height: 8 }} /><Button variant="danger" onClick={() => { update(s => { s.targetW = null }); close(); toast(t('Goal removed')) }}>{t('Remove goal')}</Button></>}
  </>
}
export const goalSheet = () => ui().openSheet(close => <GoalSheet close={close} />)

/* ============================ bar weight ============================ */
// One editor for every place the bar weight shows up (exercise detail, exercise config,
// mid-workout sheet): a stepper over the effective value. What it saves is per exercise
// and lives in S.barWeights, in the profile unit (see lib/bar.js) — stepping or typing
// down to 0 clears the override and the field falls back to the default for the bar
// type, the same "0 drops the key" shape a nullable set field has.
function BarWeightEditor({ ex, extra }) {
  const st = useStore(s => s.S)
  const explicit = hasBarOverride(st, ex.id)
  const def = defaultBarWeight(ex.eq, st.unit)
  const setBar = v => update(s => {
    s.barWeights = s.barWeights || {}
    const n = Math.max(0, Math.round((v || 0) * 100) / 100)
    if (n > 0) s.barWeights[ex.id] = n; else delete s.barWeights[ex.id]
  })
  return <>
    <div className="row cfgrow" style={{ marginBottom: 6 }}>
      <Stepper label={t('Bar ({0})', st.unit)} value={barWeightFor(st, ex) || 0} step={2.5} onChange={setBar} />
    </div>
    <div className="small dim" style={{ marginBottom: 18 }}>
      {explicit ? t('Set to 0 to go back to the default ({0}).', fmtNum(def) + ' ' + st.unit) : t('Default for this bar type.')}
      {extra ? ' ' + extra : ''}
    </div>
  </>
}

// Tiny mid-workout sheet behind the "Bar … · … per side" chip — same value, same editor.
function BarWeightSheet({ exId, close }) {
  const ex = exOr(exId)
  return <>
    <h3>{t('Bar weight')}</h3>
    <div className="muted small capitalize" style={{ marginBottom: 12 }}>{exerciseNameFor(ex)}</div>
    <BarWeightEditor ex={ex} extra={t('Applies to this exercise everywhere, not just this plan.')} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}
export const barWeightSheet = exId => ui().openSheet(close => <BarWeightSheet exId={exId} close={close} />)

/* ============================ exercise detail ============================ */
// Estimated 1RM for one exercise (issue #18): what the log already implies, plus a calculator
// for a set you have not done — so the number is reachable before there is any history.
function OneRM({ ex }) {
  const st = useStore(s => s.S)
  const best = best1RM(st, ex.id)
  const [w, setW] = useState(best ? best.w : (st.exWeights[ex.id] || {}).w || 20)
  const [r, setR] = useState(best ? best.r : 5)
  const est = estimate1RM(w, r)
  return <>
    <h4 className="sec">{t('Estimated 1RM')}</h4>
    {best && <div className="small" style={{ marginBottom: 8 }}>
      {t('From your log:')} <b className="accent">{fmtNum(best.est)} {st.unit}</b>
      <span className="dim"> · {t('{0} × {1} on {2}', fmtNum(best.w) + ' ' + st.unit, best.r, fmtDate(best.d, true))}</span>
    </div>}
    <div className="row cfgrow" style={{ marginBottom: 10 }}>
      <Stepper label={t('Weight ({0})', st.unit)} value={w} step={2.5} onChange={setW} />
      <Stepper label={t('Reps')} value={r} step={1} decimal={false} onChange={setR} />
    </div>
    <div className="row between" style={{ marginBottom: 4 }}>
      <span className="muted small">{t('Estimate')}</span>
      <b className="accent" style={{ fontSize: 20 }}>{est === null ? '—' : fmtNum(est) + ' ' + st.unit}</b>
    </div>
    <div className="small dim">{est === null
      ? t('Enter a weight and 1–{0} reps — beyond that an estimate is guesswork.', REP_CAP)
      : t('Epley formula — a calculation from one set, not a tested max.')}</div>
  </>
}

function ExerciseDetail({ ex, close }) {
  const st = useStore(s => s.S)
  const last = lastEntryFor(st, ex.id)
  const best = bestWeightFor(st, ex.id)
  const fav = isFav(st, ex.id)
  const flipFav = () => {
    let on = false
    update(s => { on = toggleFav(s, ex.id) })
    toast(on ? t('Added to favourites') : t('Removed from favourites'))
  }
  return <>
    <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
      <h3 className="capitalize">{exerciseNameFor(ex)}</h3>
      <button className={'iconbtn fav-btn' + (fav ? ' on' : '')} aria-pressed={fav}
        aria-label={fav ? t('Remove from favourites') : t('Add to favourites')} onClick={flipFav}>
        <Icon name={fav ? 'starFill' : 'star'} />
      </button>
    </div>
    <Media ex={ex} />
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
      <span className="tag acc">{t(ex.bp)}</span>
      {(ex.primaries?.length ? ex.primaries : (ex.tg ? [ex.tg] : [])).map((s, i) => <span key={i} className="tag"><Icon name="target" />{t(s)}</span>)}
      <span className="tag"><Icon name="dumbbell" />{t(ex.eq)}</span>
      {(ex.secondaries?.length ? ex.secondaries : smOf(ex)).slice(0, 3).map((s, i) => <span key={i} className="tag">{t(s)}</span>)}
    </div>
    {ex.desc && <div className="exnote">{ex.desc}</div>}
    {best > 0 && <div className="small row" style={{ marginBottom: 6, gap: 5 }}><Icon name="trophy" style={{ fontSize: 14, color: 'var(--yellow)' }} />{t('Best:')} <b className="accent" style={{ whiteSpace: 'nowrap' }}>{fmtNum(best)} {st.unit}</b>{last ? ` · ${t('last')} ${fmtDate(last.d)}: ${last.sets.map(s => setLabel(ex.id, s, last.target)).join(', ')}` : ''}</div>}
    <Button variant="primary" icon="plus" style={{ margin: '10px 0 4px' }} onClick={() => addToRoutineSheet(ex)}>{t('Add to my plan')}</Button>
    {last && <Button icon="history" style={{ marginTop: 4 }} onClick={() => exerciseHistorySheet(ex.id)}>{t('History')}</Button>}
    {ex.custom && <div className="row" style={{ gap: 8, marginTop: 8 }}>
      <Button icon="pencil" style={{ flex: 1 }} onClick={() => { close(); customExSheet(ex) }}>{t('Edit')}</Button>
      <Button variant="danger" icon="trash" style={{ flex: 1 }} onClick={() => deleteCustomEx(ex, close)}>{t('Delete')}</Button>
    </div>}
    {usesBar(ex) && <>
      <h4 className="sec">{t('Bar weight')}</h4>
      <BarWeightEditor ex={ex} extra={t('You still log the total weight — the bar only feeds the per-side plate math.')} />
    </>}
    {!isCardio(ex) && <OneRM ex={ex} />}
    {instrFor(ex).length > 0 &&<><h4 className="sec">{t('How to')}{!INSTR_LANGS.includes(getLang()) && <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}> · {t('instructions in English')}</span>}</h4><ol className="steps-list">{instrFor(ex).map((s, i) => <li key={i}>{s}</li>)}</ol></>}
  </>
}
export const exerciseDetailSheet = ex => ui().openSheet(close => <ExerciseDetail ex={ex} close={close} />)

/* ============================ exercise history ============================ */
// What you did on this exercise before, reachable mid-workout (issue #43): the curve first,
// then the last sessions set by set, so the question "what did I do last month" is answered
// without leaving the workout for Stats. Derived once per log change — the sheet re-renders on
// every store tick while a session runs, and LineChart drops its hover whenever `points`
// changes identity, so a series rebuilt per render would lose the tooltip under your finger.
function ExerciseHistory({ exId }) {
  const st = useStore(s => s.S)
  const ex = exOr(exId)
  const h = useMemo(() => exerciseHistory(st, exId), [st.workouts, exId])
  const [curve, setCurve] = useState('top')
  const onE1 = curve === 'e1rm' && h.e1rmPoints.length > 0
  const unit = h.metric === 'weight' ? st.unit : h.metric === 'reps' ? t('reps') : h.metric === 'sec' ? 's' : t('min')
  const e1Best = useMemo(() => Math.max(0, ...h.e1rmPoints.map(p => p.y)), [h])
  if (!h.total) return <>
    <h3 className="capitalize">{exerciseNameFor(ex)}</h3>
    <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No sessions logged yet')}</div>
  </>
  const tail = s => [
    s.volume > 0 && t('Volume') + ' ' + fmtVol(s.volume, st.unit),
    s.e1rm != null && t('Est. 1RM') + ' ' + fmtNum(s.e1rm) + ' ' + st.unit,
  ].filter(Boolean).join(' · ')
  return <>
    <h3 className="capitalize" style={{ marginBottom: 2 }}>{exerciseNameFor(ex)}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Exercise history')} · {t(h.total === 1 ? '{0} session' : '{0} sessions', h.total)}</div>
    {/* Only reps work with a load produces an estimate, so the toggle is absent for the rest. */}
    {h.e1rmPoints.length > 0 && h.metric === 'weight' && <Segmented className="seg-range" value={curve} onChange={setCurve}
      options={[{ value: 'top', label: t('Top set') }, { value: 'e1rm', label: t('Est. 1RM') }]} />}
    <div className="chart" style={{ marginTop: 8 }}>
      <LineChart points={onE1 ? h.e1rmPoints : h.points} h={140} unit={onE1 ? st.unit : unit} color="var(--blue)" />
    </div>
    <div className="small row" style={{ margin: '6px 0 4px', gap: 5 }}>
      <Icon name="trophy" style={{ fontSize: 14, color: 'var(--yellow)' }} />
      {t('Best:')} <b className="accent">{fmtNum(onE1 ? e1Best : h.best)} {onE1 ? st.unit : unit}</b>
    </div>
    <h4 className="sec">{h.sessions.length < h.total ? t('Last {0} sessions', h.sessions.length) : t('Sessions')}</h4>
    <div className="list">
      {h.sessions.map(s => <div key={s.id} className="item" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="tt">{fmtDate(s.d, true)} {s.pr && <span className="pr"><Icon name="trophy" />PR</span>}</div>
          <div className="ss">{s.sets.map(x => setLabel(exId, x, s.target)).join('  ·  ')}</div>
          {tail(s) && <div className="small dim" style={{ marginTop: 3 }}>{tail(s)}</div>}
        </div>
        {s.value != null && s.value > 0 && <b className="accent nocap" style={{ whiteSpace: 'nowrap' }}>{fmtNum(s.value)} {unit}</b>}
      </div>)}
    </div>
  </>
}
export const exerciseHistorySheet = exId => ui().openSheet(close => <ExerciseHistory exId={exId} close={close} />)

/* ============================ add to routine ============================ */
function AddToRoutine({ ex, close }) {
  const st = useStore(s => s.S)
  const pick = rid => {
    close()
    const isNew = rid === '_new'
    exConfigSheet(ex, null, cfg => {
      update(s => {
        let r = isNew ? { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] } : s.routines.find(x => x.id === rid)
        if (isNew) s.routines.push(r)
        if (r) r.ex.push({ id: ex.id, ...cfg })
      })
      const r = isNew ? S().routines[S().routines.length - 1] : st.routines.find(x => x.id === rid)
      toast(t('“{0}” added to {1}', capWords(exerciseNameFor(ex)), r ? r.name : t('routine')))
      if (isNew && r) nav('/plan/r/' + r.id)
    }, null, isNew ? null : st.routines.find(x => x.id === rid))
  }
  return <>
    <h3 className="capitalize">{t('Add “{0}”', exerciseNameFor(ex))}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Pick a routine — sets, reps & weight come next.')}</div>
    <div className="list">
      {st.routines.map(r => <div key={r.id} className="item" {...tappable(() => pick(r.id))}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {r.ex.some(e => e.id === ex.id) && <span className="tag">{t('already in')}</span>}<Icon name="plus" className="chev" />
      </div>)}
      <div className="item" {...tappable(() => pick('_new'))}><span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="sparkles" /></span>
        <div className="grow"><div className="tt">{t('New routine')}</div><div className="ss">{t('Create one and start with this exercise')}</div></div><Icon name="plus" className="chev" /></div>
    </div>
  </>
}
export const addToRoutineSheet = ex => ui().openSheet(close => <AddToRoutine ex={ex} close={close} />)

/* ============================ custom exercises (issue #11) ============================ */
// Name + body part is all it takes — the exercise then behaves like any built-in one
// (planning, logging, PRs, stats), just without an animation.
function CustomExForm({ existing, prefill, onDone, close }) {
  const nameRef = useRef(null)
  const onNameFocus = useSheetKeyboard(nameRef)
  const [n, setN] = useState(existing ? existing.n : (prefill || ''))
  const [bp, setBp] = useState(existing ? existing.bp : '')
  const [desc, setDesc] = useState(existing ? (existing.desc || '') : '')
  const [primaries, setPrimaries] = useState(() => {
    if (existing && Array.isArray(existing.primaries) && existing.primaries.length) return [...existing.primaries]
    const norm = hasExplicitMuscleMetadata(existing || {}) ? normalizeMuscleGroups(existing || {}) : []
    return norm.length ? [norm[0]] : []
  })
  const [secondaries, setSecondaries] = useState(() => {
    if (existing && Array.isArray(existing.primaries) && existing.primaries.length) return [...(existing.secondaries || [])]
    const norm = hasExplicitMuscleMetadata(existing || {}) ? normalizeMuscleGroups(existing || {}) : []
    return norm.slice(1)
  })
  const togglePrimary = value => setPrimaries(current => current.includes(value) ? current.filter(m => m !== value) : [...current, value])
  const toggleSecondary = value => setSecondaries(current => current.includes(value) ? current.filter(m => m !== value) : [...current, value])
  const save = () => {
    const name = n.trim()
    if (!name) { toast(t('Give it a name')); return }
    if (!bp) { toast(t('Pick a body part')); return }
    const dup = allExercises(S()).find(e => e.n.toLowerCase() === name.toLowerCase() && e.id !== (existing || {}).id)
    if (dup) { toast(t('“{0}” already exists', dup.n)); return }
    const d = desc.trim().slice(0, 1000)
    const prim = [...primaries]
    const sm = secondaries.filter(m => !prim.includes(m))
    const groups = [...prim, ...sm]
    let id = existing && existing.id
    if (existing) update(s => { const c = (s.customEx || []).find(x => x.id === id); if (c) {
      c.n = name; c.bp = bp; c.desc = d; c.tg = prim[0] || ''; c.sm = sm; c.muscleGroups = groups; c.primaries = prim; c.secondaries = sm
    } })
    else {
      id = 'c' + uid()
      update(s => { (s.customEx = s.customEx || []).push({ id, n: name, bp, desc: d, tg: prim[0] || '', sm, muscleGroups: groups, primaries: prim, secondaries: sm, eq: 'custom', custom: true }) })
    }
    close()
    toast(existing ? t('Saved') : t('“{0}” created', name))
    onDone && onDone(EXIDX[id])
  }
  return <>
    <h3>{existing ? t('Edit custom exercise') : t('Create your own exercise')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Name it and pick a body part — it behaves like any other exercise, just without an animation.')}</div>
    <input ref={nameRef} className="input" placeholder={t('Exercise name')} value={n} onFocus={onNameFocus} onChange={e => setN(e.target.value)} />
    <div className="chips" style={{ margin: '12px 0' }}>
      {BODYPARTS.map(b => <button key={b} className={'chip' + (bp === b ? ' on' : '')} onClick={() => setBp(b)}>{t(b)}</button>)}
    </div>
    {bp && bp !== 'cardio' && <>
      <MultiSelectRow title={t('Primary muscle groups')} sheetTitle={t('Primary muscle groups')}
        values={primaries}
        options={MUSCLES.map(m => ({ value: m, label: t(MUSCLE_NAME[m]) }))}
        onToggle={togglePrimary} noneLabel={t('No explicit muscle group')} doneLabel={t('Done')} />
      <MultiSelectRow title={t('Additional muscle groups')} sheetTitle={t('Additional muscle groups')}
        values={secondaries}
        options={MUSCLES.filter(m => !primaries.includes(m)).map(m => ({ value: m, label: t(MUSCLE_NAME[m]) }))}
        onToggle={toggleSecondary} noneLabel={t('No explicit muscle group')} doneLabel={t('Done')} />
    </>}
    {bp === 'cardio' && <div className="small dim row" style={{ marginBottom: 10, gap: 5 }}><Icon name="figureRun" style={{ fontSize: 13 }} />{t('Cardio exercises log time + speed instead of weight × reps.')}</div>}
    <textarea className="input" rows={4} maxLength={1000} placeholder={t('Description (optional) — setup, cues, anything you want to remember')}
      value={desc} onChange={e => setDesc(e.target.value)} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{existing ? t('Save') : t('Create exercise')}</Button>
    {existing && <><div style={{ height: 8 }} /><Button variant="danger" icon="trash" onClick={() => { close(); deleteCustomEx(existing) }}>{t('Delete exercise')}</Button></>}
  </>
}
export const customExSheet = (existing, onDone, prefill) => ui().openSheet(close => <CustomExForm existing={existing} prefill={prefill} onDone={onDone} close={close} />)

export function deleteCustomEx(ex, afterDelete) {
  if (S().active?.entries.some(e => e.id === ex.id)) { toast(t('Finish your current workout first')); return }
  confirmSheet({
    title: t('Delete “{0}”?', ex.n),
    message: t('It will be removed from your routines. Already-logged workouts keep their sets.'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => {
      update(s => {
        // Keep display and muscle metadata in history before the custom catalogue row disappears.
        const snapshot = exerciseMuscleSnapshot(ex)
        s.workouts.forEach(w => w.entries.forEach(e => {
          if (e.id !== ex.id) return
          e.n = ex.n
          if (!e.muscleSnapshot || !Object.keys(e.muscleSnapshot).length) e.muscleSnapshot = snapshot
        }))
        s.customEx = (s.customEx || []).filter(x => x.id !== ex.id)
        s.routines.forEach(r => { r.ex = r.ex.filter(e => e.id !== ex.id); cleanupSg(r.ex) })
        delete s.exWeights[ex.id]
        s.favEx = (s.favEx || []).filter(id => id !== ex.id)
      })
      toast(t('Exercise deleted'))
      afterDelete && afterDelete()
    }
  })
}

