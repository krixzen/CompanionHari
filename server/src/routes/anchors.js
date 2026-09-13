import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import { addDays, datesBetween, isIsoDate, startOfWeek, todayIso } from '../lib/time.js';
import {
  ANCHOR_TYPES,
  addStarterWeek,
  createAnchor,
  deleteAnchor,
  listAnchors,
  updateAnchor,
} from '../services/anchorService.js';
import { resolveEffectiveAnchors } from '../services/templateService.js';

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
  ...(body.effective_from === undefined ? {} : { effective_from: body.effective_from }),
  ...(body.effective_until === undefined ? {} : { effective_until: body.effective_until }),
});

anchorsRouter.get('/', (req, res) => {
  res.json({ anchors: listAnchors(studentId()), types: ANCHOR_TYPES });
});

// The resolved picture for a stretch of the calendar: whichever week
// template governs each date, plus any one-off extras layered on top.
// Declared before /:id so "effective" is never read as an id — though
// there is no GET /:id today, this keeps the file consistent if one is
// ever added.
anchorsRouter.get(
  '/effective',
  asyncRoute((req, res) => {
    const from = req.query.from ?? startOfWeek(todayIso());
    const to = req.query.to ?? addDays(from, 6);
    if (!isIsoDate(from) || !isIsoDate(to)) throw badRequest('Dates should look like 2026-09-14.');
    res.json({ anchors: resolveEffectiveAnchors(studentId(), datesBetween(from, to)) });
  })
);

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
