// ---------------------------------------------------------------
// BEGIN REMOVABLE -- department picker (shared helpers)
//
// The non-component half of the department control, kept in its own plain
// module so DepartmentField.jsx exports a component and nothing else -- which
// is what react-refresh needs, and what oxlint's only-export-components rule
// is asking for.
//
// MOVED HERE FROM pages/Users.jsx, UNCHANGED, when the Courses screen needed
// the same control. Two copies of "which departments exist and how a new one
// is typed" would drift apart, which is the exact class of bug the control was
// written to prevent.
// ---------------------------------------------------------------

// The select's "Add new department..." option. It is a SENTINEL, not a
// department: the `isNew` flag beside it is what the rest of the code reads,
// so this string only ever has to survive the round trip through the DOM
// select and is never sent anywhere.
export const NEW_DEPARTMENT = '__add_new_department__'

/** Case-insensitive membership, matching how the server de-duplicates. */
export function listHas(departments, value) {
  const needle = value.trim().toLowerCase()
  return departments.some((d) => d.trim().toLowerCase() === needle)
}

/**
 * What to send for the department: trimmed, with '' meaning "not recorded",
 * which the column holds as NULL.
 */
export function departmentToSend(value) {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// END REMOVABLE -- department picker (shared helpers)
