import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  createSession,
  deleteSession,
  listSessions,
  sessionForPlanEntry,
  updateSession,
} from '../services/sessionService.js';

export const sessionsRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a valid id.');
  return id;
};

sessionsRouter.get('/', (req, res) => {
  res.json(
    listSessions(studentId(), {
      limit: req.query.limit,
      offset: req.query.offset,
      topicId: req.query.topic_id,
      from: req.query.from,
      to: req.query.to,
    })
  );
});

sessionsRouter.get(
  '/for-plan-entry/:id',
  asyncRoute((req, res) => {
    res.json({ session: sessionForPlanEntry(studentId(), asId(req.params.id)) });
  })
);

sessionsRouter.post(
  '/',
  asyncRoute((req, res) => {
    res.status(201).json(createSession(studentId(), req.body));
  })
);

sessionsRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    res.json(updateSession(studentId(), asId(req.params.id), req.body));
  })
);

sessionsRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteSession(studentId(), asId(req.params.id)));
  })
);
