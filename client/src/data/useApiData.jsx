// ---------------------------------------------------------------
// useApiData - the loading / error / loaded states every screen shows.
//
// Takes a map of { name: loaderFunction } and resolves them together, so a
// screen names the data it needs and gets an object back with exactly those
// keys. The loaders come from ./api, which decides on its own whether to hit
// the network or return the fixtures.
//
// DEFINE THE MAP AT MODULE LEVEL, not inside the component. It is the effect
// dependency; a fresh object each render would re-fetch forever.
// ---------------------------------------------------------------

import { useEffect, useState } from 'react'

export function useApiData(loaders) {
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, error: null, data: null })

    const names = Object.keys(loaders)
    Promise.all(names.map((name) => loaders[name]()))
      .then((values) => {
        if (cancelled) return
        const data = {}
        names.forEach((name, i) => {
          data[name] = values[i]
        })
        setState({ loading: false, error: null, data })
      })
      .catch((error) => {
        if (cancelled) return
        setState({ loading: false, error, data: null })
      })

    // A screen unmounted mid-flight must not set state afterwards.
    return () => {
      cancelled = true
    }
  }, [loaders])

  return state
}

// ---------------------------------------------------------------
// LOADING
//
// Blocks in the shape of what is coming, rather than the word "Loading".
// The point is that the page does not jump when the data lands: a screen
// that is about to show a table shows a table-shaped skeleton, and the
// header sits where the real header will sit.
//
// `variant` picks the shape. It is optional, and the default is the one
// most screens want -- a header, a summary panel and a table.
//
//   'page'   header + summary panel + table   (default)
//   'table'  header + table
//   'sheet'  header + a printable sheet
//   'cards'  header + a grid of cards
//   'auth'   one small centred card, for the sign-in screen, which has no
//            app shell around it and would look broken with a full page
//            of skeleton blocks
//
// aria-busy and a polite live region, so a screen reader is told the page
// is working rather than being read a wall of empty boxes.
// ---------------------------------------------------------------

function SkeletonHeader() {
  return (
    <div className="skeleton-header">
      <span className="skeleton" />
      <span className="skeleton" />
    </div>
  )
}

function SkeletonTable({ rows = 6 }) {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table__head" />
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-table__row" key={i}>
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ))}
    </div>
  )
}

export function DataLoading({ variant = 'page' }) {
  if (variant === 'auth') {
    return (
      <div className="skeleton-auth" role="status" aria-busy="true">
        <span className="sr-only">Loading…</span>
        <div className="skeleton-auth__card">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      </div>
    )
  }

  return (
    <div className="skeleton-page" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <SkeletonHeader />

      {variant === 'cards' && (
        <div className="skeleton-cards">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      )}

      {variant === 'sheet' && (
        <div className="skeleton-sheet">
          {Array.from({ length: 9 }, (_, i) => (
            <span className="skeleton" key={i} />
          ))}
        </div>
      )}

      {variant === 'page' && (
        <div className="skeleton-panel">
          {Array.from({ length: 4 }, (_, i) => (
            <span className="skeleton" key={i} />
          ))}
        </div>
      )}

      {(variant === 'page' || variant === 'table') && <SkeletonTable />}
    </div>
  )
}

/**
 * The error line. Deliberately still plain text: a skeleton says "wait",
 * and an error has to say what went wrong and stop pretending. Shows the
 * reason so a stopped server is obvious.
 */
export function DataError({ error }) {
  return (
    <p className="placeholder" role="alert">
      Could not load data: {error?.message ?? 'unknown error'}
    </p>
  )
}

/**
 * What to show where a screen has no rows.
 *
 * An empty table tells the reader nothing -- it looks the same whether the
 * data is missing, not entered yet, or filtered away. This says which it
 * is, and where to go and fix it.
 *
 * `title` is the state; `children` say what to do about it.
 */
export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {children && <p className="empty-state__body">{children}</p>}
    </div>
  )
}

/**
 * A failed save, rendered plainly under whatever it belongs to.
 *
 * A 400 carries `issues` -- one entry per offending row, built by the server
 * before it wrote anything. Anything else is a single line. Either way the
 * values the user typed are still on screen; nothing here clears them.
 */
export function SaveFeedback({ state }) {
  if (!state || (!state.error && !state.issues)) return null

  if (state.issues && state.issues.length > 0) {
    return (
      <ul className="placeholder">
        {state.issues.map((issue, i) => (
          <li key={i}>
            {describeIssue(issue)}
          </li>
        ))}
      </ul>
    )
  }

  return <p className="placeholder">Could not save: {state.error?.message ?? 'unknown error'}</p>
}

/** "Student 5, CO2: mark 25 exceeds its allocation of 20" */
export function describeIssue(issue) {
  const where = []
  if (issue.list) where.push(issue.list)
  if (issue.studentId !== undefined) where.push(`student ${issue.studentId}`)
  if (issue.coNumber !== undefined) where.push(`CO${issue.coNumber}`)
  if (issue.outcomeCode !== undefined) where.push(issue.outcomeCode)
  if (!where.length && issue.index !== undefined) where.push(`row ${issue.index + 1}`)
  return where.length ? `${where.join(', ')}: ${issue.message}` : issue.message
}
