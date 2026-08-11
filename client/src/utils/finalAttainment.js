// ---------------------------------------------------------------
// Final attainment rules - pure functions, no React.
//
// Everything here works on CO attainment LEVELS (0-3), not raw marks.
// Per-assessment levels come from the existing chain in ./attainment.js
// and ./coSplit.js - see assessmentCoLevels() at the bottom, which
// composes those helpers rather than repeating their maths.
//
// The one data import is studentCoMarks, needed because 'manual'
// assessments (IP1, IP2, SEE) store per-CO marks directly instead of a
// total to be split. Everything else is passed in by the caller.
//
// A MISSING COMPONENT IS NEVER TREATED AS ZERO. Anything with no marks
// entered contributes null and is dropped from the weighting entirely.
// ---------------------------------------------------------------

import { attainmentLevel, coPercent, isAchieved, percentAchieved } from './attainment'
import { mapSplitToCOs, splitTotal } from './coSplit'
import { studentCoMarks } from '../data/mockData'

/**
 * Per-CO marks for one student in a 'manual' assessment (IP1, IP2, SEE),
 * read straight from student_co_marks. In manual mode the per-CO marks are
 * the entered data; there is no total to split. Returns an object keyed by
 * CO number, or null when the student has no rows.
 */
export function manualCoMarks(assessmentId, studentId) {
  const rows = studentCoMarks.filter(
    (m) => m.assessmentId === assessmentId && m.studentId === studentId,
  )
  if (rows.length === 0) return null
  const marks = {}
  for (const row of rows) marks[row.coNumber] = row.marksObtained
  return marks
}

/**
 * Rule: CIE component weights, derived from the course nature's mark scale.
 * A periodical test is worth its own maximum out of 100; the internal
 * practical total is split evenly between IP1 and IP2.
 *
 * These are NOT hardcoded: for Theory & Lab (15/15/20) this yields
 * .15/.15/.10/.10 and for Theory (12/12/16) it yields .12/.12/.08/.08,
 * which is exactly what the source workbooks show.
 *
 * Returns null for a component whose maximum is not stated (e.g. the
 * Mini Project nature, where the whole scale is null).
 */
export function componentWeights(nature) {
  if (!nature) return { PT1: null, PT2: null, IP1: null, IP2: null }
  const half = nature.ipMax === null || nature.ipMax === undefined ? null : nature.ipMax / 2
  return {
    PT1: nature.pt1Max === null || nature.pt1Max === undefined ? null : nature.pt1Max / 100,
    PT2: nature.pt2Max === null || nature.pt2Max === undefined ? null : nature.pt2Max / 100,
    IP1: half === null ? null : half / 100,
    IP2: half === null ? null : half / 100,
  }
}

/**
 * Rule: CIE level for one CO - the weighted mean of the component levels.
 * Components with no level (no marks entered) are EXCLUDED from both the
 * numerator and the denominator, so a missing test cannot drag the CIE
 * down. Returns null when nothing contributed.
 */
export function cieLevel(levelsByComponent, weights) {
  let weighted = 0
  let weightSum = 0

  for (const component of Object.keys(weights)) {
    const level = levelsByComponent[component]
    const weight = weights[component]
    if (level === null || level === undefined) continue
    if (weight === null || weight === undefined) continue
    weighted += weight * level
    weightSum += weight
  }

  if (weightSum === 0) return null
  return weighted / weightSum
}

/**
 * Rule: direct attainment = cieWeight * CIE + seeWeight * SEE.
 * Returns null if either side is missing - a course with no SEE result
 * has no direct attainment yet, and must not be reported as if it did.
 */
export function directLevel(cie, see, constants) {
  if (cie === null || cie === undefined) return null
  if (see === null || see === undefined) return null
  return constants.cieWeight * cie + constants.seeWeight * see
}

/**
 * Rule: final attainment = directWeight * direct + surveyWeight * survey.
 * Returns null if either side is missing.
 */
export function finalLevel(direct, survey, constants) {
  if (direct === null || direct === undefined) return null
  if (survey === null || survey === undefined) return null
  return constants.directWeight * direct + constants.surveyWeight * survey
}

/**
 * Rule: what one CO contributes to one PO/PSO.
 * Scaled by the articulation strength out of the maximum strength of 3.
 * Returns null when the CO has no final level or no correlation.
 */
export function poLevelFromCO(coFinalLevel, matrixValue) {
  if (coFinalLevel === null || coFinalLevel === undefined) return null
  if (!matrixValue) return null
  return (coFinalLevel * matrixValue) / 3
}

/**
 * Rule: overall level for one PO/PSO across all COs.
 * SUMPRODUCT(co levels, matrix values) / SUM(matrix values), counting only
 * COs that both have a level and map to that outcome. Returns null when
 * nothing maps to it.
 */
export function overallOutcomeLevel(coLevels, matrixValuesForThatOutcome) {
  let product = 0
  let valueSum = 0

  for (const coNumber of Object.keys(matrixValuesForThatOutcome)) {
    const value = matrixValuesForThatOutcome[coNumber]
    const level = coLevels[coNumber]
    if (!value) continue
    if (level === null || level === undefined) continue
    product += level * value
    valueSum += value
  }

  if (valueSum === 0) return null
  return product / valueSum
}

/**
 * The per-assessment CO levels, using the SAME chain as the Attainment
 * screen: total -> split -> CO marks -> percentage -> achieved count ->
 * percentage of attended students -> band. Nothing here re-derives that
 * maths; it only composes the helpers.
 *
 * Absent students, and students with no mark on record, are excluded.
 * Returns an object keyed by CO number, or an empty object when no marks
 * have been entered for the assessment.
 */
export function assessmentCoLevels({
  assessment,
  allocation,
  records,
  students: roster,
  targetPercent,
  bands,
}) {
  if (!assessment) return {}

  const attended = []
  for (const student of roster) {
    const record = records.find((r) => r.studentId === student.id)
    if (!record || record.isAbsent || record.totalObtained === null) continue
    // 'manual' assessments carry their own per-CO marks; 'lookup' ones
    // (PT1/PT2) go through the hand-authored split table exactly as before.
    attended.push(
      assessment.splitMode === 'manual'
        ? manualCoMarks(assessment.id, student.id)
        : mapSplitToCOs(splitTotal(record.totalObtained), assessment.kind),
    )
  }

  if (attended.length === 0) return {}

  const levels = {}
  for (const alloc of allocation) {
    let achieved = 0
    for (const coMarks of attended) {
      const obtained = coMarks ? coMarks[alloc.coNumber] : null
      if (isAchieved(coPercent(obtained, alloc.marksAllocated), targetPercent)) achieved += 1
    }
    levels[alloc.coNumber] = attainmentLevel(percentAchieved(achieved, attended.length), bands)
  }
  return levels
}
