import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import { addDays, isIsoDate, todayIso } from '../lib/time.js';
import { progressReport } from '../services/progressService.js';

export const progressRouter = Router();

const DEFAULT_DAYS = 28;

progressRouter.get(
  '/',
  asyncRoute((req, res) => {
    const to = req.query.to ?? todayIso();
    const days = Number(req.query.days) || DEFAULT_DAYS;

    if (!Number.isInteger(days) || days < 7 || days > 365) {
      throw badRequest('"days" must be a whole number between 7 and 365.');
    }

    const from = req.query.from ?? addDays(to, -(days - 1));
    if (!isIsoDate(from) || !isIsoDate(to)) throw badRequest('Dates should look like 2026-09-14.');
    if (to < from) throw badRequest('The end of the range comes before the start of it.');

    res.json(progressReport(getCurrentStudent().id, { from, to }));
  })
);
