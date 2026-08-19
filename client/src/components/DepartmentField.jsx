// ---------------------------------------------------------------
// BEGIN REMOVABLE -- department picker (shared)
//
// The department control, and the two helpers that go with it.
//
// MOVED HERE FROM pages/Users.jsx, UNCHANGED.
//   It was module-local to that page until the Courses screen needed the same
//   control. Copying it would have left two definitions of "which departments
//   exist and how a new one is typed" to drift apart, which is the exact class
//   of bug this control was written to prevent. Users.jsx now imports it from
//   here and renders identically; nothing about its behaviour, markup or class
//   names changed in the move.
//
//   The styles it uses (.users-dept, .users-input, .users-select,
//   .users-table-input) still live in pages/Users.css. Every screen that
//   renders this component imports that stylesheet.
//
//   NEW_DEPARTMENT, listHas and departmentToSend sit in ./departments.js
//   rather than here, so this file exports a component and nothing else.
//
// WHY A SELECT AT ALL
//   Free text allowed 'Biotechnology' and 'biotechnology' to coexist, and hod
//   scoping compares faculty.department to courses.department by equality --
//   so a typo silently changed which courses a hod could reach, with no error
//   raised anywhere. The list removes the ordinary route to that mistake.
//
//   It does NOT remove the mistake itself. The new-department box below
//   accepts anything, and nothing stops a client posting whatever it likes.
//   The server canonicalises every write against the departments it already
//   knows; this control is the convenience, not the guarantee.
// ---------------------------------------------------------------

import { NEW_DEPARTMENT, listHas } from './departments'

/**
 * A select of the departments that already exist, plus a way in for one that
 * does not.
 *
 * AN UNKNOWN CURRENT VALUE IS OFFERED, NOT DISCARDED.
 *   A row whose department is not in the list -- entered before this control
 *   existed, or created since the screen loaded -- gets its own option so it
 *   shows as the current selection. Falling back to empty would mean opening
 *   the editor and saving silently cleared a department nobody meant to touch.
 */
export function DepartmentField({ departments, value, isNew, onChange, inTable = false }) {
  const trimmed = value.trim()

  // The row's own value, when the list does not carry it. Not merged into the
  // shared list: it belongs to this control only.
  const unlisted = !isNew && trimmed !== '' && !listHas(departments, trimmed)

  const inputClass = inTable ? 'users-select users-table-input' : 'users-select'

  return (
    <div className="users-dept">
      <select
        className={inputClass}
        aria-label="Department"
        value={isNew ? NEW_DEPARTMENT : value}
        onChange={(event) => {
          const picked = event.target.value
          if (picked === NEW_DEPARTMENT) {
            // Start the new name empty rather than carrying the previous
            // department's text in, which would read as a rename.
            onChange({ value: '', isNew: true })
          } else {
            onChange({ value: picked, isNew: false })
          }
        }}
      >
        <option value="">No department</option>
        {unlisted && <option value={value}>{value}</option>}
        {departments.map((department) => (
          <option key={department} value={department}>
            {department}
          </option>
        ))}
        <option value={NEW_DEPARTMENT}>Add new department...</option>
      </select>

      {isNew && (
        <input
          className={inTable ? 'users-input users-table-input' : 'users-input'}
          type="text"
          aria-label="New department name"
          placeholder="New department name"
          value={value}
          onChange={(event) => onChange({ value: event.target.value, isNew: true })}
        />
      )}
    </div>
  )
}

// END REMOVABLE -- department picker (shared)
