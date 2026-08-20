import { createContext, useContext } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchAssessments,
  fetchAttainmentBands,
  fetchAttainmentConstants,
  fetchCoAllocations,
  fetchCoPoMatrix,
  fetchCoSplitValues,
  fetchCourseExitSurvey,
  // BEGIN REMOVABLE -- remedial question paper. The printed paper carries the
  // same three header rows the department's sheet does, and the academic year
  // and year/semester live only on the migration-012 offering columns.
  fetchCourseMeta,
  // END REMOVABLE -- remedial question paper
  fetchCourseNatures,
  fetchCourseOutcomes,
  fetchCourses,
  fetchInstitution,
  fetchProgramOutcomes,
  fetchProgramSpecificOutcomes,
  // BEGIN REMOVABLE -- remedial question paper
  fetchRemedialPapers,
  // END REMOVABLE -- remedial question paper
  fetchRemedialSchedule,
  fetchStudentAssessments,
  fetchStudentCoMarks,
  fetchStudents,
} from '../data/api'
import { coMarksToShow } from '../data/coMarks'
import { DataError, DataLoading, useApiData } from '../data/useApiData'
import {
  attainmentLevel,
  coPercent,
  isAchieved,
  needsRemedial,
  percentAchieved,
} from '../utils/attainment'
import {
  assessmentCoLevels,
  cieLevel,
  componentWeights,
  directLevel,
  finalLevel,
  overallOutcomeLevel,
  poLevelFromCO,
} from '../utils/finalAttainment'
import { NO_ATTAINMENT_NOTE } from './MarkEntry'
import Cover from './Cover'
import VisionMission from './VisionMission'
import Outcomes from './Outcomes'
import NameList from './NameList'
import Attendance from './Attendance'
import InternalMarks from './InternalMarks'
import './Documents.css'

const NOT_CONDUCTED = 'Not conducted / no marks entered'
const CIE_COMPONENTS = ['PT1', 'PT2', 'IP1', 'IP2']
// Kinds that feed the internal mark but not CO attainment - see MarkEntry.
const NON_ATTAINMENT_KINDS = ['OT']

const LOADERS = {
  assessments: fetchAssessments,
  attainmentBands: fetchAttainmentBands,
  attainmentConstants: fetchAttainmentConstants,
  coAllocations: fetchCoAllocations,
  coPoMatrix: fetchCoPoMatrix,
  coSplitValues: fetchCoSplitValues,
  courseExitSurvey: fetchCourseExitSurvey,
  // BEGIN REMOVABLE -- remedial question paper
  courseMeta: fetchCourseMeta,
  // END REMOVABLE -- remedial question paper
  courseNatures: fetchCourseNatures,
  courseOutcomes: fetchCourseOutcomes,
  courses: fetchCourses,
  institution: fetchInstitution,
  programOutcomes: fetchProgramOutcomes,
  programSpecificOutcomes: fetchProgramSpecificOutcomes,
  remedialSchedule: fetchRemedialSchedule,
  // BEGIN REMOVABLE -- remedial question paper
  remedialPapers: fetchRemedialPapers,
  // END REMOVABLE -- remedial question paper
  students: fetchStudents,
  studentAssessments: fetchStudentAssessments,
  studentCoMarks: fetchStudentCoMarks,
}

// This page renders eighteen sections from one data load. Rather than thread
// eighteen props through every section, the loaded bundle is put on a context
// that only this file reads. The plain (non-component) helpers below take it
// as their first argument, since they cannot use a hook.
const FileData = createContext(null)
const useFileData = () => useContext(FileData)

// ---------------------------------------------------------------
// Shared lookups. This page deliberately duplicates the table markup
// of the individual screens instead of sharing components with them -
// everything here must render read-only, with no inputs at all.
// ---------------------------------------------------------------

function assessmentOf(D, courseId, kind) {
  return D.assessments.find((a) => a.courseId === courseId && a.kind === kind) ?? null
}

function allocationOf(D, assessment) {
  return assessment
    ? D.coAllocations
        .filter((x) => x.assessmentId === assessment.id)
        .sort((a, b) => a.coNumber - b.coNumber)
    : []
}

