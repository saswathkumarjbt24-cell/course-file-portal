// ---------------------------------------------------------------
// BEGIN REMOVABLE -- Activity screen
//
// Who has signed in to the portal, and who never has.
//
// READ-ONLY. There is no control on this screen that changes anything, and
// none should be added: login_events is an append-only record of who reached
// the portal and when. A screen that could edit or clear it would make it
// worthless as a record while still looking like one.
//
// WHAT THIS SCREEN MUST NOT BE READ AS
//   Login tracking was switched on by migration 018 and nothing before that
//   was recorded. An account in "never signed in" has no sign-in ON RECORD --
//   it has NOT been shown to be unused. The line under that table says so, and
//   it is not decoration: the obvious use of this screen is deciding which
//   accounts to close, and that decision would be wrong if a zero were read as
//   proof.
//
// ADMIN ONLY, AND GUARDED TWICE, like the Users, Courses and Allocations
// screens. The sidebar hides the link; this file refuses the screen; the API
// answers 403 regardless of what the browser drew.
//
// NO NEW STYLES. Sections come from RiskReport.css, the table from the same,
// the toolbar and notes from Users.css. Nothing here is a new table style.
//
// Delete this file, the route in App.jsx, the sidebar entry in Layout.jsx and
// fetchActivity in data/api.js to remove the feature.
// ---------------------------------------------------------------

import { fetchActivity } from '../data/api'
import {
  DataError,
  DataLoading,
  EmptyState,
  useApiData,
} from '../data/useApiData'
import { useSession } from '../context/sessionStore'
import './RiskReport.css'
import './Users.css'

// Module level, not rebuilt per render: it is useApiData's effect dependency.
const LOADERS = { activity: fetchActivity }

/** A value the database has not recorded. A blank cell reads as a fault. */
function absent(text) {
  return <span className="risk-table__muted">{text}</span>
}

export default function Activity() {
  const { faculty } = useSession()

  // ROUTE GUARD. The sidebar hides the link, but a URL can still be typed.
  if (!faculty || faculty.role !== 'admin') {
    return (
      <>
        <header className="page-header">
          <h1 className="page-header__title">Activity</h1>
        </header>
        <div className="placeholder" role="alert">
          Viewing portal activity needs the admin role.
          {faculty?.role ? ` Your account is '${faculty.role}'.` : ''} Ask an
          administrator if you need this information.
        </div>
      </>
    )
  }

  return <ActivityLoader />
}

function ActivityLoader() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="table" />
  if (error) return <DataError error={error} />
  return (
    <ActivityView
      signIns={data.activity.signIns}
      neverSignedIn={data.activity.neverSignedIn}
    />
  )
}

function ActivityView({ signIns, neverSignedIn }) {
  const totalSignIns = signIns.reduce((sum, r) => sum + r.signInCount, 0)

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Activity</h1>
        <p className="page-header__subtitle">
          Every recorded sign-in to the portal. Times are shown exactly as the
          database holds them, in the database server&apos;s own local time.
        </p>
      </header>

      <div className="users-toolbar">
        <span className="users-toolbar__count">
          {signIns.length} accounts have signed in · {totalSignIns} sign-ins
          recorded · {neverSignedIn.length} active accounts with none
        </span>
      </div>

      {/* ---------------- 1. Who has signed in ---------------- */}
      <section className="risk-section">
        <h2 className="risk-section__title">Signed in</h2>
        <p className="risk-section__note">
          One row per account with at least one recorded sign-in, most recently
          seen first. An account that has since been deactivated still appears
          here — it did sign in, and hiding it would rewrite the record.
        </p>

        {signIns.length === 0 ? (
          <EmptyState title="No sign-in has been recorded yet.">
            Nothing has been written to the login history since tracking was
            switched on. That is not the same as nobody having used the portal.
          </EmptyState>
        ) : (
          <div className="risk-table-wrap">
            <table className="risk-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th className="risk-table__value">Sign-ins</th>
                  <th>First seen</th>
                  <th>Last seen</th>
                  <th>Last known address</th>
                </tr>
              </thead>
              <tbody>
                {signIns.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="risk-table__muted">{row.email}</td>
                    <td>{row.department ?? absent('Not recorded')}</td>
                    <td>
                      <span
                        className={
                          row.isActive
                            ? 'users-status users-status--active'
                            : 'users-status users-status--inactive'
                        }
                      >
                        {row.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="risk-table__value">{row.signInCount}</td>
                    {/* Rendered as the characters the API sent. Never parsed
                        into a Date -- that is what would shift a midnight
                        sign-in back a day. */}
                    <td>{row.firstSeen}</td>
                    <td>{row.lastSeen}</td>
                    <td>
                      {row.lastIp ?? absent('Not known')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="risk-section__note" style={{ marginTop: 'var(--space-3)' }}>
          An address is recorded only when the request carried a forwarded
          client address. Behind a proxy it often cannot be, and “Not known”
          means exactly that — never that the sign-in came from the server.
        </p>
      </section>

      {/* ---------------- 2. Who never has ---------------- */}
      <section className="risk-section">
        <h2 className="risk-section__title">No recorded sign-in</h2>

        {/* The honest line. Not decoration: the obvious use of this table is
            deciding which accounts to close, and that call is wrong if a zero
            is read as proof the account was never used. */}
        <p className="risk-section__note">
          <strong>Recording began when login tracking was switched on.</strong>{' '}
          Nothing that happened before then was written down, so an account
          listed here has no sign-in <em>on record</em> — it has not been shown
          to be unused. Do not treat this table as evidence for closing an
          account without checking another way.
        </p>

        {neverSignedIn.length === 0 ? (
          <EmptyState title="Every active account has signed in at least once.">
            Nobody active is without a recorded sign-in.
          </EmptyState>
        ) : (
          <div className="risk-table-wrap">
            <table className="risk-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                </tr>
              </thead>
              <tbody>
                {neverSignedIn.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="risk-table__muted">{row.email}</td>
                    <td>{row.department ?? absent('Not recorded')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="risk-section__note" style={{ marginTop: 'var(--space-3)' }}>
          Active accounts only. A closed account with no sign-in is not somebody
          who has yet to use the portal, so it is not listed as one.
        </p>
      </section>
    </>
  )
}

// END REMOVABLE -- Activity screen
