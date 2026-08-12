// ---------------------------------------------------------------
// MOCK DATA - Course File Portal
//
// These objects mirror the real database schema field-for-field
// (camelCase here, snake_case in MySQL): course_natures,
// attainment_bands, courses, students, course_outcomes, assessments,
// co_allocations and student_assessments.
//
// Nothing here is real institutional data - names, reg numbers,
// course codes and marks are invented for UI development only.
// Every export below will be replaced by an API call to the Express
// backend once it is wired up. Do not build business logic that
// depends on these literal values.
// ---------------------------------------------------------------

// Mirrors table: course_natures
export const courseNatures = [
  {
    id: 1,
    name: 'Theory',
    pt1Max: 12,
    pt2Max: 12,
    ipMax: 16,
    intTotal: 40,
    seeTotal: 60,
    lowImThreshold: 23.0,
  },
  {
    id: 2,
    name: 'Theory & Lab',
    pt1Max: 15,
    pt2Max: 15,
    ipMax: 20,
    intTotal: 50,
    seeTotal: 50,
    lowImThreshold: 27.5,
  },
  {
    id: 3,
    name: 'Mini Project I',
    pt1Max: null,
    pt2Max: null,
    ipMax: null,
    intTotal: null,
    seeTotal: null,
    lowImThreshold: 32.0,
  },
]

// Mirrors table: attainment_bands
export const attainmentBands = [
  { minPercent: 70, level: 3 },
  { minPercent: 60, level: 2 },
  { minPercent: 50, level: 1 },
  { minPercent: 0, level: 0 },
]

// Mirrors table: courses
export const courses = [
  {
    id: 1,
    code: '19CS502',
    title: 'Database Management Systems',
    natureId: 2,
    regulationYear: 2019,
    department: 'Computer Science and Engineering',
    coCount: 5,
    coTargetPercent: 60.0,
  },
  {
    id: 2,
    code: '19CS504',
    title: 'Theory of Computation',
    natureId: 1,
    regulationYear: 2019,
    department: 'Computer Science and Engineering',
    coCount: 5,
    coTargetPercent: 55.0,
  },
  {
    id: 3,
    code: '19CS591',
    title: 'Mini Project I',
    natureId: 3,
    regulationYear: 2019,
    department: 'Artificial Intelligence and Data Science',
    coCount: 5,
    coTargetPercent: 60.0,
  },
]

// Mirrors table: students
export const students = [
  { id: 1, regNumber: '7376221CS101', name: 'Aravind Kumar S', currentSem: '5' },
  { id: 2, regNumber: '7376221CS102', name: 'Divya Bharathi R', currentSem: '5' },
  { id: 3, regNumber: '7376221CS103', name: 'Harish Venkatesan M', currentSem: '5' },
  { id: 4, regNumber: '7376221CS104', name: 'Keerthana Priya G', currentSem: '5' },
  { id: 5, regNumber: '7376221CS105', name: 'Manoj Prabhakaran T', currentSem: '5' },
  { id: 6, regNumber: '7376221CS106', name: 'Nandhini Devi K', currentSem: '5' },
  { id: 7, regNumber: '7376221CS107', name: 'Praveen Raj A', currentSem: '5' },
  { id: 8, regNumber: '7376221CS108', name: 'Ramya Shree V', currentSem: '5' },
  { id: 9, regNumber: '7376221CS109', name: 'Sanjay Balaji N', currentSem: '5' },
  { id: 10, regNumber: '7376221CS110', name: 'Swetha Lakshmi P', currentSem: '5' },
  { id: 11, regNumber: '7376221CS111', name: 'Vignesh Karthik D', currentSem: '5' },
  { id: 12, regNumber: '7376221CS112', name: 'Yamini Sundari J', currentSem: '5' },
]

// Mirrors table: course_outcomes (CO1..CO5 for course 1)
export const courseOutcomes = [
  {
    id: 1,
    courseId: 1,
    coNumber: 1,
    statement: 'Explain the architecture of a database system and the relational data model.',
  },
  {
    id: 2,
    courseId: 1,
    coNumber: 2,
    statement: 'Construct ER models and map them to normalised relational schemas.',
  },
  {
    id: 3,
    courseId: 1,
    coNumber: 3,
    statement: 'Write SQL queries to define, manipulate and retrieve relational data.',
  },
  {
    id: 4,
    courseId: 1,
    coNumber: 4,
    statement: 'Apply transaction, concurrency control and recovery techniques.',
  },
  {
    id: 5,
    courseId: 1,
    coNumber: 5,
    statement: 'Analyse indexing and query processing strategies for performance.',
  },
]

// Mirrors table: assessments
// kind is one of: 'PT1' | 'PT2' | 'IP1' | 'IP2' | 'OT' | 'SEE'
export const assessments = [
  {
    id: 1,
    courseId: 1,
    kind: 'PT1',
    maxTotal: 50,
    conductedOn: '2025-08-14',
    splitMode: 'lookup',
  },
  {
    id: 2,
    courseId: 1,
    kind: 'PT2',
    maxTotal: 50,
    conductedOn: '2025-10-09',
    splitMode: 'lookup',
  },
  // splitMode 'manual': the per-CO marks are entered directly (see
  // studentCoMarks) rather than derived from the total via the split table.
  {
    id: 3,
    courseId: 1,
    kind: 'IP1',
    maxTotal: 10,
    conductedOn: '2025-09-05',
    splitMode: 'manual',
  },
  {
    id: 4,
    courseId: 1,
    kind: 'IP2',
    maxTotal: 10,
    conductedOn: '2025-10-24',
    splitMode: 'manual',
  },
  {
    id: 5,
    courseId: 1,
    kind: 'SEE',
    maxTotal: 100,
    conductedOn: '2025-11-28',
    splitMode: 'manual',
  },
  // The optional test is offered to students who want to improve; only a
  // few sit it, so it has far fewer studentAssessments rows than the others.
  {
    id: 6,
    courseId: 1,
    kind: 'OT',
    maxTotal: 50,
    conductedOn: '2025-11-07',
    splitMode: 'lookup',
  },
]

