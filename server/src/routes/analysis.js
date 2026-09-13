import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  ANALYSIS_TYPES,
  createAnalysis,
  deleteAnalysis,
  getAnalysis,
  listAnalyses,
} from '../services/analysisService.js';

export const analysisRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a valid id.');
  return id;
};

analysisRouter.get('/', (req, res) => {
  const { test_id: testId, type } = req.query;
  if (type && !ANALYSIS_TYPES.includes(type)) {
    throw badRequest(`"type" must be one of: ${ANALYSIS_TYPES.join(', ')}.`);
  }
  res.json({ analyses: listAnalyses(studentId(), { testId: testId ? asId(testId) : undefined, type }) });
});

analysisRouter.post(
  '/',
  asyncRoute((req, res) => {
    res.status(201).json({ analysis: createAnalysis(studentId(), req.body) });
  })
);

analysisRouter.get(
  '/:id',
  asyncRoute((req, res) => {
    res.json({ analysis: getAnalysis(studentId(), asId(req.params.id)) });
  })
);

analysisRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteAnalysis(studentId(), asId(req.params.id)));
  })
);
