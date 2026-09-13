import { Router } from 'express';
import { asyncRoute } from '../lib/httpError.js';
import { getPlannerSettings, savePlannerSettings } from '../services/settingsService.js';

export const settingsRouter = Router();

settingsRouter.get('/planner', (req, res) => {
  res.json({ settings: getPlannerSettings() });
});

settingsRouter.patch(
  '/planner',
  asyncRoute((req, res) => {
    res.json({ settings: savePlannerSettings(req.body) });
  })
);