// Mirrors table: co_allocations
export const coAllocations = [
  { id: 1, assessmentId: 1, coNumber: 1, marksAllocated: 20 },
  { id: 2, assessmentId: 1, coNumber: 2, marksAllocated: 20 },
  { id: 3, assessmentId: 1, coNumber: 3, marksAllocated: 10 },
  { id: 4, assessmentId: 2, coNumber: 3, marksAllocated: 10 },
  { id: 5, assessmentId: 2, coNumber: 4, marksAllocated: 20 },
  { id: 6, assessmentId: 2, coNumber: 5, marksAllocated: 20 },
  { id: 7, assessmentId: 3, coNumber: 2, marksAllocated: 10 },
  { id: 8, assessmentId: 4, coNumber: 4, marksAllocated: 10 },
  { id: 9, assessmentId: 5, coNumber: 1, marksAllocated: 20 },
  { id: 10, assessmentId: 5, coNumber: 2, marksAllocated: 20 },
  { id: 11, assessmentId: 5, coNumber: 3, marksAllocated: 20 },
  { id: 12, assessmentId: 5, coNumber: 4, marksAllocated: 20 },
  { id: 13, assessmentId: 5, coNumber: 5, marksAllocated: 20 },
  { id: 14, assessmentId: 6, coNumber: 1, marksAllocated: 20 },
  { id: 15, assessmentId: 6, coNumber: 2, marksAllocated: 20 },
  { id: 16, assessmentId: 6, coNumber: 3, marksAllocated: 10 },
]

