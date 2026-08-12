// ---------------------------------------------------------------
// useSave - the in-flight / failed states a Save button needs.
//
// Deliberately tiny. It owns only what the screens did not already have:
// whether a request is in flight, and why the last one failed. The existing
// "Saved (mock)" confirmations keep their own state, so nothing about the
// current success feedback changes.
//
// A failed save NEVER clears the form. The hook holds no form data at all,
// so there is nothing it could discard.
// ---------------------------------------------------------------

import { useState } from 'react'

const IDLE = { saving: false, error: null, issues: null }

export function useSave() {
  const [state, setState] = useState(IDLE)

  /**
   * Run a save. Returns true on success, false on failure.
   * `onSuccess` fires only on success, so a screen's existing confirmation
   * counter is bumped only when something was really written.
   */
  async function run(save, onSuccess) {
    setState({ saving: true, error: null, issues: null })
    try {
      const result = await save()
      setState(IDLE)
      if (onSuccess) onSuccess(result)
      return true
    } catch (err) {
      // 400 -> per-row issues from the server; anything else -> a plain line.
      setState({
        saving: false,
        error: err,
        issues: Array.isArray(err.issues) ? err.issues : null,
      })
      return false
    }
  }

  return [state, run]
}
