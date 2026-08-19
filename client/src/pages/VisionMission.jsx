import { useEffect, useState } from 'react'
import {
  fetchDepartmentVisionMission,
  fetchInstitution,
  fetchInstitutionVisionMission,
  isApiMode,
  saveVisionMission,
} from '../data/api'
import { DataError, DataLoading, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import './Documents.css'
// BEGIN REMOVABLE -- edit permission scope
import { useSession } from '../context/sessionStore'
import { canEditReference, READ_ONLY_NOTE } from '../components/permissions'
// END REMOVABLE -- edit permission scope

const LOADERS = {
  departmentVisionMission: fetchDepartmentVisionMission,
  institution: fetchInstitution,
  institutionVisionMission: fetchInstitutionVisionMission,
}

function MissionList({ missions }) {
  return (
    <ul className="doc-list">
      {missions.map((text, index) => (
        <li className="doc-list__item" key={`${index}-${text}`}>
          <span className="doc-list__code">M{index + 1}</span>
          <span className="doc-list__text">{text}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * One scope's vision and ordered missions, edited together.
 *
 * The MISSION ORDER IS THE M-NUMBER: the first box is M1. Nothing here
 * carries a database id, so moving a statement up moves its number with it.
 * An empty box is removed on save rather than stored, because missions.
 * statement is NOT NULL -- there is no such thing as a blank mission.
 */
function VisionMissionEditor({ title, scope, department, vision, missions, onSaved }) {
  // BEGIN REMOVABLE -- edit permission scope
  const { faculty } = useSession()
  // END REMOVABLE -- edit permission scope
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ vision, missions })
  const [savedNonce, setSavedNonce] = useState(0)
  const [saveState, runSave] = useSave()

  useEffect(() => {
    setForm({ vision, missions })
    setEditing(false)
  }, [vision, missions])

  useEffect(() => {
    if (savedNonce === 0) return undefined
    const timer = setTimeout(() => setSavedNonce(0), 4000)
    return () => clearTimeout(timer)
  }, [savedNonce])

  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? 'Saving replaces this vision and its mission list.'
    : 'Nothing is sent to a server yet.'

  const visionEmpty = form.vision.trim() === ''

  function handleSave() {
    // Blank boxes are dropped, and the surviving order becomes M1..Mn.
    const kept = form.missions.map((m) => m.trim()).filter((m) => m !== '')
    runSave(
      () =>
        saveVisionMission({
          scope,
          department: scope === 'department' ? department : null,
          vision: form.vision.trim(),
          missions: kept,
        }),
      () => {
        setSavedNonce((n) => n + 1)
        setEditing(false)
        setForm((prev) => ({ ...prev, missions: kept }))
        if (onSaved) onSaved()
      },
    )
  }

  function handleCancel() {
    setForm({ vision, missions })
    setEditing(false)
  }

  function updateMission(index, value) {
    setForm((prev) => {
      const next = [...prev.missions]
      next[index] = value
      return { ...prev, missions: next }
    })
  }

  function addMission() {
    setForm((prev) => ({ ...prev, missions: [...prev.missions, ''] }))
  }

  function removeMission(index) {
    setForm((prev) => ({
      ...prev,
      missions: prev.missions.filter((_, i) => i !== index),
    }))
  }

  return (
    <>
      <div className="doc-edit-bar">
        {editing ? (
          <>
            <button
              type="button"
              className="doc-button btn--primary"
              disabled={visionEmpty || saveState.saving}
              onClick={handleSave}
            >
              {saveState.saving ? 'Saving…' : `Save ${title}`}
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
        ) : canEditReference(faculty) ? (
          <button type="button" className="doc-button" onClick={() => setEditing(true)}>
            Edit {title}
          </button>
        ) : (
          /* BEGIN REMOVABLE -- edit permission scope. Already hod+admin on the
             server; this only stops the screen offering a certain failure. */
          <span className="doc-status">{READ_ONLY_NOTE}</span>
          /* END REMOVABLE -- edit permission scope */
        )}

        {editing && visionEmpty ? (
          <span className="doc-status doc-value--muted">A vision statement is required.</span>
        ) : savedNonce > 0 ? (
          <span className="doc-status doc-status--saved">{savedLabel}</span>
        ) : (
          <span className="doc-status">{idleLabel}</span>
        )}
      </div>

      {editing ? (
        <>
          <div className="doc-section">
            <textarea
              className={
                visionEmpty ? 'doc-textarea doc-textarea--invalid' : 'doc-textarea'
              }
              rows={3}
              value={form.vision}
              aria-label={`Vision (${title})`}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, vision: event.target.value }))
              }
            />
            {/* A textarea clips on paper; the value prints from here. */}
            <span className="doc-print-value">{form.vision}</span>
          </div>

          <div className="doc-edit-list">
            {form.missions.map((mission, index) => (
              <div className="doc-edit-list__row" key={index}>
                <span className="doc-edit-list__code">M{index + 1}</span>
                <div>
                  <textarea
                    className="doc-textarea"
                    rows={2}
                    value={mission}
                    aria-label={`Mission M${index + 1} (${title})`}
                    placeholder="Leave empty to remove this mission on save"
                    onChange={(event) => updateMission(index, event.target.value)}
                  />
                  <span className="doc-print-value">{mission}</span>
                </div>
                <div className="doc-row-actions">
                  <button
                    type="button"
                    className="doc-mini-button doc-mini-button--danger"
                    onClick={() => removeMission(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="doc-add-row">
            <button type="button" className="doc-mini-button" onClick={addMission}>
              Add a mission
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="doc-statement">{vision}</p>
          <MissionList missions={missions} />
        </>
      )}

      {/* A rejected save wrote nothing; the typed text stays on screen. */}
      <SaveFeedback state={saveState} />
    </>
  )
}

export default function VisionMission({ embedded = false }) {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="sheet" />
  if (error) return <DataError error={error} />
  return <VisionMissionView embedded={embedded} {...data} />
}

function VisionMissionView({
  embedded,
  departmentVisionMission,
  institution,
  institutionVisionMission,
}) {
  return (
    <section className="doc-card">
      {!embedded && (
        <header className="page-header doc-noprint">
          <h1 className="page-header__title">Vision &amp; Mission</h1>
          <p className="page-header__subtitle">{`Department of ${departmentVisionMission.department}`}</p>
        </header>
      )}

      <article className="doc-sheet">
        <header className="doc-head">
          <h1 className="doc-head__name">{institution.name}</h1>
          <p className="doc-head__line">
            {institution.place} — Department of {departmentVisionMission.department}
          </p>
        </header>

        <h2 className="doc-subtitle">VISION AND MISSION</h2>

        {/* The Full Course File embeds this sheet read-only, so the editors
            appear only on the standalone page. */}
        {embedded ? (
          <>
            <div className="doc-section">
              <h3 className="doc-section__title">Vision of the Institute</h3>
              <p className="doc-statement">{institutionVisionMission.vision}</p>
            </div>

            <div className="doc-section">
              <h3 className="doc-section__title">Mission of the Institute</h3>
              <MissionList missions={institutionVisionMission.missions} />
            </div>

            <div className="doc-section">
              <h3 className="doc-section__title">
                Vision of the Department of {departmentVisionMission.department}
              </h3>
              <p className="doc-statement">{departmentVisionMission.vision}</p>
            </div>

            <div className="doc-section">
              <h3 className="doc-section__title">Mission of the Department</h3>
              <MissionList missions={departmentVisionMission.missions} />
            </div>
          </>
        ) : (
          <>
            <div className="doc-section">
              <h3 className="doc-section__title">
                Vision and Mission of the Institute
              </h3>
              <VisionMissionEditor
                title="institute vision and mission"
                scope="institution"
                department={null}
                vision={institutionVisionMission.vision}
                missions={institutionVisionMission.missions}
              />
            </div>

            <div className="doc-section">
              <h3 className="doc-section__title">
                Vision and Mission of the Department of{' '}
                {departmentVisionMission.department}
              </h3>
              <VisionMissionEditor
                title="department vision and mission"
                scope="department"
                department={departmentVisionMission.department}
                vision={departmentVisionMission.vision}
                missions={departmentVisionMission.missions}
              />
            </div>
          </>
        )}

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
          <span className="doc-status">Printing drops the navigation and buttons.</span>
        </div>
      )}
    </section>
  )
}