// Mirrors table: student_assessments
// One row per student per assessment. For 'manual' assessments the total is
// the SUM of that student's per-CO marks in studentCoMarks, so the mark sheet
// and the internal-mark totals stay consistent with the CO breakdown.
// Absences are per assessment, not per student: student 7 is absent for PT1,
// student 4 is absent for SEE, and both attend everything else.
export const studentAssessments = [
  { id: 1, assessmentId: 1, studentId: 1, totalObtained: 42, isAbsent: false },
  { id: 2, assessmentId: 1, studentId: 2, totalObtained: 47, isAbsent: false },
  { id: 3, assessmentId: 1, studentId: 3, totalObtained: 28, isAbsent: false },
  { id: 4, assessmentId: 1, studentId: 4, totalObtained: 39, isAbsent: false },
  { id: 5, assessmentId: 1, studentId: 5, totalObtained: 21, isAbsent: false },
  { id: 6, assessmentId: 1, studentId: 6, totalObtained: 45, isAbsent: false },
  { id: 7, assessmentId: 1, studentId: 7, totalObtained: null, isAbsent: true },
  { id: 8, assessmentId: 1, studentId: 8, totalObtained: 33, isAbsent: false },
  { id: 9, assessmentId: 1, studentId: 9, totalObtained: 18, isAbsent: false },
  { id: 10, assessmentId: 1, studentId: 10, totalObtained: 50, isAbsent: false },
  { id: 11, assessmentId: 1, studentId: 11, totalObtained: 36, isAbsent: false },
  { id: 12, assessmentId: 1, studentId: 12, totalObtained: 44, isAbsent: false },

  // PT2 (assessment 2, lookup split, max 50) - student 7 absent
  { id: 13, assessmentId: 2, studentId: 1, totalObtained: 44, isAbsent: false },
  { id: 14, assessmentId: 2, studentId: 2, totalObtained: 47, isAbsent: false },
  { id: 15, assessmentId: 2, studentId: 3, totalObtained: 24, isAbsent: false },
  { id: 16, assessmentId: 2, studentId: 4, totalObtained: 35, isAbsent: false },
  { id: 17, assessmentId: 2, studentId: 5, totalObtained: 21, isAbsent: false },
  { id: 18, assessmentId: 2, studentId: 6, totalObtained: 38, isAbsent: false },
  // Student 7 is absent for PT1 only; he sat PT2, and his optional-test mark
  // substitutes for the single PT1 absence.
  { id: 19, assessmentId: 2, studentId: 7, totalObtained: 33, isAbsent: false },
  { id: 20, assessmentId: 2, studentId: 8, totalObtained: 32, isAbsent: false },
  { id: 21, assessmentId: 2, studentId: 9, totalObtained: 18, isAbsent: false },
  { id: 22, assessmentId: 2, studentId: 10, totalObtained: 29, isAbsent: false },
  { id: 23, assessmentId: 2, studentId: 11, totalObtained: 33, isAbsent: false },
  { id: 24, assessmentId: 2, studentId: 12, totalObtained: 27, isAbsent: false },

  // IP1 (assessment 3, manual, max 10) - totals equal the CO2 mark
  { id: 25, assessmentId: 3, studentId: 1, totalObtained: 9, isAbsent: false },
  { id: 26, assessmentId: 3, studentId: 2, totalObtained: 10, isAbsent: false },
  { id: 27, assessmentId: 3, studentId: 3, totalObtained: 7, isAbsent: false },
  { id: 28, assessmentId: 3, studentId: 4, totalObtained: 8, isAbsent: false },
  { id: 29, assessmentId: 3, studentId: 5, totalObtained: 5, isAbsent: false },
  { id: 30, assessmentId: 3, studentId: 6, totalObtained: 9, isAbsent: false },
  { id: 31, assessmentId: 3, studentId: 7, totalObtained: 7, isAbsent: false },
  { id: 32, assessmentId: 3, studentId: 8, totalObtained: 6, isAbsent: false },
  { id: 33, assessmentId: 3, studentId: 9, totalObtained: 4, isAbsent: false },
  { id: 34, assessmentId: 3, studentId: 10, totalObtained: 10, isAbsent: false },
  { id: 35, assessmentId: 3, studentId: 11, totalObtained: 8, isAbsent: false },
  { id: 36, assessmentId: 3, studentId: 12, totalObtained: 5, isAbsent: false },

  // IP2 (assessment 4, manual, max 10) - totals equal the CO4 mark
  { id: 37, assessmentId: 4, studentId: 1, totalObtained: 8, isAbsent: false },
  { id: 38, assessmentId: 4, studentId: 2, totalObtained: 9, isAbsent: false },
  { id: 39, assessmentId: 4, studentId: 3, totalObtained: 5, isAbsent: false },
  { id: 40, assessmentId: 4, studentId: 4, totalObtained: 7, isAbsent: false },
  { id: 41, assessmentId: 4, studentId: 5, totalObtained: 4, isAbsent: false },
  { id: 42, assessmentId: 4, studentId: 6, totalObtained: 8, isAbsent: false },
  { id: 43, assessmentId: 4, studentId: 7, totalObtained: 6, isAbsent: false },
  { id: 44, assessmentId: 4, studentId: 8, totalObtained: 5, isAbsent: false },
  { id: 45, assessmentId: 4, studentId: 9, totalObtained: 3, isAbsent: false },
  { id: 46, assessmentId: 4, studentId: 10, totalObtained: 9, isAbsent: false },
  { id: 47, assessmentId: 4, studentId: 11, totalObtained: 5, isAbsent: false },
  { id: 48, assessmentId: 4, studentId: 12, totalObtained: 4, isAbsent: false },

  // SEE (assessment 5, manual, max 100) - totals are the sum of CO1..CO5.
  // Student 4 is absent here, and only here.
  { id: 49, assessmentId: 5, studentId: 1, totalObtained: 73, isAbsent: false },
  { id: 50, assessmentId: 5, studentId: 2, totalObtained: 84, isAbsent: false },
  { id: 51, assessmentId: 5, studentId: 3, totalObtained: 52, isAbsent: false },
  { id: 52, assessmentId: 5, studentId: 4, totalObtained: null, isAbsent: true },
  { id: 53, assessmentId: 5, studentId: 5, totalObtained: 40, isAbsent: false },
  { id: 54, assessmentId: 5, studentId: 6, totalObtained: 75, isAbsent: false },
  { id: 55, assessmentId: 5, studentId: 7, totalObtained: 58, isAbsent: false },
  { id: 56, assessmentId: 5, studentId: 8, totalObtained: 61, isAbsent: false },
  { id: 57, assessmentId: 5, studentId: 9, totalObtained: 35, isAbsent: false },
  { id: 58, assessmentId: 5, studentId: 10, totalObtained: 82, isAbsent: false },
  { id: 59, assessmentId: 5, studentId: 11, totalObtained: 65, isAbsent: false },
  { id: 60, assessmentId: 5, studentId: 12, totalObtained: 71, isAbsent: false },

  // OT (assessment 6, lookup, max 50) - only the two students who opted in.
  { id: 61, assessmentId: 6, studentId: 5, totalObtained: 34, isAbsent: false },
  { id: 62, assessmentId: 6, studentId: 9, totalObtained: 29, isAbsent: false },
  { id: 63, assessmentId: 6, studentId: 7, totalObtained: 34, isAbsent: false },
]

