import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  autoPlan,
  clearRange,
  createPlanEntry,
  deletePlanEntry,
  listPlanEntries,
  listUnscheduledTopics,
  suggestStudySlot,
  updatePlanEntry,
} from '../services/planService.js';
import { startOfWeek, addDays, todayIso } from '../lib/time.js';

export const planRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a valid id.');
  return id;
};

/** Defaults to the week containing today when no range is given. */
function readRange(query) {
  const from = query.from ?? startOfWeek(todayIso());
  const to = query.to ?? addDays(from, 6);
  return { from, to };
}

planRouter.get(
  '/',
  asyncRoute((req, res) => {
    const { from, to } = readRange(req.query);
    res.json({ from, to, entries: listPlanEntries(studentId(), from, to) });
  })
);

planRouter.get('/unscheduled', (req, res) => {
  res.json({ topics: listUnscheduledTopics(studentId()) });
});

planRouter.post(
  '/',
  asyncRoute((req, res) => {
    res.status(201).json(createPlanEntry(studentId(), req.body));
  })
);

planRouter.post(
  '/suggest',
  asyncRoute((req, res) => {
    const topicId = asId(req.body.topic_id);
    res.json({
      suggestion: suggestStudySlot(studentId(), topicId, {
        minutes: req.body.minutes,
        from: req.body.from,
        days: req.body.days,
      }),
    });
  })
);

planRouter.post(
  '/auto',
  asyncRoute((req, res) => {
    const { from, to } = readRange(req.body);
    res.json(autoPlan(studentId(), from, to));
  })
);

planRouter.post(
  '/clear',
  asyncRoute((req, res) => {
    const { from, to } = readRange(req.body);
    res.json(clearRange(studentId(), from, to, { includeCompleted: Boolean(req.body.includeCompleted) }));
  })
);

planRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    res.json(updatePlanEntry(studentId(), asId(req.params.id), req.body));
  })
);

planRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deletePlanEntry(studentId(), asId(req.params.id)));
  })
);
