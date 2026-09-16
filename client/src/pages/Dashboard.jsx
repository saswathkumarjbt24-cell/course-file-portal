import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchCourseMeta, fetchCourseNatures, fetchCourses } from '../data/api'
import { DataError, DataLoading, useApiData } from '../data/useApiData'
import './Dashboard.css'
// BEGIN REMOVABLE -- the empty-field mark
import { ABSENT } from '../components/emptyField'
// END REMOVABLE -- the empty-field mark

// ---------------------------------------------------------------
// BEGIN REMOVABLE -- dashboard offering filter
//
// Everything this feature adds is inside a marker like this one: the three
// constants and the helper below, the block inside DashboardView, the
// NoMatches component at the foot of the file, the `courseMeta` line of
// LOADERS, the two imports above, and Dashboard.css. To take it out, delete
// the marked spans and render `courses` where `shown` is rendered.
//
// WHERE THE FILTERABLE VALUES COME FROM
//   fetchCourseMeta, unchanged. Batch, semester and academic year are the
//   migration-012 offering columns, and GET /api/courses deliberately does
//   not carry them -- see the note on COURSE_META_SELECT in server/helpers.js
//   and on fetchCourseMeta in ../data/api.js. That loader fans out over
//   /api/courses/:id, which is the only endpoint that does. No endpoint is
//   added here and no response shape is changed.
//
// WHY THIS CANNOT WIDEN THE LIST
//   fetchCourseMeta builds its fan-out from fetchCourses, which the server
//   has already narrowed to the signed-in person -- their own allocations if
//   they are faculty, every course if they are an admin. The meta therefore
//   describes exactly the courses already on this screen and no others,
//   every option offered below is read out of that same set, and the
//   filtering itself only removes entries from an array the server handed
//   us. There is no request here that could return a course the caller may
//   not see, and no filter combination that could add one.
//
// THREE CONTROLS, NOT ONE
//   Batch, semester and academic year are independent axes and are asked
//   about independently -- "all of seventh semester", "everything for the
//   2022 batch". A single combined picker would have to offer their product,
//   which is a list of two dozen compound labels that grows every year, and
//   it could not express "this batch, any semester" at all.
// ---------------------------------------------------------------

/** The three axes, in the order they read on screen. */
const FILTERS = [
  { key: 'batch', label: 'Batch' },
  { key: 'semester', label: 'Semester' },
  { key: 'academicYear', label: 'Academic year' },
]

const NO_FILTER = { batch: '', semester: '', academicYear: '' }

/** Roman numerals sort as text into I, III, II -- so they are ordered by value. */
const SEMESTER_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

/**
 * The distinct values of one offering column across the courses on screen.
 *
 * Nothing is hardcoded: a batch or an academic year that is not in the data
 * is not in the list, and one that appears later needs no code change.
 * Blank and null are dropped rather than offered as an unlabelled option --
 * a course whose cover page was never filled in is reached through "All".
 *
 * Semesters run in teaching order; everything else runs newest first, which
 * for 'YYYY - YYYY' is a plain descending string sort.
 */