// Mirrors table: student_co_marks
//
// The per-CO marks for assessments whose splitMode is 'manual' (IP1, IP2,
// SEE). In manual mode these ARE the entered data - they are not derived
// from a total, and the total on the student_assessments row is their sum.
// Assessments in 'lookup' mode (PT1, PT2) have no rows here: their per-CO
// marks come from the hand-authored split table.
//
// Absent students have NO rows at all - absence is per assessment.
export const studentCoMarks = [
  // IP1 (assessment 3) - CO2 only, out of 10
  { assessmentId: 3, studentId: 1, coNumber: 2, marksObtained: 9 },
  { assessmentId: 3, studentId: 2, coNumber: 2, marksObtained: 10 },
  { assessmentId: 3, studentId: 3, coNumber: 2, marksObtained: 7 },
  { assessmentId: 3, studentId: 4, coNumber: 2, marksObtained: 8 },
  { assessmentId: 3, studentId: 5, coNumber: 2, marksObtained: 5 },
  { assessmentId: 3, studentId: 6, coNumber: 2, marksObtained: 9 },
  { assessmentId: 3, studentId: 7, coNumber: 2, marksObtained: 7 },
  { assessmentId: 3, studentId: 8, coNumber: 2, marksObtained: 6 },
  { assessmentId: 3, studentId: 9, coNumber: 2, marksObtained: 4 },
  { assessmentId: 3, studentId: 10, coNumber: 2, marksObtained: 10 },
  { assessmentId: 3, studentId: 11, coNumber: 2, marksObtained: 8 },
  { assessmentId: 3, studentId: 12, coNumber: 2, marksObtained: 5 },

  // IP2 (assessment 4) - CO4 only, out of 10
  { assessmentId: 4, studentId: 1, coNumber: 4, marksObtained: 8 },
  { assessmentId: 4, studentId: 2, coNumber: 4, marksObtained: 9 },
  { assessmentId: 4, studentId: 3, coNumber: 4, marksObtained: 5 },
  { assessmentId: 4, studentId: 4, coNumber: 4, marksObtained: 7 },
  { assessmentId: 4, studentId: 5, coNumber: 4, marksObtained: 4 },
  { assessmentId: 4, studentId: 6, coNumber: 4, marksObtained: 8 },
  { assessmentId: 4, studentId: 7, coNumber: 4, marksObtained: 6 },
  { assessmentId: 4, studentId: 8, coNumber: 4, marksObtained: 5 },
  { assessmentId: 4, studentId: 9, coNumber: 4, marksObtained: 3 },
  { assessmentId: 4, studentId: 10, coNumber: 4, marksObtained: 9 },
  { assessmentId: 4, studentId: 11, coNumber: 4, marksObtained: 5 },
  { assessmentId: 4, studentId: 12, coNumber: 4, marksObtained: 4 },

  // SEE (assessment 5) - CO1..CO5, each out of 20.
  // Student 4 is absent, so has no rows.
  { assessmentId: 5, studentId: 1, coNumber: 1, marksObtained: 17 },
  { assessmentId: 5, studentId: 1, coNumber: 2, marksObtained: 15 },
  { assessmentId: 5, studentId: 1, coNumber: 3, marksObtained: 16 },
  { assessmentId: 5, studentId: 1, coNumber: 4, marksObtained: 13 },
  { assessmentId: 5, studentId: 1, coNumber: 5, marksObtained: 12 },

  { assessmentId: 5, studentId: 2, coNumber: 1, marksObtained: 19 },
  { assessmentId: 5, studentId: 2, coNumber: 2, marksObtained: 18 },
  { assessmentId: 5, studentId: 2, coNumber: 3, marksObtained: 17 },
  { assessmentId: 5, studentId: 2, coNumber: 4, marksObtained: 16 },
  { assessmentId: 5, studentId: 2, coNumber: 5, marksObtained: 14 },

  { assessmentId: 5, studentId: 3, coNumber: 1, marksObtained: 13 },
  { assessmentId: 5, studentId: 3, coNumber: 2, marksObtained: 11 },
  { assessmentId: 5, studentId: 3, coNumber: 3, marksObtained: 11 },
  { assessmentId: 5, studentId: 3, coNumber: 4, marksObtained: 9 },
  { assessmentId: 5, studentId: 3, coNumber: 5, marksObtained: 8 },

  { assessmentId: 5, studentId: 5, coNumber: 1, marksObtained: 10 },
  { assessmentId: 5, studentId: 5, coNumber: 2, marksObtained: 8 },
  { assessmentId: 5, studentId: 5, coNumber: 3, marksObtained: 9 },
  { assessmentId: 5, studentId: 5, coNumber: 4, marksObtained: 7 },
  { assessmentId: 5, studentId: 5, coNumber: 5, marksObtained: 6 },

  { assessmentId: 5, studentId: 6, coNumber: 1, marksObtained: 18 },
  { assessmentId: 5, studentId: 6, coNumber: 2, marksObtained: 16 },
  { assessmentId: 5, studentId: 6, coNumber: 3, marksObtained: 15 },
  { assessmentId: 5, studentId: 6, coNumber: 4, marksObtained: 14 },
  { assessmentId: 5, studentId: 6, coNumber: 5, marksObtained: 12 },

  { assessmentId: 5, studentId: 7, coNumber: 1, marksObtained: 14 },
  { assessmentId: 5, studentId: 7, coNumber: 2, marksObtained: 11 },
  { assessmentId: 5, studentId: 7, coNumber: 3, marksObtained: 13 },
  { assessmentId: 5, studentId: 7, coNumber: 4, marksObtained: 11 },
  { assessmentId: 5, studentId: 7, coNumber: 5, marksObtained: 9 },

  { assessmentId: 5, studentId: 8, coNumber: 1, marksObtained: 15 },
  { assessmentId: 5, studentId: 8, coNumber: 2, marksObtained: 13 },
  { assessmentId: 5, studentId: 8, coNumber: 3, marksObtained: 11 },
  { assessmentId: 5, studentId: 8, coNumber: 4, marksObtained: 12 },
  { assessmentId: 5, studentId: 8, coNumber: 5, marksObtained: 10 },

  { assessmentId: 5, studentId: 9, coNumber: 1, marksObtained: 9 },
  { assessmentId: 5, studentId: 9, coNumber: 2, marksObtained: 7 },
  { assessmentId: 5, studentId: 9, coNumber: 3, marksObtained: 8 },
  { assessmentId: 5, studentId: 9, coNumber: 4, marksObtained: 6 },
  { assessmentId: 5, studentId: 9, coNumber: 5, marksObtained: 5 },

  { assessmentId: 5, studentId: 10, coNumber: 1, marksObtained: 19 },
  { assessmentId: 5, studentId: 10, coNumber: 2, marksObtained: 17 },
  { assessmentId: 5, studentId: 10, coNumber: 3, marksObtained: 18 },
  { assessmentId: 5, studentId: 10, coNumber: 4, marksObtained: 15 },
  { assessmentId: 5, studentId: 10, coNumber: 5, marksObtained: 13 },

  { assessmentId: 5, studentId: 11, coNumber: 1, marksObtained: 16 },
  { assessmentId: 5, studentId: 11, coNumber: 2, marksObtained: 14 },
  { assessmentId: 5, studentId: 11, coNumber: 3, marksObtained: 13 },
  { assessmentId: 5, studentId: 11, coNumber: 4, marksObtained: 11 },
  { assessmentId: 5, studentId: 11, coNumber: 5, marksObtained: 11 },

  { assessmentId: 5, studentId: 12, coNumber: 1, marksObtained: 17 },
  { assessmentId: 5, studentId: 12, coNumber: 2, marksObtained: 15 },
  { assessmentId: 5, studentId: 12, coNumber: 3, marksObtained: 14 },
  { assessmentId: 5, studentId: 12, coNumber: 4, marksObtained: 13 },
  { assessmentId: 5, studentId: 12, coNumber: 5, marksObtained: 12 },
]