// Per-CO marks: 'manual' assessments store them directly, 'lookup' ones
// derive them from the total through the hand-authored split table.
function coMarksFor(D, assessment, record) {
  if (!assessment || !record || record.isAbsent || record.totalObtained === null) return null
  // Prefer what the API stored; fall back to deriving. Branch on splitMode,
  // never on whether coMarks came back empty.
  return coMarksToShow({
    assessment,
    studentId: record.studentId,
    totalObtained: record.totalObtained,
    studentCoMarks: D.studentCoMarks,
    splits: D.coSplitValues,
  })
}

function rowsFor(D, assessment) {
  if (!assessment) return []
  return D.students.map((student) => {
    const record = D.studentAssessments.find(
      (r) => r.assessmentId === assessment.id && r.studentId === student.id,
    )
    const excluded = !record || record.isAbsent || record.totalObtained === null
    return {
      student,
      record: record ?? null,
      excluded,
      reason: record && record.isAbsent ? 'Absent' : 'No mark entered',
      coMarks: coMarksFor(D, assessment, record),
    }
  })
}

function hasMarks(rows) {
  return rows.some((r) => !r.excluded)
}

function formatDate(iso) {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  return `${day}-${month}-${year}`
}

function num(value, digits = 2) {
  return value === null || value === undefined ? '—' : value.toFixed(digits)
}

function Part({ number, title, children }) {
  return (
    <section className="doc-part">
      <h2 className="doc-part__title">
        {number}. {title}
      </h2>
      {children}
    </section>
  )
}

function Empty() {
  return <p className="doc-empty">{NOT_CONDUCTED}</p>
}

