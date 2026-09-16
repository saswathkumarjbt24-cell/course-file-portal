// BEGIN REMOVABLE -- the empty-field mark
// ---------------------------------------------------------------
// ONE character for "this field holds nothing", used on screen and on paper.
//
// WHY A DASH AND NOT A SENTENCE
//   The sheets print inside a department course file. "Not recorded" in a
//   cell reads as a statement ABOUT the department -- that it failed to
//   record something -- rather than as an empty box. A dash is how the
//   department's own workbook marks an empty field, and it is what they
//   asked for after reviewing the printed output.
//
// A PLAIN ASCII HYPHEN, not an en dash, em dash or a "--" pair. It is the
//   character the department types, it survives a copy into Excel, and it
//   cannot be mistaken for a minus sign at 12pt.
//
// WHAT THIS IS NOT FOR
//   Sentences that DESCRIBE an absence rather than standing in for one
//   value: an empty state explaining that a course has no allocations, the
//   note on the Activity screen about when login recording began, "Absent"
//   on a mark sheet (a real state, not a missing field), or the reason a
//   student is excluded from attainment. Those say something the field
//   label does not, and a dash would destroy it.
// ---------------------------------------------------------------
export const ABSENT = '-'
// END REMOVABLE -- the empty-field mark