// Mirrors table: co_split_values (pattern "PT 50 (20/20/10)")
//
// !! HAND-AUTHORED SOURCE VALUES - NEVER REGENERATE !!
// Copied verbatim from the BIT Sathy "random mark split up PT" workbook.
// These splits follow no formula: several rows are deliberately not
// monotonic or proportional. Do not compute, interpolate, round or
// "correct" any value here. If one looks wrong, check the workbook.
export const coSplitValues = [
  { totalMark: 0, q1: 0, q2: 0, q3: 0 },
  { totalMark: 1, q1: 0, q2: 1, q3: 0 },
  { totalMark: 2, q1: 1, q2: 1, q3: 0 },
  { totalMark: 3, q1: 1, q2: 2, q3: 0 },
  { totalMark: 4, q1: 2, q2: 2, q3: 0 },
  { totalMark: 5, q1: 3, q2: 2, q3: 0 },
  { totalMark: 6, q1: 2, q2: 3, q3: 1 },
  { totalMark: 7, q1: 2, q2: 3, q3: 2 },
  { totalMark: 8, q1: 3, q2: 3, q3: 2 },
  { totalMark: 9, q1: 3, q2: 4, q3: 2 },
  { totalMark: 10, q1: 4, q2: 3, q3: 3 },
  { totalMark: 11, q1: 4, q2: 4, q3: 3 },
  { totalMark: 12, q1: 4, q2: 5, q3: 3 },
  { totalMark: 13, q1: 5, q2: 5, q3: 3 },
  { totalMark: 14, q1: 6, q2: 5, q3: 3 },
  { totalMark: 15, q1: 6, q2: 6, q3: 3 },
  { totalMark: 16, q1: 6, q2: 7, q3: 3 },
  { totalMark: 17, q1: 6, q2: 7, q3: 4 },
  { totalMark: 18, q1: 7, q2: 7, q3: 4 },
  { totalMark: 19, q1: 8, q2: 7, q3: 4 },
  { totalMark: 20, q1: 9, q2: 7, q3: 4 },
  { totalMark: 21, q1: 9, q2: 9, q3: 3 },
  { totalMark: 22, q1: 11, q2: 8, q3: 3 },
  { totalMark: 23, q1: 9, q2: 9, q3: 5 },
  { totalMark: 24, q1: 9, q2: 9, q3: 6 },
  { totalMark: 25, q1: 9, q2: 10, q3: 6 },
  { totalMark: 26, q1: 11, q2: 10, q3: 5 },
  { totalMark: 27, q1: 11, q2: 11, q3: 5 },
  { totalMark: 28, q1: 11, q2: 11, q3: 6 },
  { totalMark: 29, q1: 12, q2: 11, q3: 6 },
  { totalMark: 30, q1: 12, q2: 13, q3: 5 },
  { totalMark: 31, q1: 13, q2: 12, q3: 6 },
  { totalMark: 32, q1: 13, q2: 13, q3: 6 },
  { totalMark: 33, q1: 13, q2: 13, q3: 7 },
  { totalMark: 34, q1: 14, q2: 14, q3: 6 },
  { totalMark: 35, q1: 14, q2: 14, q3: 7 },
  { totalMark: 36, q1: 15, q2: 14, q3: 7 },
  { totalMark: 37, q1: 16, q2: 15, q3: 6 },
  { totalMark: 38, q1: 15, q2: 15, q3: 8 },
  { totalMark: 39, q1: 15, q2: 16, q3: 8 },
  { totalMark: 40, q1: 15, q2: 16, q3: 9 },
  { totalMark: 41, q1: 16, q2: 16, q3: 9 },
  { totalMark: 42, q1: 17, q2: 16, q3: 9 },
  { totalMark: 43, q1: 18, q2: 18, q3: 7 },
  { totalMark: 44, q1: 18, q2: 17, q3: 9 },
  { totalMark: 45, q1: 18, q2: 19, q3: 8 },
  { totalMark: 46, q1: 18, q2: 18, q3: 10 },
  { totalMark: 47, q1: 19, q2: 18, q3: 10 },
  { totalMark: 48, q1: 19, q2: 20, q3: 9 },
  { totalMark: 49, q1: 20, q2: 20, q3: 9 },
  { totalMark: 50, q1: 20, q2: 20, q3: 10 },
]

// Mirrors table: program_outcomes
// SHORT TITLES ONLY. The full PO statements live in the database, not here.
export const programOutcomes = [
  { code: 'PO1', title: 'Engineering knowledge' },
  { code: 'PO2', title: 'Problem analysis' },
  { code: 'PO3', title: 'Design/development of solutions' },
  { code: 'PO4', title: 'Conduct investigations of complex problems' },
  { code: 'PO5', title: 'Modern tool usage' },
  { code: 'PO6', title: 'The engineer and society' },
  { code: 'PO7', title: 'Environment and sustainability' },
  { code: 'PO8', title: 'Ethics' },
  { code: 'PO9', title: 'Individual and team work' },
  { code: 'PO10', title: 'Communication' },
  { code: 'PO11', title: 'Project management and finance' },
  { code: 'PO12', title: 'Life-long learning' },
]

