import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  deleteSnapshot,
  gapReport,
  listSnapshots,
  saveSnapshot,
} from '../services/scheduleSnapshotService.js';

export const scheduleSnapshotsRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a valid id.');
  return id;
};

scheduleSnapshotsRouter.get('/', (req, res) => {
  res.json({ snapshots: listSnapshots(studentId()) });
});

scheduleSnapshotsRouter.post(
  '/',
  asyncRoute((req, res) => {
    res.status(201).json({ snapshot: saveSnapshot(studentId(), req.body.label) });
  })
);

scheduleSnapshotsRouter.get(
  '/:id/gap-report',
  asyncRoute((req, res) => {
    res.json(gapReport(studentId(), asId(req.params.id)));
  })
);

scheduleSnapshotsRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteSnapshot(studentId(), asId(req.params.id)));
  })
);
