// ---------------------------------------------------------------
// BEGIN REMOVABLE -- edit permission scope
//
// WHO MAY EDIT WHAT, expressed once so nine screens cannot drift apart.
//
// THIS FILE ENFORCES NOTHING.
//   It decides what to DRAW. Every rule below is already enforced on the
//   server -- requireCourseFileEditor in routes/courses.js and
//   assertDepartmentWrite in routes/reference.js -- and a faculty member who
//   calls those endpoints directly is refused there regardless of what the
//   browser chose to render. Hiding a control is not a restriction; it only
//   stops the screen offering something that would fail.
//
//   If this file and the server ever disagree, the server is right and this
//   is the bug.
//
// THE SCOPE
//   faculty  may enter MARKS, and nothing else. PUT /api/assessments/:id/marks
//            keeps its existing course-allocation ownership check, untouched.
//   hod      unchanged from before this scope existed: their own department's
//            course files and reference data, exactly as the course and
//            department scopes in server/auth.js already allowed.
//   admin    unrestricted, exactly as before.
//
// READS ARE NOT AFFECTED BY ANY OF THIS.
//   A faculty member still sees every screen and every figure for their own
//   courses. Nothing here may be used to hide data -- only to hide a control
//   that writes it.
// ---------------------------------------------------------------

/**
 * May this person change a course file -- outcomes, the CO/PO matrix, the
 * cover, the name list, attendance, the exit survey, remedial or the closing
 * report?
 *
 * Mirrors requireCourseFileEditor on the server. hod is included because this
 * scope deliberately did not change what a hod may do; the server still
 * narrows a hod to their own department through requireCourseAccess, which
 * this cannot and does not try to reproduce.
 */
export function canEditCourseFile(faculty) {
  return faculty?.role === 'admin' || faculty?.role === 'hod'
}

/**
 * May this person change institution or department reference data -- vision,
 * mission, PEOs, PSOs?
 *
 * The same two roles, and it was ALREADY the same two before this scope
 * existed: assertDepartmentWrite has always refused an ordinary faculty
 * member. Nothing changed on the server for these; the screens simply stopped
 * offering a button that could only ever have failed.
 */
export function canEditReference(faculty) {
  return faculty?.role === 'admin' || faculty?.role === 'hod'
}

/**
 * The sentence shown in place of a control this account may not use.
 *
 * Says what the reader MAY do as well as what they may not, because "you
 * cannot do this" with no alternative reads as a fault rather than a rule.
 */
export const READ_ONLY_NOTE =
  'Read-only: only an administrator can change this. Your account can enter marks.'

// END REMOVABLE -- edit permission scope