// Mirrors table: program_specific_outcomes
// PSOs are defined per department - these are placeholders only.
export const programSpecificOutcomes = [
  { code: 'PSO1', title: 'Department-specific outcome 1 (placeholder)' },
  { code: 'PSO2', title: 'Department-specific outcome 2 (placeholder)' },
  { code: 'PSO3', title: 'Department-specific outcome 3 (placeholder)' },
]

// Mirrors table: co_po_matrix (CO to PO/PSO articulation)
// outcomeType is 'PO' or 'PSO'; value is the correlation strength 1-3.
// Only cells with a correlation are stored - an absent row means no
// correlation, which is why most of the 15 columns are unset below.
// Sample articulation for courseId 1 only.
export const coPoMatrix = [
  { courseId: 1, coNumber: 1, outcomeType: 'PO', outcomeCode: 'PO1', value: 3 },
  { courseId: 1, coNumber: 1, outcomeType: 'PO', outcomeCode: 'PO2', value: 2 },
  { courseId: 1, coNumber: 1, outcomeType: 'PSO', outcomeCode: 'PSO1', value: 2 },

  { courseId: 1, coNumber: 2, outcomeType: 'PO', outcomeCode: 'PO1', value: 3 },
  { courseId: 1, coNumber: 2, outcomeType: 'PO', outcomeCode: 'PO2', value: 3 },
  { courseId: 1, coNumber: 2, outcomeType: 'PO', outcomeCode: 'PO3', value: 2 },
  { courseId: 1, coNumber: 2, outcomeType: 'PSO', outcomeCode: 'PSO1', value: 3 },

  { courseId: 1, coNumber: 3, outcomeType: 'PO', outcomeCode: 'PO1', value: 3 },
  { courseId: 1, coNumber: 3, outcomeType: 'PO', outcomeCode: 'PO3', value: 2 },
  { courseId: 1, coNumber: 3, outcomeType: 'PO', outcomeCode: 'PO5', value: 2 },
  { courseId: 1, coNumber: 3, outcomeType: 'PSO', outcomeCode: 'PSO1', value: 3 },
  { courseId: 1, coNumber: 3, outcomeType: 'PSO', outcomeCode: 'PSO2', value: 2 },

  { courseId: 1, coNumber: 4, outcomeType: 'PO', outcomeCode: 'PO1', value: 2 },
  { courseId: 1, coNumber: 4, outcomeType: 'PO', outcomeCode: 'PO2', value: 3 },
  { courseId: 1, coNumber: 4, outcomeType: 'PO', outcomeCode: 'PO4', value: 2 },
  { courseId: 1, coNumber: 4, outcomeType: 'PSO', outcomeCode: 'PSO1', value: 2 },

  { courseId: 1, coNumber: 5, outcomeType: 'PO', outcomeCode: 'PO2', value: 3 },
  { courseId: 1, coNumber: 5, outcomeType: 'PO', outcomeCode: 'PO4', value: 2 },
  { courseId: 1, coNumber: 5, outcomeType: 'PO', outcomeCode: 'PO5', value: 2 },
  { courseId: 1, coNumber: 5, outcomeType: 'PO', outcomeCode: 'PO12', value: 1 },
  { courseId: 1, coNumber: 5, outcomeType: 'PSO', outcomeCode: 'PSO2', value: 2 },
]

// Mirrors table: course_exit_survey
// Indirect attainment: the level students themselves report for each CO.
export const courseExitSurvey = [
  { courseId: 1, coNumber: 1, value: 2.8 },
  { courseId: 1, coNumber: 2, value: 2.7 },
  { courseId: 1, coNumber: 3, value: 2.8 },
  { courseId: 1, coNumber: 4, value: 2.7 },
  { courseId: 1, coNumber: 5, value: 2.8 },
]

// Institution-level constants - the same for every course, so they are not
// stored per course.
//
// NOTE ON cieWeight / seeWeight: the source spreadsheet's label text reads
// 0.5 / 0.5 for CIE / SEE, but the formula in the cell actually computes
// 0.4 * CIE + 0.6 * SEE. We follow the FORMULA, not the label - the label
// appears to be stale. Confirm with the client before changing these.
export const attainmentConstants = {
  cieWeight: 0.4,
  seeWeight: 0.6,
  directWeight: 0.8,
  surveyWeight: 0.2,
}

// ---------------------------------------------------------------
// Course-file document data
// Static institutional text that appears on the printed sheets.
// Placeholder wording - replace with the official text when confirmed.
// ---------------------------------------------------------------

// Mirrors table: institution
export const institution = {
  name: 'BANNARI AMMAN INSTITUTE OF TECHNOLOGY',
  place: 'Sathyamangalam, Erode District',
  affiliation: 'Affiliated to Anna University, Chennai',
  accreditation: 'An Autonomous Institution — Accredited by NAAC and NBA',
}

// Mirrors table: faculty
// Used by the mock sign-in screen. There is no authentication behind this -
// picking a name simply sets who the session belongs to.
export const facultyList = [
  {
    id: 1,
    name: 'Faculty A',
    email: 'facultya@bitsathy.ac.in',
    department: 'Computer Science and Engineering',
    designation: 'Assistant Professor',
  },
  {
    id: 2,
    name: 'Faculty B',
    email: 'facultyb@bitsathy.ac.in',
    department: 'Computer Science and Engineering',
    designation: 'Associate Professor',
  },
  {
    id: 3,
    name: 'Faculty C',
    email: 'facultyc@bitsathy.ac.in',
    department: 'Artificial Intelligence and Data Science',
    designation: 'Assistant Professor',
  },
]

