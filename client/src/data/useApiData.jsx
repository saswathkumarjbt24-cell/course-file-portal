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

/** The loading line. Deliberately plain -- no layout or styling changes. */
export function DataLoading() {
  return <p className="placeholder">Loading…</p>
}

/** The error line. Shows the reason so a stopped server is obvious. */
export function DataError({ error }) {
  return (
    <p className="placeholder">
      Could not load data: {error?.message ?? 'unknown error'}
    </p>
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
