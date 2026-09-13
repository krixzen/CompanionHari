import { Router } from 'express';
import { anchorsRouter } from './anchors.js';
import { planRouter } from './plan.js';
import { progressRouter } from './progress.js';
import { sessionsRouter } from './sessions.js';
import { settingsRouter } from './settings.js';
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
  router.use('/anchors', anchorsRouter);
  router.use('/plan', planRouter);
  router.use('/settings', settingsRouter);
  router.use('/sessions', sessionsRouter);
  router.use('/progress', progressRouter);

  return router;
}