// Mirrors table: institution_vision_mission
export const institutionVisionMission = {
  vision:
    'To be a centre of excellence in engineering education and research, developing competent professionals who serve society with integrity.',
  missions: [
    'To impart quality technical education through a learner-centred curriculum supported by modern infrastructure.',
    'To develop faculty and staff continuously so that teaching and research remain current with industry practice.',
    'To promote research, innovation and entrepreneurship that address real societal and industrial needs.',
    'To build professional ethics, leadership and teamwork through structured co-curricular activity.',
    'To sustain productive collaboration with industry, alumni and the wider community.',
  ],
}

// Mirrors table: department_vision_mission
export const departmentVisionMission = {
  department: 'Computer Science and Engineering',
  vision:
    'To produce computing professionals with strong fundamentals, practical skill and social responsibility, capable of contributing to a rapidly evolving discipline.',
  missions: [
    'To deliver a rigorous computing curriculum that balances theoretical depth with hands-on practice.',
    'To provide laboratory and project experience aligned with current industry tools and methods.',
    'To encourage research, publication and participation in professional bodies among students and faculty.',
    'To nurture communication, teamwork and ethical judgement alongside technical competence.',
    'To support lifelong learning through certification, internship and alumni engagement.',
  ],
}

// Mirrors table: peos (Programme Educational Objectives)
export const peos = [
  {
    code: 'PEO1',
    statement:
      'Graduates will apply their knowledge of computing and engineering fundamentals to analyse and solve problems in industry, research or higher study.',
  },
  {
    code: 'PEO2',
    statement:
      'Graduates will function effectively in multidisciplinary teams, communicating clearly and exercising professional and ethical responsibility.',
  },
  {
    code: 'PEO3',
    statement:
      'Graduates will engage in lifelong learning, adapting to emerging technologies and contributing to the advancement of the profession and society.',
  },
]

// Full PO text. The short titles used in the articulation matrix live in
// programOutcomes above; these are the statements printed in the course file.
export const programOutcomeStatements = [
  {
    code: 'PO1',
    statement:
      'Engineering knowledge: Apply the knowledge of mathematics, science, engineering fundamentals and an engineering specialisation to the solution of complex engineering problems.',
  },
  {
    code: 'PO2',
    statement:
      'Problem analysis: Identify, formulate, review research literature and analyse complex engineering problems reaching substantiated conclusions using first principles of mathematics, natural sciences and engineering sciences.',
  },
  {
    code: 'PO3',
    statement:
      'Design/development of solutions: Design solutions for complex engineering problems and design system components or processes that meet the specified needs with appropriate consideration for public health and safety, and cultural, societal and environmental considerations.',
  },
  {
    code: 'PO4',
    statement:
      'Conduct investigations of complex problems: Use research-based knowledge and research methods including design of experiments, analysis and interpretation of data, and synthesis of the information to provide valid conclusions.',
  },
  {
    code: 'PO5',
    statement:
      'Modern tool usage: Create, select and apply appropriate techniques, resources and modern engineering and IT tools including prediction and modelling to complex engineering activities with an understanding of the limitations.',
  },
  {
    code: 'PO6',
    statement:
      'The engineer and society: Apply reasoning informed by contextual knowledge to assess societal, health, safety, legal and cultural issues and the consequent responsibilities relevant to professional engineering practice.',
  },
  {
    code: 'PO7',
    statement:
      'Environment and sustainability: Understand the impact of professional engineering solutions in societal and environmental contexts and demonstrate the knowledge of, and need for, sustainable development.',
  },
  {
    code: 'PO8',
    statement:
      'Ethics: Apply ethical principles and commit to professional ethics and responsibilities and norms of engineering practice.',
  },
  {
    code: 'PO9',
    statement:
      'Individual and team work: Function effectively as an individual, and as a member or leader in diverse teams and in multidisciplinary settings.',
  },
  {
    code: 'PO10',
    statement:
      'Communication: Communicate effectively on complex engineering activities with the engineering community and with society at large, including the ability to write effective reports, make effective presentations and give and receive clear instructions.',
  },
  {
    code: 'PO11',
    statement:
      'Project management and finance: Demonstrate knowledge and understanding of engineering and management principles and apply these to one’s own work, as a member and leader in a team, to manage projects and in multidisciplinary environments.',
  },
  {
    code: 'PO12',
    statement:
      'Life-long learning: Recognise the need for, and have the preparation and ability to engage in independent and life-long learning in the broadest context of technological change.',
  },
]

// Mirrors table: pso_statements - PSOs are defined per department.
export const psoStatements = [
  {
    department: 'Computer Science and Engineering',
    code: 'PSO1',
    statement:
      'Apply the principles of data structures, databases, networks and software engineering to design and implement computing systems that meet specified requirements.',
  },
  {
    department: 'Computer Science and Engineering',
    code: 'PSO2',
    statement:
      'Use current programming platforms, tools and analytical methods to develop, test and evaluate software solutions for problems in science, industry and society.',
  },
]

