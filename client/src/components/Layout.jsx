import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { fetchCourses, fetchInstitution } from '../data/api'
import { useApiData } from '../data/useApiData'
import { useSession } from '../context/sessionStore'
import './Layout.css'

// Chrome data only: the institution name and the course being worked on.
// Loaded WITHOUT blocking - the shell renders immediately and the labels fill
// in, so navigation never flashes a spinner over the whole app.
const CHROME_LOADERS = { institution: fetchInstitution, courses: fetchCourses }

const GROUP_STORAGE_KEY = 'cfp.sidebar.groups'

// One entry per sheet of the course file, in workbook order. Items that share
// a route carry an ?assessment= parameter so the target page opens on the
// right assessment.
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

// Sheet numbers are 1-based and inclusive, matching the numbers faculty see.
// The file's real structure, not an arbitrary split.
const GROUPS = [
  { id: 'setup', title: 'Course setup', from: 1, to: 5 },
  { id: 'pt1', title: 'Periodical Test I', from: 6, to: 8 },
  { id: 'pt2', title: 'Periodical Test II', from: 9, to: 11 },
  { id: 'other', title: 'Other assessments', from: 12, to: 13 },
  { id: 'records', title: 'Records', from: 14, to: 16 },
  { id: 'closing', title: 'Closing', from: 17, to: 19 },
]

/** Split a sidebar target into the parts that decide whether it is active. */
function targetOf(to) {
  const [path, query = ''] = to.split('?')
  return { path, assessment: new URLSearchParams(query).get('assessment') }
}

