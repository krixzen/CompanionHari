import { getDb } from './index.js';
import { colourForPosition } from '../lib/palette.js';

// The app is set up for one student. The record still carries a student_id on
// every table, so turning on multiple profiles later needs no migration.
const DEFAULT_STUDENT = { name: 'Hari', class: '', stream: '' };

// Colours come from the validated palette, in order — see lib/palette.js for
// why the order matters.
const DEFAULT_SUBJECTS = [
  { name: 'English', code: 'ENG' },
  { name: 'Physics', code: 'PHY' },
  { name: 'Chemistry', code: 'CHEM' },
  { name: 'Mathematics', code: 'MATH' },
  { name: 'Artificial Intelligence', code: 'AI' },
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
        insertSubject.run(student.id, subject.name, subject.code, colourForPosition(index), index);
      });
    });
    seedSubjects();

    console.log('  ✓ created starter profile and five subjects');
  }

  const defaultTemplate = db
    .prepare('SELECT id FROM week_template WHERE student_id = ? AND is_default = 1')
    .get(student.id);
  if (!defaultTemplate) {
    db.prepare('INSERT INTO week_template (student_id, name, is_default) VALUES (?, ?, 1)').run(
      student.id,
      'Regular week'
    );
  }

  return student;
}

/** The single student this installation belongs to. */
export function getCurrentStudent() {
  return ensureSeedData();
}