// Mirrors table: internal_marks
//
// The consolidated internal mark for every student in every course - the
// input to the institution-wide risk report. Components are already scaled
// onto each course nature's mark scale:
//   Theory & Lab   PT1/PT2 out of 15, IP out of 20  (INT 50, low below 27.5)
//   Theory         PT1/PT2 out of 12, IP out of 16  (INT 40, low below 23)
//   Mini Project I no component breakdown in the source, total only
//                  (low below 32)
// total = round(pt1 + pt2 + ip) where components exist.
//
// Course 1's rows are the same figures the Internal Marks sheet computes
// from PT1/PT2/IP1/IP2, so the two screens agree.
export const internalMarks = [
  // Course 1 - 19CS502, Theory & Lab
  { studentId: 1, courseId: 1, pt1: 12.6, pt2: 13.2, ip: 17, total: 43 },
  { studentId: 2, courseId: 1, pt1: 14.1, pt2: 14.1, ip: 19, total: 47 },
  { studentId: 3, courseId: 1, pt1: 8.4, pt2: 7.2, ip: 12, total: 28 },
  { studentId: 4, courseId: 1, pt1: 11.7, pt2: 10.5, ip: 15, total: 37 },
  { studentId: 5, courseId: 1, pt1: 6.3, pt2: 6.3, ip: 9, total: 22 },
  { studentId: 6, courseId: 1, pt1: 13.5, pt2: 11.4, ip: 17, total: 42 },
  { studentId: 7, courseId: 1, pt1: 10.2, pt2: 9.9, ip: 13, total: 33 },
  { studentId: 8, courseId: 1, pt1: 9.9, pt2: 9.6, ip: 11, total: 31 },
  { studentId: 9, courseId: 1, pt1: 5.4, pt2: 5.4, ip: 7, total: 18 },
  { studentId: 10, courseId: 1, pt1: 15, pt2: 8.7, ip: 19, total: 43 },
  { studentId: 11, courseId: 1, pt1: 10.8, pt2: 9.9, ip: 13, total: 34 },
  { studentId: 12, courseId: 1, pt1: 13.2, pt2: 8.1, ip: 9, total: 30 },

  // Course 2 - 19CS504, Theory
  { studentId: 1, courseId: 2, pt1: 9.5, pt2: 9, ip: 12, total: 31 },
  { studentId: 2, courseId: 2, pt1: 10.5, pt2: 10, ip: 14, total: 35 },
  { studentId: 3, courseId: 2, pt1: 7, pt2: 6, ip: 9, total: 22 },
  { studentId: 4, courseId: 2, pt1: 8.5, pt2: 8, ip: 11, total: 28 },
  { studentId: 5, courseId: 2, pt1: 6, pt2: 5.5, ip: 8, total: 20 },
  { studentId: 6, courseId: 2, pt1: 10, pt2: 9.5, ip: 13, total: 33 },
  { studentId: 7, courseId: 2, pt1: 7.5, pt2: 7, ip: 10, total: 25 },
  { studentId: 8, courseId: 2, pt1: 7, pt2: 7, ip: 9, total: 23 },
  { studentId: 9, courseId: 2, pt1: 5.5, pt2: 5, ip: 7, total: 18 },
  { studentId: 10, courseId: 2, pt1: 11, pt2: 10.5, ip: 15, total: 37 },
  { studentId: 11, courseId: 2, pt1: 8, pt2: 8, ip: 10, total: 26 },
  { studentId: 12, courseId: 2, pt1: 6.5, pt2: 7, ip: 8.5, total: 22 },

  // Course 3 - 19CS591, Mini Project I (no component breakdown in the source)
  { studentId: 1, courseId: 3, pt1: null, pt2: null, ip: null, total: 42 },
  { studentId: 2, courseId: 3, pt1: null, pt2: null, ip: null, total: 45 },
  { studentId: 3, courseId: 3, pt1: null, pt2: null, ip: null, total: 30 },
  { studentId: 4, courseId: 3, pt1: null, pt2: null, ip: null, total: 38 },
  { studentId: 5, courseId: 3, pt1: null, pt2: null, ip: null, total: 31 },
  { studentId: 6, courseId: 3, pt1: null, pt2: null, ip: null, total: 44 },
  { studentId: 7, courseId: 3, pt1: null, pt2: null, ip: null, total: 35 },
  { studentId: 8, courseId: 3, pt1: null, pt2: null, ip: null, total: 33 },
  { studentId: 9, courseId: 3, pt1: null, pt2: null, ip: null, total: 28 },
  { studentId: 10, courseId: 3, pt1: null, pt2: null, ip: null, total: 46 },
  { studentId: 11, courseId: 3, pt1: null, pt2: null, ip: null, total: 36 },
  { studentId: 12, courseId: 3, pt1: null, pt2: null, ip: null, total: 34 },
]

// Mirrors table: attendance - overall course attendance percentage.
export const attendance = [
  { studentId: 1, courseId: 1, percentage: 94 },
  { studentId: 2, courseId: 1, percentage: 98 },
  { studentId: 3, courseId: 1, percentage: 82 },
  { studentId: 4, courseId: 1, percentage: 91 },
  { studentId: 5, courseId: 1, percentage: 79 },
  { studentId: 6, courseId: 1, percentage: 96 },
  { studentId: 7, courseId: 1, percentage: 85 },
  { studentId: 8, courseId: 1, percentage: 88 },
  { studentId: 9, courseId: 1, percentage: 71 },
  { studentId: 10, courseId: 1, percentage: 100 },
  { studentId: 11, courseId: 1, percentage: 90 },
  { studentId: 12, courseId: 1, percentage: 93 },
]

// Mirrors table: remedial_schedule
// One row per (course, assessment) - the remedial classes announced after
// that periodical test, one class per CO that needed remedial work.
export const remedialSchedule = [
  {
    id: 1,
    courseId: 1,
    assessmentKind: 'PT1',
    venue: 'Seminar Hall B',
    classes: [
      { coNumber: 1, date: '2025-08-20', timing: '4:30PM to 5:30PM' },
      { coNumber: 2, date: '2025-08-21', timing: '4:30PM to 5:30PM' },
      { coNumber: 3, date: '2025-08-22', timing: '4:30PM to 5:30PM' },
    ],
  },
]
