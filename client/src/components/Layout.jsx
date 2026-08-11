import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/sessionStore'

function initialsFor(name) {
  return name
    .replace(/^(Dr|Prof|Mr|Ms|Mrs)\.\s*/, '')
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function navClass({ isActive }) {
  return isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
}

// One entry per sheet of the course file, in workbook order. Items that
// share a route carry an ?assessment= parameter so the target page opens on
// the right assessment.
function courseFileItems(courseId) {
  const base = `/course/${courseId}`
  return [
    { label: 'Cover', to: `${base}/cover` },
    { label: 'Vision & Mission', to: `${base}/vision` },
    { label: 'PEO / PO / PSO', to: `${base}/outcomes` },
    { label: 'Course details & COs', to: base },
    { label: 'Student name list', to: `${base}/students` },
    { label: 'PT1 — mark sheet', to: `${base}/marks?assessment=PT1` },
    { label: 'PT1 — CO attainment', to: `${base}/attainment?assessment=PT1` },
    { label: 'PT1 — remedial', to: `${base}/remedial?assessment=PT1` },
    { label: 'PT2 — mark sheet', to: `${base}/marks?assessment=PT2` },
    { label: 'PT2 — CO attainment', to: `${base}/attainment?assessment=PT2` },
    { label: 'PT2 — remedial', to: `${base}/remedial?assessment=PT2` },
    { label: 'Innovative practice', to: `${base}/marks?assessment=IP1` },
    { label: 'Optional test', to: `${base}/marks?assessment=OT` },
    { label: 'Attendance', to: `${base}/attendance` },
    { label: 'Internal marks', to: `${base}/internal` },
    { label: 'SEE attainment', to: `${base}/attainment?assessment=SEE` },
    { label: 'Final attainment', to: `${base}/final` },
    { label: 'Closing report', to: `${base}/closing` },
    { label: 'FULL COURSE FILE', to: `${base}/full` },
  ]
}

export default function Layout() {
  const { faculty, signOut } = useSession()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const courseMatch = pathname.match(/^\/course\/(\d+)/)
  const courseId = courseMatch ? courseMatch[1] : null
  // NavLink ignores the query string, so course-file items are matched by
  // full path + search instead.
  const current = `${pathname}${search}`

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar__brand">Course File Portal</span>
        <div className="topbar__user">
          <span className="topbar__avatar">{initialsFor(faculty.name)}</span>
          <span className="topbar__user-name">
            {faculty.name}{' '}
            <span className="topbar__user-role">· {faculty.designation}</span>
          </span>
          <button
            type="button"
            className="topbar__signout"
            onClick={() => {
              signOut()
              navigate('/login', { replace: true })
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="sidebar">
        <p className="sidebar__label">Navigation</p>
        <div className="sidebar__nav">
          <NavLink to="/" end className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/reports" className={navClass}>
            Reports
          </NavLink>
        </div>

        {courseId && (
          <>
            <p className="sidebar__label sidebar__label--group">Course file</p>
            <ol className="sidebar__sheets">
              {courseFileItems(courseId).map((item, index) => {
                const isActive = current === item.to
                return (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className={
                        isActive ? 'sidebar__sheet sidebar__sheet--active' : 'sidebar__sheet'
                      }
                    >
                      <span className="sidebar__sheet-num">{index + 1}</span>
                      <span className="sidebar__sheet-label">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
