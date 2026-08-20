// BEGIN REMOVABLE -- stored remedial register
// ---------------------------------------------------------------
// WHICH VALUE A REMEDIAL CELL SHOWS.
//
// THE HAND-MARKED REGISTER IS AUTHORITATIVE.
//   The derived value -- PR for a CO the student fell below target in -- is
//   the STARTING STATE of a class nobody has marked yet, and nothing more.
//   Once a row exists for a (student, class) pair, that row wins: on the
//   screen, and on the printed course file.
//
// ONE RULE, TWO SCREENS.
//   Remedial.jsx and FullCourseFile.jsx both answer this question, and before
//   this module they answered it in two places that could drift apart. A
//   register that printed differently from the way it was entered would be
//   worse than no register at all, so the rule lives here once.
//
// THESE FUNCTIONS ARE PURE, and deliberately take plain values rather than
// the component's state, so the rule can be tested without a browser.
// ---------------------------------------------------------------

/** The UI's blank option. NOT a status: it is how 'NA' is drawn. */
export const NOT_RECORDED = '--'

/**
 * The attendance a cell shows.
 *
 *   edit     what the user has typed this session, or undefined
 *   stored   'PR' | 'AB' | 'NA' from the database, or undefined for no row
 *   derived  true when the student fell below target in this CO
 *
 * A stored 'NA' means "recorded as not required" and draws as '--'. It must
 * NEVER fall through to the derived 'PR': reading a recorded absence of
 * requirement back as attendance would put a student in a register they were
 * never in.
 */
export function attendanceCellValue({ edit, stored, derived }) {
  if (edit !== undefined) return edit
  if (stored !== undefined) return stored === 'NA' ? NOT_RECORDED : stored
  return derived ? 'PR' : NOT_RECORDED
}

/**
 * The after-remedial mark an INPUT shows, always a string.
 *
 * A stored 0 is a real mark -- a student who scored nothing on the
 * re-assessment -- and renders as "0". Only null, meaning no mark recorded,
 * renders as the empty box. Collapsing the two would silently turn a zero
 * into "not attempted".
 */
export function afterMarkCellValue({ edit, stored }) {
  if (edit !== undefined) return edit
  if (stored !== undefined && stored !== null) return String(stored)
  return ''
}

/**
 * The after-remedial mark the PRINTED sheet shows.
 *
 * Returns null for "print the blank cell", which is what an unmarked sheet
 * needs: a box to fill in by pen. A stored 0 returns 0, not null.
 */
export function afterMarkPrintValue(stored) {
  return stored === undefined || stored === null ? null : stored
}
// END REMOVABLE -- stored remedial register
