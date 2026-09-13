import { Router } from 'express';
import { studentsRouter } from './students.js';
import { subjectsRouter } from './subjects.js';
import { syllabusRouter } from './syllabus.js';
import { topicsRouter } from './topics.js';

export function createApiRouter() {
  const router = Router();

  router.use('/student', studentsRouter);
  router.use('/subjects', subjectsRouter);
  router.use('/topics', topicsRouter);
  router.use('/syllabus', syllabusRouter);

  return router;
}