function readGroupState() {
  try {
    const raw = window.sessionStorage.getItem(GROUP_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    // Keep only known group ids holding booleans, so a stale or hand-edited
    // value cannot put the sidebar into a strange state.
    const clean = {}
    for (const group of GROUPS) {
      if (typeof parsed[group.id] === 'boolean') clean[group.id] = parsed[group.id]
    }
    return clean
  } catch {
    return {}
  }
}

function writeGroupState(state) {
  try {
    window.sessionStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage refused: the groups still work, they just forget on reload.
  }
}

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

function Chevron({ open }) {
  return (
    <svg
      className={open ? 'sidebar__chevron sidebar__chevron--open' : 'sidebar__chevron'}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 2.5 7.5 6 4 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Layout() {
  const { faculty, signOut } = useSession()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  const { data: chrome } = useApiData(CHROME_LOADERS)

  const courseMatch = pathname.match(/^\/course\/(\d+)/)
  const courseId = courseMatch ? courseMatch[1] : null

  const sheets = useMemo(() => (courseId ? courseFileItems(courseId) : []), [courseId])

  // WHICH SHEET IS ACTIVE
  //   Sheets 6, 9, 12 and 13 all point at /marks and are told apart only by
  //   ?assessment=. NavLink ignores the query string entirely, so matching is
  //   done here on path + that one parameter.
  const activeIndex = useMemo(() => {
    if (sheets.length === 0) return -1
    const assessment = new URLSearchParams(search).get('assessment')

    const exact = sheets.findIndex((sheet) => {
      const target = targetOf(sheet.to)
      return target.path === pathname && target.assessment === assessment
    })
    if (exact !== -1) return exact

    // Landed on a shared route with no ?assessment=, or one we do not list.
    // Fall back to the first sheet on that path so something is still
    // highlighted and its group opens, rather than the sidebar going blank.
    return sheets.findIndex((sheet) => targetOf(sheet.to).path === pathname)
  }, [sheets, pathname, search])

  const activeGroupId = useMemo(() => {
    if (activeIndex === -1) return null
    const sheetNumber = activeIndex + 1
    const group = GROUPS.find((g) => sheetNumber >= g.from && sheetNumber <= g.to)
    return group ? group.id : null
  }, [activeIndex])

  // ---------------- Collapsible groups ----------------
  const [groupState, setGroupState] = useState(readGroupState)

  useEffect(() => {
    writeGroupState(groupState)
  }, [groupState])

  // Navigating into a group that the user had explicitly collapsed must not
  // hide the sheet they just opened. Re-open it, once, on arrival.
  useEffect(() => {
    if (!activeGroupId) return
    setGroupState((prev) =>
      prev[activeGroupId] === false ? { ...prev, [activeGroupId]: true } : prev,
    )
  }, [activeGroupId])

  // Default: only the group holding the active sheet is open. An explicit
  // toggle is remembered and wins over that default.
  const isGroupOpen = (id) => groupState[id] ?? id === activeGroupId

  function toggleGroup(id) {
    setGroupState((prev) => ({ ...prev, [id]: !(prev[id] ?? id === activeGroupId) }))
  }

  // ---------------- Narrow-screen navigation ----------------
  const [navOpen, setNavOpen] = useState(false)

  // Close the overlay whenever the route changes, so tapping a sheet takes
  // you to it rather than leaving the menu covering it.
  useEffect(() => {
    setNavOpen(false)
  }, [pathname, search])

  useEffect(() => {
    if (!navOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen])

  // ---------------- Faculty menu ----------------
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const institutionName = chrome?.institution?.name ?? ''
  const course = chrome?.courses?.find((c) => String(c.id) === courseId) ?? null

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__left">
          <button
            type="button"
            className="topbar__nav-toggle"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className="topbar__nav-toggle-bars" aria-hidden="true" />
            <span className="sr-only">{navOpen ? 'Close navigation' : 'Open navigation'}</span>
          </button>

          <div className="topbar__identity">
            <span className="topbar__product">Course File Portal</span>
            {institutionName && <span className="topbar__institution">{institutionName}</span>}
          </div>
        </div>

        {course && (
          <div className="topbar__context">
            <span className="topbar__context-code">{course.code}</span>
            <span className="topbar__context-title">{course.title}</span>
          </div>
        )}

        <div className="topbar__user" ref={menuRef}>
          <button
            type="button"
            className="topbar__user-button"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="topbar__avatar">{initialsFor(faculty.name)}</span>
            <span className="topbar__user-name">{faculty.name}</span>
            <Chevron open={menuOpen} />
          </button>

          {menuOpen && (
            <div className="topbar__menu" role="menu">
              <p className="topbar__menu-name">{faculty.name}</p>
              <p className="topbar__menu-line">{faculty.email}</p>
              <p className="topbar__menu-line">
                {faculty.designation} · {faculty.department}
              </p>
              <button
                type="button"
                className="topbar__menu-action"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  signOut()
                  navigate('/login', { replace: true })
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Backdrop only exists while the narrow-screen overlay is open. */}
      {navOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}

      <nav
        id="app-sidebar"
        className={navOpen ? 'sidebar sidebar--open' : 'sidebar'}
        aria-label="Course file navigation"
      >
        <div className="sidebar__scroll">
          <p className="sidebar__heading">Navigation</p>
          <div className="sidebar__nav">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/reports" className={navClass}>
              Reports
            </NavLink>
          </div>

          {courseId && (
            <div className="sidebar__file">
              <p className="sidebar__heading sidebar__heading--file">
                Course file
                {course && <span className="sidebar__heading-code">{course.code}</span>}
              </p>

              {GROUPS.map((group) => {
                const open = isGroupOpen(group.id)
                const items = sheets.slice(group.from - 1, group.to)
                const holdsActive = group.id === activeGroupId

                return (
                  <section className="sidebar__group" key={group.id}>
                    <h2 className="sidebar__group-title">
                      <button
                        type="button"
                        className={
                          holdsActive
                            ? 'sidebar__group-toggle sidebar__group-toggle--current'
                            : 'sidebar__group-toggle'
                        }
                        aria-expanded={open}
                        aria-controls={`sidebar-group-${group.id}`}
                        onClick={() => toggleGroup(group.id)}
                      >
                        <Chevron open={open} />
                        <span className="sidebar__group-label">{group.title}</span>
                        <span className="sidebar__group-range">
                          {group.from}–{group.to}
                        </span>
                      </button>
                    </h2>

                    {open && (
                      <ol
                        className="sidebar__sheets"
                        id={`sidebar-group-${group.id}`}
                        start={group.from}
                      >
                        {items.map((item, offset) => {
                          const number = group.from + offset
                          const isActive = number - 1 === activeIndex
                          return (
                            <li key={item.label}>
                              <Link
                                to={item.to}
                                aria-current={isActive ? 'page' : undefined}
                                className={
                                  isActive
                                    ? 'sidebar__sheet sidebar__sheet--active'
                                    : 'sidebar__sheet'
                                }
                              >
                                <span className="sidebar__sheet-num">{number}</span>
                                <span className="sidebar__sheet-label">{item.label}</span>
                              </Link>
                            </li>
                          )
                        })}
                      </ol>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
