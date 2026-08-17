import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchCourses,
  fetchInstitution,
  fetchPeoRecords,
  fetchProgramOutcomeStatements,
  fetchPsoStatements,
  isApiMode,
  savePeos,
  savePsos,
} from '../data/api'
import { DataError, DataLoading, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import './Documents.css'

const LOADERS = {
  courses: fetchCourses,
  institution: fetchInstitution,
  peoRecords: fetchPeoRecords,
  programOutcomeStatements: fetchProgramOutcomeStatements,
  psoStatements: fetchPsoStatements,
}

function StatementList({ items }) {
  return (
    <ul className="doc-list">
      {items.map((item) => (
        <li className="doc-list__item" key={item.code}>
          <span className="doc-list__code">{item.code}</span>
          <span className="doc-list__text">{item.statement}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * An editable, ordered list of coded statements -- PEOs or PSOs.
 *
 * THE CODE IS THE ORDER. Both endpoints sort by the number inside the code,
 * so the code is renumbered from the row's position on save: dropping the
 * second of three leaves 1, 2, not 1, 3. Renaming a code is a delete plus an
 * add as far as the server is concerned, which is what makes the PSO
 * still-in-use check below able to catch it.
 */
function StatementEditor({ title, prefix, items, onSave }) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState(items)
  const [savedNonce, setSavedNonce] = useState(0)
  const [saveState, runSave] = useSave()

  useEffect(() => {
    setRows(items)
    setEditing(false)
  }, [items])

  useEffect(() => {
    if (savedNonce === 0) return undefined
    const timer = setTimeout(() => setSavedNonce(0), 4000)
    return () => clearTimeout(timer)
  }, [savedNonce])

  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? `Saving replaces the whole ${title} list.`
    : 'Nothing is sent to a server yet.'

  const blankCount = rows.filter((r) => r.statement.trim() === '').length

  function handleSave() {
    const payload = rows
      .map((r) => r.statement.trim())
      .filter((statement) => statement !== '')
      .map((statement, index) => ({ code: `${prefix}${index + 1}`, statement }))

    runSave(
      () => onSave(payload),
      () => {
        setSavedNonce((n) => n + 1)
        setEditing(false)
        setRows(payload)
      },
    )
  }

  function handleCancel() {
    setRows(items)
    setEditing(false)
  }

  if (!editing) {
    return (
      <>
        <div className="doc-edit-bar">
          <button type="button" className="doc-button" onClick={() => setEditing(true)}>
            Edit {title}
          </button>
          {savedNonce > 0 ? (
            <span className="doc-status doc-status--saved">{savedLabel}</span>
          ) : (
            <span className="doc-status">{idleLabel}</span>
          )}
        </div>
        <StatementList items={items} />
        <SaveFeedback state={saveState} />
      </>
    )
  }

  return (
    <>
      <div className="doc-edit-bar">
        <button
          type="button"
          className="doc-button btn--primary"
          disabled={saveState.saving}
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
        {blankCount > 0 ? (
          <span className="doc-status doc-value--muted">
            {blankCount} empty {blankCount === 1 ? 'entry' : 'entries'} will be removed on
            save.
          </span>
        ) : (
          <span className="doc-status">{idleLabel}</span>
        )}
      </div>

      <div className="doc-edit-list">
        {rows.map((row, index) => (
          <div className="doc-edit-list__row" key={index}>
            {/* Shown from the position, because that is what the code will be. */}
            <span className="doc-edit-list__code">
              {prefix}
              {index + 1}
            </span>
            <div>
              <textarea
                className="doc-textarea"
                rows={3}
                value={row.statement}
                aria-label={`${prefix}${index + 1} statement`}
                placeholder="Leave empty to remove this entry on save"
                onChange={(event) =>
                  setRows((prev) => {
                    const next = [...prev]
                    next[index] = { ...next[index], statement: event.target.value }
                    return next
                  })
                }
              />
              {/* A textarea clips on paper; the value prints from here. */}
              <span className="doc-print-value">{row.statement}</span>
            </div>
            <div className="doc-row-actions">
              <button
                type="button"
                className="doc-mini-button doc-mini-button--danger"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="doc-add-row">
        <button
          type="button"
          className="doc-mini-button"
          onClick={() => setRows((prev) => [...prev, { code: '', statement: '' }])}
        >
          Add {prefix === 'PEO' ? 'a PEO' : 'a PSO'}
        </button>
      </div>

      {/* A rejected save wrote nothing. A PSO the articulation matrix still
          uses cannot be removed, and the server says which course holds it. */}
      <SaveFeedback state={saveState} />
    </>
  )
}

export default function Outcomes({ embedded = false }) {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="sheet" />
  if (error) return <DataError error={error} />
  return <OutcomesView embedded={embedded} {...data} />
}

function OutcomesView({
  embedded,
  courses,
  institution,
  peoRecords,
  programOutcomeStatements,
  psoStatements,
}) {
  const { id } = useParams()
  const course = courses.find((c) => c.id === Number(id))
  const department = course ? course.department : null

  // PSOs are department-specific; fall back to all of them if the course
  // department has none recorded.
  const psos = useMemo(
    () => (department ? psoStatements.filter((p) => p.department === department) : psoStatements),
    [department, psoStatements],
  )
  const shownPsos = useMemo(
    () => (psos.length > 0 ? psos : psoStatements),
    [psos, psoStatements],
  )

  // PEOs whose department is null apply to every department, which is how the
  // seeded ones are recorded. The editor saves back to whichever scope the
  // shown list came from, so it can never move a PEO between departments by
  // accident.
  const peoScope = useMemo(() => {
    const forDepartment = peoRecords.filter((p) => p.department === department)
    return forDepartment.length > 0
      ? { department, items: forDepartment }
      : { department: null, items: peoRecords.filter((p) => p.department === null) }
  }, [peoRecords, department])

  const peoItems = useMemo(
    () => peoScope.items.map((p) => ({ code: p.code, statement: p.statement })),
    [peoScope],
  )
  const psoItems = useMemo(
    () => shownPsos.map((p) => ({ code: p.code, statement: p.statement })),
    [shownPsos],
  )

  const psoDepartment = shownPsos[0]?.department ?? department

  return (
    <section className="doc-card">
      {!embedded && (
        <header className="page-header doc-noprint">
          <h1 className="page-header__title">PEO / PO / PSO</h1>
          <p className="page-header__course">
            <span className="page-header__course-code">{course.code}</span>
            <span className="page-header__course-title">{course.title}</span>
          </p>
        </header>
      )}

      <article className="doc-sheet">
        <header className="doc-head">
          <h1 className="doc-head__name">{institution.name}</h1>
          <p className="doc-head__line">
            {institution.place}
            {department ? ` — Department of ${department}` : ''}
          </p>
        </header>

        <h2 className="doc-subtitle">PEOs, POs AND PSOs</h2>

        <div className="doc-section">
          <h3 className="doc-section__title">Programme Educational Objectives</h3>
          {embedded ? (
            <StatementList items={peoItems} />
          ) : (
            <StatementEditor
              title="PEOs"
              prefix="PEO"
              items={peoItems}
              onSave={(peos) => savePeos({ department: peoScope.department, peos })}
            />
          )}
        </div>

        <div className="doc-section">
          <h3 className="doc-section__title">Programme Outcomes</h3>
          {/* Read-only, deliberately. PO1..PO12 are the NBA's own wording and
              are identical for every programme, so there is nothing here for
              one course file to edit. */}
          <p className="doc-note">
            Programme Outcomes are the standard NBA statements and are the same for every
            programme, so they are not editable here.
          </p>
          <StatementList items={programOutcomeStatements} />
        </div>

        <div className="doc-section">
          <h3 className="doc-section__title">Programme Specific Outcomes</h3>
          {embedded || !psoDepartment ? (
            <StatementList items={psoItems} />
          ) : (
            <StatementEditor
              title="PSOs"
              prefix="PSO"
              items={psoItems}
              onSave={(psos) => savePsos({ department: psoDepartment, psos })}
            />
          )}
        </div>

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
