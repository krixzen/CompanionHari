import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  addStudyBlock,
  deleteStudyBlock,
  listStudyBlocks,
  saveStudyBlocks,
  updateStudyBlock,
} from '../services/studyBlockService.js';

export const studyBlocksRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a valid id.');
  return id;
};

studyBlocksRouter.get('/', (req, res) => {
  res.json({ blocks: listStudyBlocks(studentId()) });
});

/** Replaces the whole set in one go — the save behind the review screen. */
studyBlocksRouter.put(
  '/',
  asyncRoute((req, res) => {
    res.json({ blocks: saveStudyBlocks(studentId(), req.body.blocks) });
  })
);

studyBlocksRouter.post(
  '/',
  asyncRoute((req, res) => {
    res.status(201).json({ block: addStudyBlock(studentId(), req.body) });
  })
);

studyBlocksRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    res.json({ block: updateStudyBlock(studentId(), asId(req.params.id), req.body) });
  })
);

studyBlocksRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteStudyBlock(studentId(), asId(req.params.id)));
  })
);
