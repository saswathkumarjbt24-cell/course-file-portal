// ---------------------------------------------------------------
// Which per-CO numbers to DISPLAY for one student's attempt.
//
// PREFER STORED OVER DERIVED
//   A 'lookup' assessment (PT1/PT2) derives its per-CO marks from the
//   hand-authored split table. Since the write endpoint now also PERSISTS
//   that derivation, the API may return them already stored. When it does,
//   show those; when the array is empty, derive exactly as before. The screen
//   is never blanked either way.
//
//   The two agree today, because the server derives them from the same
//   co_split_values rows. They can diverge only if that lookup table is
//   edited after marks were stored -- see the staleness note in
//   server/internalMarks.js and migration 010.
//
// THIS IS ABOUT DISPLAY ONLY
//   Behaviour still branches on splitMode, never on whether coMarks came back
//   empty. The attainment LEVEL chain in utils/finalAttainment.js is
//   untouched and still derives; nothing here changes a calculation.
//
//   MarkEntry deliberately does NOT use this helper for its live preview: it
//   must track the total the user is typing right now, not the last total the
//   server stored.
// ---------------------------------------------------------------

import { mapSplitToCOs, splitTotal } from '../utils/coSplit'
import { manualCoMarks } from '../utils/finalAttainment'

export function coMarksToShow({ assessment, studentId, totalObtained, studentCoMarks, splits }) {
  if (!assessment) return null

  // manualCoMarks returns null when the student has no rows, so this doubles
  // as the "non-empty" test.
  const stored = manualCoMarks(assessment.id, studentId, studentCoMarks)

  // 'manual' assessments have no derivation to fall back on -- the stored
  // rows ARE the data.
  if (assessment.splitMode === 'manual') return stored

  if (stored) return stored
  return mapSplitToCOs(splitTotal(totalObtained, splits), assessment.kind)
}
