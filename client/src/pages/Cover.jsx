import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchCourseMeta,
  fetchCourses,
  fetchInstitution,
  isApiMode,
  saveCourseMeta,
} from '../data/api'
import { DataError, DataLoading, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import './Documents.css'

const LOADERS = {
  courseMeta: fetchCourseMeta,
  courses: fetchCourses,
  institution: fetchInstitution,
}

// ---------------------------------------------------------------
// The six editable cover-page fields, in printed order.
//
// These used to be module-level constants in this file -- one hardcoded
// programme, batch and academic year shown on every course's cover sheet
// regardless of which course it was. They now come from the course record
// (migration 012) and are saved through PUT /api/courses/:id/meta.
//
// `maxLength` matches the column, so an over-long value is caught here rather
// than coming back as a 400 after a round trip.
// ---------------------------------------------------------------
const META_FIELDS = [
  { key: 'programme', label: 'Programme', maxLength: 120 },
  { key: 'batch', label: 'Batch', maxLength: 20 },
  { key: 'academicYear', label: 'Academic year', maxLength: 20 },
  { key: 'yearOfStudy', label: 'Year of study', maxLength: 20 },
  { key: 'semester', label: 'Semester', maxLength: 10 },
  { key: 'section', label: 'Section', maxLength: 10 },
]

const EMPTY_META = {
  programme: null,
  batch: null,
  academicYear: null,
  yearOfStudy: null,
  semester: null,
  section: null,
  handledBy: [],
  fileIncharge: [],
}

// "Faculty B, Associate Professor / CSE" -- how the source sheets write it.
// An allocation with nobody in it prints the placeholder, never a blank line
// and never an invented name.
function describePeople(people) {
  if (!people || people.length === 0) return null
  return people
    .map((p) =>
      [p.name, [p.designation, p.department].filter(Boolean).join(' / ')]
        .filter(Boolean)
        .join(', '),
    )
    .join('; ')
}

function seedForm(meta) {
  const seeded = {}
  for (const field of META_FIELDS) seeded[field.key] = meta[field.key] ?? ''
  return seeded
}

/** A recorded value, or a muted placeholder. Never an empty cell. */
function Value({ value }) {
  if (value === null || value === undefined || value === '') {
    return <span className="doc-value--muted">Not recorded</span>
  }
  return <>{value}</>
}

export default function Cover({ embedded = false }) {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading />
  if (error) return <DataError error={error} />
  return <CoverView embedded={embedded} {...data} />
}

function CoverView({ embedded, courseMeta, courses, institution }) {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)
  const meta = courseMeta.find((m) => m.courseId === courseId) ?? EMPTY_META

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => seedForm(meta))
  const [savedNonce, setSavedNonce] = useState(0)
  const [saveState, runSave] = useSave()

  // Reseed when the route points at a different course. The record is looked
  // up again in here rather than depending on the derived `meta` object,
  // which is a fresh reference on every render.
  useEffect(() => {
    const found = courseMeta.find((m) => m.courseId === courseId) ?? EMPTY_META
    setForm(seedForm(found))
    setEditing(false)
  }, [courseMeta, courseId])

  useEffect(() => {
    if (savedNonce === 0) return undefined
    const timer = setTimeout(() => setSavedNonce(0), 4000)
    return () => clearTimeout(timer)
  }, [savedNonce])

  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? 'Saving writes the cover details, and moves the allocation with them.'
    : 'Nothing is sent to a server yet.'

  const serverIssues = {}
  for (const issue of saveState.issues ?? []) {
    if (issue.field !== undefined) serverIssues[issue.field] = issue.message
  }

  function handleSave() {
    // All six are sent. The endpoint replaces the whole set, so a field left
    // empty is cleared rather than quietly keeping its old value.
    const body = {}
    for (const field of META_FIELDS) body[field.key] = form[field.key] ?? ''
    runSave(
      () => saveCourseMeta(courseId, body),
      () => {
        setSavedNonce((n) => n + 1)
        setEditing(false)
      },
    )
  }

  function handleCancel() {
    setForm(seedForm(meta))
    setEditing(false)
  }

  if (!course) {
    return <div className="placeholder">No such course in the current data.</div>
  }

  const handledBy = describePeople(meta.handledBy)
  const fileIncharge = describePeople(meta.fileIncharge)

  return (
    <section className="doc-card">
      <article className="doc-sheet">
        <header className="doc-head">
          <h1 className="doc-head__name">{institution.name}</h1>
          <p className="doc-head__line">{institution.place}</p>
          <p className="doc-head__line">{institution.affiliation}</p>
          <p className="doc-head__line">{institution.accreditation}</p>
        </header>

        <h2 className="doc-title">COURSE FILE</h2>

        {/* The Full Course File embeds this sheet read-only. */}
        {!embedded && (
          <div className="doc-edit-bar">
            {editing ? (
              <>
                <button
                  type="button"
                  className="doc-button"
                  disabled={saveState.saving}
                  onClick={handleSave}
                >
                  {saveState.saving ? 'Saving…' : 'Save cover details'}
                </button>
                <button
                  type="button"
                  className="doc-button"
                  disabled={saveState.saving}
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="doc-button" onClick={() => setEditing(true)}>
                Edit cover details
              </button>
            )}
            {savedNonce > 0 ? (
              <span className="doc-status doc-status--saved">{savedLabel}</span>
            ) : (
              <span className="doc-status">{idleLabel}</span>
            )}
          </div>
        )}

        <dl className="doc-fields">
          <div className="doc-field">
            <dt className="doc-field__term">Department</dt>
            <dd className="doc-field__value">
              <Value value={course.department} />
            </dd>
          </div>

          {META_FIELDS.map((field) => {
            const stored = meta[field.key]
            const error = serverIssues[field.key]
            return (
              <div className="doc-field" key={field.key}>
                <dt className="doc-field__term">{field.label}</dt>
                <dd className="doc-field__value">
                  {editing && !embedded ? (
                    <>
                      <input
                        type="text"
                        autoComplete="off"
                        maxLength={field.maxLength}
                        className={error ? 'doc-input doc-input--invalid' : 'doc-input'}
                        value={form[field.key] ?? ''}
                        aria-invalid={error ? true : undefined}
                        aria-label={field.label}
                        title={error || undefined}
                        placeholder={`${field.label} (not recorded)`}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, [field.key]: event.target.value }))
                        }
                      />
                      {/* Printing mid-edit shows the value, not the box. */}
                      <span className="doc-print-value">
                        <Value value={form[field.key]} />
                      </span>
                    </>
                  ) : (
                    <Value value={stored} />
                  )}
                </dd>
              </div>
            )
          })}

          <div className="doc-field">
            <dt className="doc-field__term">Course code</dt>
            <dd className="doc-field__value">
              <Value value={course.code} />
            </dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Course title</dt>
            <dd className="doc-field__value">
              <Value value={course.title} />
            </dd>
          </div>

          {/* Read-only: these come from course_allocations, not from this
              sheet. Who teaches a course and who owns its file is recorded
              once for the institution, so a course file cannot carry its own
              conflicting copy. */}
          <div className="doc-field">
            <dt className="doc-field__term">Handled by</dt>
            <dd className="doc-field__value">
              <Value value={handledBy} />
            </dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Course file incharge</dt>
            <dd className="doc-field__value">
              <Value value={fileIncharge} />
            </dd>
          </div>
        </dl>

        {/* A rejected save wrote nothing; what was typed stays on screen. */}
        {!embedded && <SaveFeedback state={saveState} />}

        <div className="doc-sign">
          <div className="doc-sign__block">
            <div className="doc-sign__line">Course Faculty</div>
          </div>
          <div className="doc-sign__block">
            <div className="doc-sign__line">HOD</div>
          </div>
        </div>
      </article>

      {!embedded && (
        <div className="doc-actions">
          <button type="button" className="doc-button" onClick={() => window.print()}>
            Print
          </button>
          <span className="doc-status">
            Handled by and course file incharge come from the allocation and are not edited
            here. Printing drops the navigation and buttons.
          </span>
        </div>
      )}
    </section>
  )
}
