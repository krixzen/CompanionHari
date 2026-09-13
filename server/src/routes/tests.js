import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import { createTest, deleteTest, getTest, listTests, updateTest } from '../services/testService.js';
import {
  deleteTestResult,
  setTestResults,
  updateTestResult,
} from '../services/testResultService.js';

export const testsRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value, label = 'id') => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`"${label}" must be a number.`);
  return id;
};

testsRouter.get('/', (req, res) => {
  const { subject_id: subjectId } = req.query;
  res.json({ tests: listTests(studentId(), { subjectId: subjectId ? asId(subjectId, 'subject_id') : undefined }) });
});

testsRouter.post(
  '/',
  asyncRoute((req, res) => {
    res.status(201).json({ test: createTest(studentId(), req.body) });
  })
);

testsRouter.get(
  '/:id',
  asyncRoute((req, res) => {
    res.json({ test: getTest(studentId(), asId(req.params.id)) });
  })
);

testsRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    res.json({ test: updateTest(studentId(), asId(req.params.id), req.body) });
  })
);

testsRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteTest(studentId(), asId(req.params.id)));
  })
);

/** Replaces the whole per-question breakdown for a test in one go. */
testsRouter.put(
  '/:id/results',
  asyncRoute((req, res) => {
    res.json({ test: setTestResults(studentId(), asId(req.params.id), req.body.results ?? []) });
  })
);

testsRouter.patch(
  '/:id/results/:resultId',
  asyncRoute((req, res) => {
    res.json({
      test: updateTestResult(studentId(), asId(req.params.id), asId(req.params.resultId, 'resultId'), req.body),
    });
  })
);

testsRouter.delete(
  '/:id/results/:resultId',
  asyncRoute((req, res) => {
    res.json({
      test: deleteTestResult(studentId(), asId(req.params.id), asId(req.params.resultId, 'resultId')),
    });
  })
);
