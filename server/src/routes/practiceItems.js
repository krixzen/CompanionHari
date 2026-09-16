import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  STAGES,
  generateMasterListForSubject,
  listMasterList,
  markPracticeItem,
  updatePracticeItem,
} from '../services/practiceItemService.js';

export const practiceItemsRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a valid id.');
  return id;
};

practiceItemsRouter.get('/', (req, res) => {
  const { subject_id: subjectId, topic_id: topicId, status } = req.query;
  res.json({
    items: listMasterList(studentId(), {
      subjectId: subjectId ? asId(subjectId) : undefined,
      topicId: topicId ? asId(topicId) : undefined,
      status: status || undefined,
    }),
    stages: STAGES,
  });
});

practiceItemsRouter.post(
  '/generate',
  asyncRoute((req, res) => {
    const subjectId = asId(req.body.subject_id);
    res.json({ items: generateMasterListForSubject(studentId(), subjectId) });
  })
);

practiceItemsRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    res.json({ item: updatePracticeItem(studentId(), asId(req.params.id), req.body) });
  })
);

practiceItemsRouter.post(
  '/:id/mark',
  asyncRoute((req, res) => {
    res.json({ item: markPracticeItem(studentId(), asId(req.params.id), Boolean(req.body.done)) });
  })
);
