import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  ANCHOR_TYPES,
  addStarterWeek,
  createAnchor,
  deleteAnchor,
  listAnchors,
  updateAnchor,
} from '../services/anchorService.js';

export const anchorsRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a valid id.');
  return id;
};

const readAnchor = (body) => ({
  label: body.label,
  type: body.type,
  day_of_week: body.day_of_week === undefined ? undefined : Number(body.day_of_week),
  start_time: body.start_time,
  end_time: body.end_time,
  ...(body.is_active === undefined ? {} : { is_active: body.is_active }),
});

anchorsRouter.get('/', (req, res) => {
  res.json({ anchors: listAnchors(studentId()), types: ANCHOR_TYPES });
});

anchorsRouter.post(
  '/',
  asyncRoute((req, res) => {
    res.status(201).json({ anchor: createAnchor(studentId(), readAnchor(req.body)) });
  })
);

// Declared before /:id so "starter-week" is never read as an id.
anchorsRouter.post(
  '/starter-week',
  asyncRoute((req, res) => {
    res.status(201).json({ anchors: addStarterWeek(studentId()) });
  })
);

anchorsRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    const changes = Object.fromEntries(
      Object.entries(readAnchor(req.body)).filter(([, value]) => value !== undefined)
    );
    res.json({ anchor: updateAnchor(studentId(), asId(req.params.id), changes) });
  })
);

anchorsRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteAnchor(studentId(), asId(req.params.id)));
  })
);