function Signatures({ blocks = ['Course Faculty', 'HOD'] }) {
  return (
    <div className="doc-sign">
      {blocks.map((label) => (
        <div className="doc-sign__block" key={label}>
          <div className="doc-sign__line">{label}</div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------
// 4. Course details, CO statements, CO-PO/PSO matrix
// ---------------------------------------------------------------

function SetupSection({ course, nature }) {
  const D = useFileData()
  const coNumbers = Array.from({ length: course.coCount }, (_, i) => i + 1)
  const columns = [
    ...D.programOutcomes.map((o) => ({ ...o, type: 'PO' })),
    ...D.programSpecificOutcomes.map((o) => ({ ...o, type: 'PSO' })),
  ]

  const matrix = {}
  for (const row of D.coPoMatrix) {
    if (row.courseId !== course.id) continue
    if (!matrix[row.outcomeCode]) matrix[row.outcomeCode] = {}
    matrix[row.outcomeCode][row.coNumber] = row.value
  }

  return (
    <>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <tbody>
            <tr>
              <th>Course code</th>
              <td>{course.code}</td>
              <th>Course title</th>
              <td>{course.title}</td>
            </tr>
            <tr>
              <th>Nature</th>
              <td>{nature ? nature.name : 'Unknown'}</td>
              <th>Department</th>
              <td>{course.department}</td>
            </tr>
            <tr>
              <th>Regulation</th>
              <td>{course.regulationYear ?? '—'}</td>
              <th>CO target</th>
              <td>{course.coTargetPercent.toFixed(2)}%</td>
            </tr>
            <tr>
              <th>PT1 / PT2 max</th>
              <td>
                {nature && nature.pt1Max !== null ? `${nature.pt1Max} / ${nature.pt2Max}` : '—'}
              </td>
              <th>IP max</th>
              <td>{nature && nature.ipMax !== null ? nature.ipMax : '—'}</td>
            </tr>
            <tr>
              <th>INT total</th>
              <td>{nature && nature.intTotal !== null ? nature.intTotal : '—'}</td>
              <th>SEE total</th>
              <td>{nature && nature.seeTotal !== null ? nature.seeTotal : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
        Course Outcomes
      </h3>
      <ul className="doc-list">
        {coNumbers.map((co) => {
          const outcome = D.courseOutcomes.find((o) => o.courseId === course.id && o.coNumber === co)
          return (
            <li className="doc-list__item" key={co}>
              <span className="doc-list__code">CO{co}</span>
              <span className="doc-list__text">
                {outcome ? outcome.statement : <em>Statement not recorded</em>}
              </span>
            </li>
          )
        })}
      </ul>

      <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
        CO — PO / PSO articulation matrix
      </h3>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>CO</th>
              {columns.map((col) => (
                <th key={col.code} title={col.title}>
                  {col.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coNumbers.map((co) => (
              <tr key={co}>
                <th scope="row">CO{co}</th>
                {columns.map((col) => (
                  <td key={col.code} className="doc-table__center">
                    {matrix[col.code]?.[co] ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Signatures />
    </>
  )
}

// ---------------------------------------------------------------
// Mark sheets (6, 9, 12, 13)
// ---------------------------------------------------------------

function MarkSheetSection({ courseId, kind }) {
  const D = useFileData()
  const assessment = assessmentOf(D, courseId, kind)
  const rows = rowsFor(D, assessment)
  // The optional test feeds the internal mark only, so it prints without
  // CO columns - it has no CO attainment sheet in the source workbook.
  const contributesToAttainment = !NON_ATTAINMENT_KINDS.includes(kind)
  const allocation = contributesToAttainment ? allocationOf(D, assessment) : []

  if (!assessment || !hasMarks(rows)) return <Empty />

  return (
    <>
      <p className="doc-statement">
        <strong>{kind}</strong> — maximum {assessment.maxTotal}, conducted{' '}
        {formatDate(assessment.conductedOn)}.{' '}
        {contributesToAttainment
          ? `CO allocation: ${allocation
              .map((a) => `CO${a.coNumber} ${a.marksAllocated}`)
              .join(', ')}.`
          : NO_ATTAINMENT_NOTE}
      </p>

      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th className="doc-table__num">S.No</th>
              <th>Roll Number</th>
              <th>Name</th>
              <th>Total ({assessment.maxTotal})</th>
              {allocation.map((a) => (
                <th key={a.coNumber}>
                  CO{a.coNumber} ({a.marksAllocated})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.student.id}>
                <td className="doc-table__num">{index + 1}</td>
                <td className="doc-table__reg">{row.student.regNumber}</td>
                <td>{row.student.name}</td>
                <td className="doc-table__value">
                  {row.excluded ? (
                    <span className="doc-table__missing">
                      {row.record && row.record.isAbsent ? 'Absent' : '-'}
                    </span>
                  ) : (
                    row.record.totalObtained
                  )}
                </td>
                {allocation.map((a) => (
                  <td key={a.coNumber} className="doc-table__value">
                    {row.coMarks && row.coMarks[a.coNumber] !== undefined ? (
                      row.coMarks[a.coNumber]
                    ) : (
                      <span className="doc-table__missing">-</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Signatures />
    </>
  )
}

// ---------------------------------------------------------------
// CO attainment (7, 10, 16)
// ---------------------------------------------------------------

function AttainmentSection({ courseId, kind, targetPercent }) {
  const D = useFileData()
  const assessment = assessmentOf(D, courseId, kind)
  const allocation = allocationOf(D, assessment)
  const rows = rowsFor(D, assessment)
  const attended = rows.filter((r) => !r.excluded)

  if (!assessment || attended.length === 0) return <Empty />

  const summary = allocation.map((alloc) => {
    let achieved = 0
    let remedial = 0
    for (const row of attended) {
      const obtained = row.coMarks ? row.coMarks[alloc.coNumber] : null
      const percent = coPercent(obtained, alloc.marksAllocated)
      if (isAchieved(percent, targetPercent)) achieved += 1
      if (needsRemedial(percent, targetPercent)) remedial += 1
    }
    const percent = percentAchieved(achieved, attended.length)
    return {
      coNumber: alloc.coNumber,
      marksAllocated: alloc.marksAllocated,
      achieved,
      remedial,
      percent,
      level: attainmentLevel(percent, D.attainmentBands),
    }
  })

  return (
    <>
      <p className="doc-statement">
        Target {targetPercent.toFixed(2)}%. {attended.length} of {D.students.length} students
        attended; absent students are excluded from every count.
      </p>

      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th className="doc-table__num">S.No</th>
              <th>Roll Number</th>
              <th>Name</th>
              {allocation.map((a) => (
                <th key={a.coNumber}>CO{a.coNumber}</th>
              ))}
              {allocation.map((a) => (
                <th key={`r-${a.coNumber}`}>CO{a.coNumber} remedial</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.student.id}>
                <td className="doc-table__num">{index + 1}</td>
                <td className="doc-table__reg">{row.student.regNumber}</td>
                <td>{row.student.name}</td>
                {row.excluded ? (
                  <td className="doc-table__missing" colSpan={allocation.length * 2}>
                    {row.reason} — excluded from attainment
                  </td>
                ) : (
                  <>
                    {allocation.map((a) => {
                      const obtained = row.coMarks ? row.coMarks[a.coNumber] : null
                      const percent = coPercent(obtained, a.marksAllocated)
                      return (
                        <td key={a.coNumber} className="doc-table__value">
                          {obtained === null || obtained === undefined
                            ? '—'
                            : `${obtained}/${a.marksAllocated} (${percent.toFixed(1)}%)`}
                        </td>
                      )
                    })}
                    {allocation.map((a) => {
                      const obtained = row.coMarks ? row.coMarks[a.coNumber] : null
                      const percent = coPercent(obtained, a.marksAllocated)
                      return (
                        <td key={`r-${a.coNumber}`} className="doc-table__center">
                          {needsRemedial(percent, targetPercent) ? 'Yes' : 'No'}
                        </td>
                      )
                    })}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc-table-wrap" style={{ marginTop: '1.25rem' }}>
        <table className="doc-table">
          <thead>
            <tr>
              <th>CO</th>
              <th>Marks allocated</th>
              <th>No. achieved</th>
              <th>% achieved</th>
              <th>Attainment level</th>
              <th>No. needing remedial</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((co) => (
              <tr key={co.coNumber}>
                <th scope="row">CO{co.coNumber}</th>
                <td className="doc-table__value">{co.marksAllocated}</td>
                <td className="doc-table__value">{co.achieved}</td>
                <td className="doc-table__value">{num(co.percent)}%</td>
                <td className="doc-table__center">{co.level ?? '—'}</td>
                <td className="doc-table__value">{co.remedial}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Signatures />
    </>
  )
}

// ---------------------------------------------------------------
// Remedial (8, 11) - name list, circular, attendance, report
// ---------------------------------------------------------------

// BEGIN REMOVABLE -- remedial question paper
// ---------------------------------------------------------------
// The remedial assessment question paper, printed between the circular and
// the attendance report, one sheet per class that HAS a paper.
//
// A class with no paper prints NOTHING. An empty four-column table would
// read as a paper that was set and left blank, which is a different fact
// from a paper that was never written.
//
// UNLETTERED ON PURPOSE. The four existing sub-blocks are lettered (a) to
// (d) and this sits between (b) and (c); relabelling them would change
// sheets that are already filed under those letters.
//
// A question with no CO of its own carries its class's CO, which is what
// NULL means in remedial_questions.co_number.
// ---------------------------------------------------------------

function QuestionPapers({ course, kind }) {
  const D = useFileData()
  const meta = D.courseMeta.find((m) => m.courseId === course.id) ?? null
  const papers = D.remedialPapers
    .filter((p) => p.courseId === course.id && p.assessmentKind === kind && p.hasPaper)
    .sort((a, b) => a.coNumber - b.coNumber)

  if (papers.length === 0) return null

  return (
    <>
      {papers.map((paper) => (
        <div key={paper.coNumber}>
          <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
            Assessment question paper - CO{paper.coNumber}
          </h3>

          <div className="doc-table-wrap">
            <table className="doc-table">
              <tbody>
                <tr>
                  <th>Academic year</th>
                  <td>{meta?.academicYear ?? '—'}</td>
                  <th>Year &amp; semester</th>
                  <td>
                    {meta?.yearOfStudy ?? '—'} / {meta?.semester ?? '—'}
                  </td>
                </tr>
                <tr>
                  <th>Course code &amp; title</th>
                  <td>
                    {course.code} - {course.title}
                  </td>
                  <th>Maximum marks</th>
                  <td>
                    {paper.totalMarks === null ? '—' : paper.totalMarks}
                    {paper.durationMinutes === null
                      ? ''
                      : ` / ${paper.durationMinutes} minutes`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {paper.questions.length === 0 ? (
            <p className="doc-empty">No questions have been entered on this paper.</p>
          ) : (
            <div className="doc-table-wrap">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th className="doc-table__num">Q. No.</th>
                    <th>Questions</th>
                    <th>Marks allotted</th>
                    <th>CO</th>
                  </tr>
                </thead>
                <tbody>
                  {paper.questions.map((q) => (
                    <tr key={q.qNo}>
                      <td className="doc-table__num">{q.qNo}</td>
                      <td>{q.text}</td>
                      <td className="doc-table__value">{q.marksAllotted}</td>
                      <td className="doc-table__center">
                        CO{q.coNumber === null ? paper.coNumber : q.coNumber}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Signatures blocks={['Signature of Faculty']} />
        </div>
      ))}
    </>
  )
}
// END REMOVABLE -- remedial question paper

function RemedialSection({ course, kind, targetPercent }) {
  const D = useFileData()
  const assessment = assessmentOf(D, course.id, kind)
  const allocation = allocationOf(D, assessment)
  const rows = rowsFor(D, assessment)
  const attended = rows.filter((r) => !r.excluded)

  if (!assessment || attended.length === 0) return <Empty />

  const evaluated = attended.map((row) => {
    const cos = {}
    for (const alloc of allocation) {
      const obtained = row.coMarks ? row.coMarks[alloc.coNumber] : null
      const percent = coPercent(obtained, alloc.marksAllocated)
      cos[alloc.coNumber] = {
        obtained,
        marksAllocated: alloc.marksAllocated,
        remedial: needsRemedial(percent, targetPercent),
      }
    }
    return {
      ...row,
      cos,
      anyRemedial: allocation.some((alloc) => cos[alloc.coNumber].remedial),
    }
  })

  const list = evaluated.filter((e) => e.anyRemedial)
  const schedule =
    D.remedialSchedule.find((r) => r.courseId === course.id && r.assessmentKind === kind) ?? null
  const classes = schedule ? schedule.classes : []

  return (
    <>
      <h3 className="doc-section__title">(a) Name list</h3>
      {list.length === 0 ? (
        <p className="doc-empty">NIL — every attended student reached the target.</p>
      ) : (
        <>
          <p className="doc-statement">
            {list.length} of {attended.length} attended students need remedial in at least one CO.
          </p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th className="doc-table__num">S.No</th>
                  <th>Roll Number</th>
                  <th>Name</th>
                  {allocation.map((a) => (
                    <th key={a.coNumber}>CO{a.coNumber}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((row, index) => (
                  <tr key={row.student.id}>
                    <td className="doc-table__num">{index + 1}</td>
                    <td className="doc-table__reg">{row.student.regNumber}</td>
                    <td>{row.student.name}</td>
                    {allocation.map((a) => (
                      <td key={a.coNumber} className="doc-table__center">
                        {row.cos[a.coNumber].remedial ? 'Yes' : 'No'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
        (b) Circular
      </h3>
      <p className="doc-statement">
        The students listed above have not attained the Course Outcome target of{' '}
        {targetPercent.toFixed(2)}% in {kind} of {course.code} — {course.title}. Remedial classes
        are arranged for the Course Outcomes concerned as detailed below. All the students named
        in the list are instructed to attend the classes without fail.
      </p>
      {classes.length === 0 ? (
        <p className="doc-empty">No remedial classes have been scheduled for {kind}.</p>
      ) : (
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th className="doc-table__num">S.No</th>
                <th>Course Outcome</th>
                <th>Date</th>
                <th>Timing</th>
                <th>Venue</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls, index) => (
                <tr key={cls.coNumber}>
                  <td className="doc-table__num">{index + 1}</td>
                  <td>CO{cls.coNumber}</td>
                  <td>{formatDate(cls.date)}</td>
                  <td>{cls.timing}</td>
                  <td>{schedule.venue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* BEGIN REMOVABLE -- remedial question paper */}
      <QuestionPapers course={course} kind={kind} />
      {/* END REMOVABLE -- remedial question paper */}

      <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
        (c) Attendance
      </h3>
      {list.length === 0 || classes.length === 0 ? (
        <p className="doc-empty">NIL — no remedial classes required.</p>
      ) : (
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th className="doc-table__num">S.No</th>
                <th>Roll Number</th>
                <th>Name</th>
                {classes.map((cls) => (
                  <th key={cls.coNumber}>
                    CO{cls.coNumber} — {formatDate(cls.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((row, index) => (
                <tr key={row.student.id}>
                  <td className="doc-table__num">{index + 1}</td>
                  <td className="doc-table__reg">{row.student.regNumber}</td>
                  <td>{row.student.name}</td>
                  {classes.map((cls) => (
                    <td key={cls.coNumber} className="doc-table__center">
                      {row.cos[cls.coNumber] && row.cos[cls.coNumber].remedial ? 'PR' : '--'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
        (d) After-remedial assessment report
      </h3>
      {list.length === 0 ? (
        <p className="doc-empty">NIL — no re-assessment required.</p>
      ) : (
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th className="doc-table__num">S.No</th>
                <th>Roll Number</th>
                <th>Name</th>
                {allocation.map((a) => [
                  <th key={`o-${a.coNumber}`}>CO{a.coNumber} original</th>,
                  <th key={`a-${a.coNumber}`}>CO{a.coNumber} after remedial</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {list.map((row, index) => (
                <tr key={row.student.id}>
                  <td className="doc-table__num">{index + 1}</td>
                  <td className="doc-table__reg">{row.student.regNumber}</td>
                  <td>{row.student.name}</td>
                  {allocation.map((a) => {
                    const co = row.cos[a.coNumber]
                    if (!co.remedial) {
                      return [
                        <td key={`o-${a.coNumber}`} className="doc-table__center doc-table__missing">
                          --
                        </td>,
                        <td key={`a-${a.coNumber}`} className="doc-table__center doc-table__missing">
                          --
                        </td>,
                      ]
                    }
                    return [
                      <td key={`o-${a.coNumber}`} className="doc-table__value">
                        {co.obtained} / {co.marksAllocated}
                      </td>,
                      <td key={`a-${a.coNumber}`} className="doc-table__center">
                        &nbsp;
                      </td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Signatures />
    </>
  )
}

// ---------------------------------------------------------------
// 17. Final attainment - all four tables
// ---------------------------------------------------------------

function FinalSection({ course, nature, targetPercent }) {
  const D = useFileData()
  const coNumbers = Array.from({ length: course.coCount }, (_, i) => i + 1)
  const weights = componentWeights(nature)
  const columns = [
    ...D.programOutcomes.map((o) => ({ ...o, type: 'PO' })),
    ...D.programSpecificOutcomes.map((o) => ({ ...o, type: 'PSO' })),
  ]

  const levelsByKind = {}
  for (const kind of [...CIE_COMPONENTS, 'SEE']) {
    const assessment = assessmentOf(D, course.id, kind)
    levelsByKind[kind] = assessmentCoLevels({
      assessment,
      allocation: allocationOf(D, assessment),
      records: assessment
        ? D.studentAssessments.filter((r) => r.assessmentId === assessment.id)
        : [],
      students: D.students,
      targetPercent,
      bands: D.attainmentBands,
      studentCoMarks: D.studentCoMarks,
      splitValues: D.coSplitValues,
    })
  }

  const perCo = {}
  for (const co of coNumbers) {
    const componentLevels = {}
    for (const kind of CIE_COMPONENTS) componentLevels[kind] = levelsByKind[kind]?.[co] ?? null
    const cie = cieLevel(componentLevels, weights)
    const see = levelsByKind.SEE?.[co] ?? null
    const direct = directLevel(cie, see, D.attainmentConstants)
    const survey =
      D.courseExitSurvey.find((s) => s.courseId === course.id && s.coNumber === co)?.value ?? null
    perCo[co] = {
      componentLevels,
      cie,
      see,
      direct,
      survey,
      final: finalLevel(direct, survey, D.attainmentConstants),
    }
  }

  const matrix = {}
  for (const row of D.coPoMatrix) {
    if (row.courseId !== course.id) continue
    if (!matrix[row.outcomeCode]) matrix[row.outcomeCode] = {}
    matrix[row.outcomeCode][row.coNumber] = row.value
  }

  const finalLevels = {}
  for (const co of coNumbers) finalLevels[co] = perCo[co].final

  return (
    <>
      <h3 className="doc-section__title">(a) Direct assessment</h3>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Weight</th>
              {coNumbers.map((co) => (
                <th key={co}>CO{co}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CIE_COMPONENTS.map((kind) => (
              <tr key={kind}>
                <th scope="row">{kind}</th>
                <td className="doc-table__value">
                  {weights[kind] === null ? '—' : weights[kind].toFixed(2)}
                </td>
                {coNumbers.map((co) => (
                  <td key={co} className="doc-table__value">
                    {num(perCo[co].componentLevels[kind])}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">CIE</th>
              <td className="doc-table__value">—</td>
              {coNumbers.map((co) => (
                <td key={co} className="doc-table__value">
                  {num(perCo[co].cie)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">SEE</th>
              <td className="doc-table__value">—</td>
              {coNumbers.map((co) => (
                <td key={co} className="doc-table__value">
                  {num(perCo[co].see)}
                </td>
              ))}
            </tr>
            <tr className="doc-row--total">
              <th scope="row">
                CO attainment ({(D.attainmentConstants.cieWeight * 100).toFixed(0)}% CIE +{' '}
                {(D.attainmentConstants.seeWeight * 100).toFixed(0)}% SEE)
              </th>
              <td className="doc-table__value">—</td>
              {coNumbers.map((co) => (
                <td key={co} className="doc-table__value">
                  {num(perCo[co].direct)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
        (b) Indirect assessment and final CO attainment
      </h3>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Measure</th>
              {coNumbers.map((co) => (
                <th key={co}>CO{co}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Course Exit Survey</th>
              {coNumbers.map((co) => (
                <td key={co} className="doc-table__value">
                  {num(perCo[co].survey)}
                </td>
              ))}
            </tr>
            <tr className="doc-row--total">
              <th scope="row">
                Final CO attainment ({(D.attainmentConstants.directWeight * 100).toFixed(0)}% direct +{' '}
                {(D.attainmentConstants.surveyWeight * 100).toFixed(0)}% survey)
              </th>
              {coNumbers.map((co) => (
                <td key={co} className="doc-table__value">
                  {num(perCo[co].final)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
        (c) CO — PO / PSO articulation matrix
      </h3>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>CO</th>
              {columns.map((col) => (
                <th key={col.code} title={col.title}>
                  {col.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coNumbers.map((co) => (
              <tr key={co}>
                <th scope="row">CO{co}</th>
                {columns.map((col) => (
                  <td key={col.code} className="doc-table__center">
                    {matrix[col.code]?.[co] ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
        (d) PO / PSO attainment
      </h3>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>CO</th>
              <th>Final level</th>
              {columns.map((col) => (
                <th key={col.code} title={col.title}>
                  {col.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coNumbers.map((co) => (
              <tr key={co}>
                <th scope="row">CO{co}</th>
                <td className="doc-table__value">{num(perCo[co].final)}</td>
                {columns.map((col) => {
                  const value = poLevelFromCO(perCo[co].final, matrix[col.code]?.[co])
                  return (
                    <td key={col.code} className="doc-table__value">
                      {value === null ? '-' : value.toFixed(2)}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="doc-row--total">
              <th scope="row">Overall PO / PSO level</th>
              <td className="doc-table__value">—</td>
              {columns.map((col) => {
                const value = overallOutcomeLevel(finalLevels, matrix[col.code] ?? {})
                return (
                  <td key={col.code} className="doc-table__value">
                    {value === null ? '-' : value.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <Signatures />
    </>
  )
}

// ---------------------------------------------------------------
// 18. Closing report
// ---------------------------------------------------------------

function ClosingSection({ course, nature, targetPercent }) {
  const D = useFileData()
  const coNumbers = Array.from({ length: course.coCount }, (_, i) => i + 1)
  const weights = componentWeights(nature)

  const levelsByKind = {}
  for (const kind of [...CIE_COMPONENTS, 'SEE']) {
    const assessment = assessmentOf(D, course.id, kind)
    levelsByKind[kind] = assessmentCoLevels({
      assessment,
      allocation: allocationOf(D, assessment),
      records: assessment
        ? D.studentAssessments.filter((r) => r.assessmentId === assessment.id)
        : [],
      students: D.students,
      targetPercent,
      bands: D.attainmentBands,
      studentCoMarks: D.studentCoMarks,
      splitValues: D.coSplitValues,
    })
  }

  const finalByCo = {}
  for (const co of coNumbers) {
    const componentLevels = {}
    for (const kind of CIE_COMPONENTS) componentLevels[kind] = levelsByKind[kind]?.[co] ?? null
    const direct = directLevel(
      cieLevel(componentLevels, weights),
      levelsByKind.SEE?.[co] ?? null,
      D.attainmentConstants,
    )
    const survey =
      D.courseExitSurvey.find((s) => s.courseId === course.id && s.coNumber === co)?.value ?? null
    finalByCo[co] = finalLevel(direct, survey, D.attainmentConstants)
  }

  const stages = [
    { label: 'CO attainment after PT1', values: levelsByKind.PT1 },
    { label: 'CO attainment after PT2', values: levelsByKind.PT2 },
    { label: 'CO attainment after SEE', values: levelsByKind.SEE },
  ]

  return (
    <>
      <p className="doc-statement">
        <strong>Course:</strong> {course.code} — {course.title} (
        {nature ? nature.name : 'unknown nature'}), CO target {targetPercent.toFixed(2)}%.
      </p>

      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Stage</th>
              {coNumbers.map((co) => (
                <th key={co}>CO{co}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.label}>
                <th scope="row">{stage.label}</th>
                {coNumbers.map((co) => (
                  <td key={co} className="doc-table__value">
                    {num(stage.values?.[co] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="doc-row--total">
              <th scope="row">Final CO attainment level</th>
              {coNumbers.map((co) => (
                <td key={co} className="doc-table__value">
                  {num(finalByCo[co])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="doc-section__title" style={{ marginTop: '1.5rem' }}>
        Action taken to improve attainment for the next year
      </h3>
      <ol className="doc-list">
        {[1, 2, 3].map((n) => (
          <li className="doc-list__item" key={n}>
            <span className="doc-list__code">{n}.</span>
            <span className="doc-blank-line" />
          </li>
        ))}
      </ol>

      <Signatures />
    </>
  )
}

// ---------------------------------------------------------------
// The page
// ---------------------------------------------------------------

export default function FullCourseFile() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="sheet" />
  if (error) return <DataError error={error} />
  return (
    <FileData.Provider value={data}>
      <FullCourseFileView />
    </FileData.Provider>
  )
}

function FullCourseFileView() {
  const D = useFileData()
  const { id } = useParams()
  const courseId = Number(id)
  const course = D.courses.find((c) => c.id === courseId)
  const nature = course ? D.courseNatures.find((n) => n.id === course.natureId) : null

  if (!course) {
    return <div className="placeholder">No such course in the current data.</div>
  }

  const target = course.coTargetPercent

  return (
    <>
      <div className="doc-actions doc-noprint">
        <button type="button" className="doc-button" onClick={() => window.print()}>
          Print full course file
        </button>
        <span className="doc-status">
          {D.institution.name} — {course.code} course file, 18 sections, read-only.
        </span>
      </div>

      <Part number={1} title="Cover">
        <Cover embedded />
      </Part>

      <Part number={2} title="Vision & Mission">
        <VisionMission embedded />
      </Part>

      <Part number={3} title="PEO / PO / PSO">
        <Outcomes embedded />
      </Part>

      <Part number={4} title="Course details, CO statements, CO-PO/PSO matrix">
        <SetupSection course={course} nature={nature} />
      </Part>

      <Part number={5} title="Student name list">
        <NameList embedded />
      </Part>

      <Part number={6} title="PT1 mark sheet">
        <MarkSheetSection courseId={courseId} kind="PT1" />
      </Part>

      <Part number={7} title="PT1 CO attainment">
        <AttainmentSection courseId={courseId} kind="PT1" targetPercent={target} />
      </Part>

      <Part number={8} title="PT1 remedial">
        <RemedialSection course={course} kind="PT1" targetPercent={target} />
      </Part>

      <Part number={9} title="PT2 mark sheet">
        <MarkSheetSection courseId={courseId} kind="PT2" />
      </Part>

      <Part number={10} title="PT2 CO attainment">
        <AttainmentSection courseId={courseId} kind="PT2" targetPercent={target} />
      </Part>

      <Part number={11} title="PT2 remedial">
        <RemedialSection course={course} kind="PT2" targetPercent={target} />
      </Part>

      <Part number={12} title="Innovative practice marks">
        <MarkSheetSection courseId={courseId} kind="IP1" />
        <div style={{ height: '1.25rem' }} />
        <MarkSheetSection courseId={courseId} kind="IP2" />
      </Part>

      <Part number={13} title="Optional test marks">
        <MarkSheetSection courseId={courseId} kind="OT" />
      </Part>

      <Part number={14} title="Attendance">
        <Attendance embedded />
      </Part>

      <Part number={15} title="Internal marks">
        <InternalMarks embedded />
      </Part>

      <Part number={16} title="SEE CO attainment">
        <AttainmentSection courseId={courseId} kind="SEE" targetPercent={target} />
      </Part>

      <Part number={17} title="Final attainment">
        <FinalSection course={course} nature={nature} targetPercent={target} />
      </Part>

      <Part number={18} title="Closing report">
        <ClosingSection course={course} nature={nature} targetPercent={target} />
      </Part>
    </>
  )
}
