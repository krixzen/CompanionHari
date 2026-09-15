import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  ERROR_TAGS,
  createErrorNote,
  deleteErrorNote,
  listErrorNotes,
  tagBreakdown,
  updateErrorNote,
} from '../services/errorNoteService.js';

export const errorNotesRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a valid id.');
  return id;
};

errorNotesRouter.get('/', (req, res) => {
  const { subject_id: subjectId, tag, due } = req.query;
  res.json({
    notes: listErrorNotes(studentId(), {
      subjectId: subjectId ? asId(subjectId) : undefined,
      tag: tag || undefined,
      dueOnly: due === 'true',
    }),
    tags: ERROR_TAGS,
  });
});

// Declared before /:id so "summary" is never read as an id.
errorNotesRouter.get('/summary', (req, res) => {
  res.json({ counts: tagBreakdown(studentId(), { from: req.query.from, to: req.query.to }) });
});

errorNotesRouter.post(
  '/',
  asyncRoute((req, res) => {
    res.status(201).json({ note: createErrorNote(studentId(), req.body) });
  })
);

errorNotesRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    res.json({ note: updateErrorNote(studentId(), asId(req.params.id), req.body) });
  })
);

errorNotesRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteErrorNote(studentId(), asId(req.params.id)));
  })
);
