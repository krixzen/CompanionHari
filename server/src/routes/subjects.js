import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  createSubject,
  deleteSubject,
  getSubject,
  listSubjects,
  reorderSubjects,
  updateSubject,
} from '../services/subjectService.js';
import { optionalColour, optionalString, requireString } from '../lib/validate.js';

export const subjectsRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`"${label}" must be a number.`);
  return id;
};

subjectsRouter.get('/', (req, res) => {
  res.json({ subjects: listSubjects(studentId()) });
});

subjectsRouter.get(
  '/:id',
  asyncRoute((req, res) => {
    res.json({ subject: getSubject(studentId(), asId(req.params.id, 'id')) });
  })
);

subjectsRouter.post(
  '/',
  asyncRoute((req, res) => {
    const subject = createSubject(studentId(), {
      name: requireString(req.body, 'name', { max: 80 }),
      colour: optionalColour(req.body, 'colour'),
      code: optionalString(req.body, 'code', { max: 8 }),
    });
    res.status(201).json({ subject });
  })
);

// Reorder is declared before /:id so "reorder" is never read as an id.
subjectsRouter.post(
  '/reorder',
  asyncRoute((req, res) => {
    if (!Array.isArray(req.body.order)) throw badRequest('"order" must be a list of subject ids.');
    const order = req.body.order.map((id) => asId(id, 'order'));
    res.json({ subjects: reorderSubjects(studentId(), order) });
  })
);

subjectsRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    const subject = updateSubject(studentId(), asId(req.params.id, 'id'), {
      name: optionalString(req.body, 'name', { max: 80 }) ?? undefined,
      colour: optionalColour(req.body, 'colour'),
      code: optionalString(req.body, 'code', { max: 8 }) ?? undefined,
    });
    res.json({ subject });
  })
);

subjectsRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteSubject(studentId(), asId(req.params.id, 'id')));
  })
);
