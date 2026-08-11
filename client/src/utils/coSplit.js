// ---------------------------------------------------------------
// CO split helpers
//
// A periodical test is entered as a single total mark. The three
// question marks that make up that total are NOT calculated - they
// are read from the hand-authored lookup table in mockData
// (coSplitValues). See the warning on that export.
// ---------------------------------------------------------------

import { coSplitValues } from '../data/mockData'

const SPLIT_BY_TOTAL = new Map(coSplitValues.map((row) => [row.totalMark, row]))

/**
 * Look up the q1/q2/q3 split for a total mark.
 * Returns null when the total has no row in the table (out of range,
 * fractional, or not a number) - never a guessed or interpolated split.
 */
export function splitTotal(totalMark) {
  const row = SPLIT_BY_TOTAL.get(totalMark)
  if (!row) return null
  return { q1: row.q1, q2: row.q2, q3: row.q3 }
}

/**
 * Map a q1/q2/q3 split onto CO numbers for a given assessment kind.
 * Returns an object keyed by CO number, or null if the split is missing
 * or the kind has no question-to-CO mapping.
 *
 * NOTE: the PT2 mapping is DELIBERATELY REVERSED with respect to PT1.
 * PT1 covers CO1-CO3 in question order (Q1->CO1, Q2->CO2, Q3->CO3),
 * while PT2 covers CO3-CO5 running the other way (Q3->CO3, Q2->CO4,
 * Q1->CO5). This is how the source workbook allocates them: the small
 * 10-mark question Q3 carries the CO that both tests share (CO3), and
 * the two 20-mark questions carry the later COs. This is not a bug and
 * must not be "tidied up" into a straight Q1->CO3, Q2->CO4, Q3->CO5.
 */
export function mapSplitToCOs(split, assessmentKind) {
  if (!split) return null

  if (assessmentKind === 'PT1') {
    return { 1: split.q1, 2: split.q2, 3: split.q3 }
  }

  if (assessmentKind === 'PT2') {
    return { 3: split.q3, 4: split.q2, 5: split.q1 }
  }

  return null
}
