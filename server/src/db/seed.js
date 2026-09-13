import { getDb } from './index.js';

// The app is set up for one student. The record still carries a student_id on
// every table, so turning on multiple profiles later needs no migration.
const DEFAULT_STUDENT = { name: 'Hari', class: '', stream: '' };

// Calm, clearly distinguishable colours — they become the calendar blocks in
// Phase 2, so they need to read well side by side.
const DEFAULT_SUBJECTS = [
  { name: 'English', code: 'ENG', colour: '#7c6bb0' },
  { name: 'Physics', code: 'PHY', colour: '#3f7fa8' },
  { name: 'Chemistry', code: 'CHEM', colour: '#c07a3e' },
  { name: 'Mathematics', code: 'MATH', colour: '#4f8a73' },
  { name: 'Artificial Intelligence', code: 'AI', colour: '#b05f7a' },
];

/**
 * Creates the default student and starter subjects the first time the app
 * runs. Safe to call on every boot: it only fills in what is missing, and it
 * never re-adds a subject the student has deliberately deleted.
 */
export function ensureSeedData() {
  const db = getDb();

  let student = db.prepare('SELECT * FROM student ORDER BY id LIMIT 1').get();

  if (!student) {
    const info = db
      .prepare('INSERT INTO student (name, class, stream) VALUES (?, ?, ?)')
      .run(DEFAULT_STUDENT.name, DEFAULT_STUDENT.class, DEFAULT_STUDENT.stream);
    student = db.prepare('SELECT * FROM student WHERE id = ?').get(info.lastInsertRowid);

    const insertSubject = db.prepare(
      `INSERT INTO subject (student_id, name, code, colour, display_order)
       VALUES (?, ?, ?, ?, ?)`
    );
    const seedSubjects = db.transaction(() => {
      DEFAULT_SUBJECTS.forEach((subject, index) => {
        insertSubject.run(student.id, subject.name, subject.code, subject.colour, index);
      });
    });
    seedSubjects();

    console.log('  ✓ created starter profile and five subjects');
  }

  return student;
}

/** The single student this installation belongs to. */
export function getCurrentStudent() {
  return ensureSeedData();
}
