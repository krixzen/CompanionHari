import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute } from '../lib/httpError.js';
import { optionalString } from '../lib/validate.js';

export const studentsRouter = Router();

// This build is set up for a single student, so there is no id in the path.
studentsRouter.get('/', (req, res) => {
  res.json({ student: getCurrentStudent() });
});

studentsRouter.patch(
  '/',
  asyncRoute((req, res) => {
    const student = getCurrentStudent();

    const name = optionalString(req.body, 'name', { max: 120 });
    const klass = optionalString(req.body, 'class', { max: 60 });
    const stream = optionalString(req.body, 'stream', { max: 60 });

    getDb()
      .prepare('UPDATE student SET name = ?, class = ?, stream = ? WHERE id = ?')
      .run(
        name === undefined ? student.name : name || student.name,
        klass === undefined ? student.class : klass,
        stream === undefined ? student.stream : stream,
        student.id
      );

    res.json({ student: getDb().prepare('SELECT * FROM student WHERE id = ?').get(student.id) });
  })
);
