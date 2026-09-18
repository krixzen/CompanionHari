import { Router } from 'express';
import { asyncRoute } from '../lib/httpError.js';
import {
  getAiSettings,
  getPlannerSettings,
  getTermSettings,
  savePlannerSettings,
  saveAiSettings,
  saveTermSettings,
} from '../services/settingsService.js';

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

settingsRouter.get('/term', (req, res) => {
  res.json({ settings: getTermSettings() });
});

settingsRouter.patch(
  '/term',
  asyncRoute((req, res) => {
    res.json({ settings: saveTermSettings(req.body) });
  })
);

settingsRouter.get('/ai', (req, res) => {
  res.json({ settings: getAiSettings() });
});

settingsRouter.patch(
  '/ai',
  asyncRoute((req, res) => {
    res.json({ settings: saveAiSettings(req.body) });
  })
);