function optionsFor(key, metaRows) {
  const seen = new Set()
  metaRows.forEach((m) => {
    const value = m?.[key]
    if (typeof value === 'string' && value.trim() !== '') seen.add(value)
  })
  const values = [...seen]
  if (key !== 'semester') return values.sort((a, b) => b.localeCompare(a))
  return values.sort((a, b) => {
    const ia = SEMESTER_ORDER.indexOf(a)
    const ib = SEMESTER_ORDER.indexOf(b)
    // Anything unrecognised sorts after the numerals rather than vanishing.
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}
// END REMOVABLE -- dashboard offering filter

const LOADERS = {
  courseNatures: fetchCourseNatures,
  courses: fetchCourses,
  // BEGIN REMOVABLE -- dashboard offering filter
  courseMeta: fetchCourseMeta,
  // END REMOVABLE -- dashboard offering filter
}

export default function Dashboard() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="cards" />
  if (error) return <DataError error={error} />
  return <DashboardView {...data} />
}

function DashboardView({ courseNatures, courses, courseMeta }) {
  const natureName = (natureId) => {
    const nature = courseNatures.find((n) => n.id === natureId)
    return nature ? nature.name : ABSENT
  }

  // BEGIN REMOVABLE -- dashboard offering filter
  const [filter, setFilter] = useState(NO_FILTER)

  const metaById = useMemo(() => {
    const map = new Map()
    ;(courseMeta ?? []).forEach((m) => map.set(m.courseId, m))
    return map
  }, [courseMeta])

  // The options are read from every course in scope, NOT from the courses
  // left after the other two selects. Narrowing them as you choose would
  // make options vanish from under the pointer, and the count line below
  // already says plainly when a combination matches nothing.
  const options = useMemo(() => {
    const rows = courses.map((c) => metaById.get(c.id)).filter(Boolean)
    return Object.fromEntries(FILTERS.map((f) => [f.key, optionsFor(f.key, rows)]))
  }, [courses, metaById])

  // A course whose cover page is blank has no value on that axis, so it is
  // matched only by "All" -- never by a value it does not carry.
  const shown = useMemo(
    () =>
      courses.filter((course) => {
        const meta = metaById.get(course.id)
        return FILTERS.every(({ key }) => !filter[key] || meta?.[key] === filter[key])
      }),
    [courses, metaById, filter]
  )

  const isFiltered = FILTERS.some(({ key }) => filter[key] !== '')
  const reset = () => setFilter(NO_FILTER)
  // END REMOVABLE -- dashboard offering filter

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Dashboard</h1>
        <p className="page-header__subtitle">
          {courses.length} course files assigned to you this semester.
        </p>
      </header>

      {/* BEGIN REMOVABLE -- dashboard offering filter */}
      <div className="dash-filter">
        {FILTERS.map(({ key, label }) => (
          <div className="dash-filter__field" key={key}>
            <label className="dash-filter__label" htmlFor={`dash-filter-${key}`}>
              {label}
            </label>
            <select
              id={`dash-filter-${key}`}
              className="dash-filter__select"
              value={filter[key]}
              disabled={options[key].length === 0}
              onChange={(event) =>
                setFilter((current) => ({ ...current, [key]: event.target.value }))
              }
            >
              <option value="">All</option>
              {options[key].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="dash-filter__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={reset}
            disabled={!isFiltered}
          >
            Show all
          </button>
        </div>

        {/* On screen whether or not a filter is set, so an empty grid is
            never a mystery: the reader can see they narrowed it themselves. */}
        <p className="dash-filter__count" role="status" aria-live="polite">
          Showing {shown.length} of {courses.length} course files.
        </p>
      </div>
      {/* END REMOVABLE -- dashboard offering filter */}

      {shown.length === 0 ? (
        <NoMatches total={courses.length} onReset={reset} />
      ) : (
        <div className="card-grid">
          {shown.map((course) => (
            <Link key={course.id} to={`/course/${course.id}`} className="course-card">
              <span className="course-card__code">{course.code}</span>
              <h2 className="course-card__title">{course.title}</h2>

              <dl className="course-card__meta">
                <div>
                  <dt>Nature</dt>
                  <dd>{natureName(course.natureId)}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{course.department}</dd>
                </div>
              </dl>

              <div className="course-card__footer">
                <span className="course-card__footer-label">CO target</span>
                <span className="tag">{course.coTargetPercent.toFixed(2)}%</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

// BEGIN REMOVABLE -- dashboard offering filter
/**
 * What the grid becomes when it has nothing to show.
 *
 * An empty card grid and a dashboard with no allocations look identical, and
 * the second is alarming. This says which it is and carries the way out, so
 * the reader does not have to find the selects again to escape.
 *
 * NOBODY IS TOLD THEY FILTERED SOMETHING AWAY WHEN THEY DID NOT. A person
 * with no allocations at all sees an empty grid too, and blaming the filter
 * would send them hunting for a control that is already set to All. That
 * case gets its own sentence and no reset button, because there is nothing
 * to reset.
 *
 * Built from the shared .empty-state and .btn classes -- no new styling.
 */
function NoMatches({ total, onReset }) {
  if (total === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state__title">No course files are allocated to you.</p>
        <p className="empty-state__body">
          Course files appear here once somebody allocates a course to you. Nothing is
          filtered out -- there is nothing to show yet.
        </p>
      </div>
    )
  }

  return (
    <div className="empty-state">
      <p className="empty-state__title">No course files match this filter.</p>
      <p className="empty-state__body">
        None of your {total} course files are in this combination of batch, semester and
        academic year. Widen the filter, or clear it to see them all again.
      </p>
      <div className="empty-state__action">
        <button type="button" className="btn btn--secondary" onClick={onReset}>
          Show all {total} course files
        </button>
      </div>
    </div>
  )
}
// END REMOVABLE -- dashboard offering filter
