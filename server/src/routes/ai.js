import { Router } from 'express';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import { completeWithAnthropic } from '../services/aiService.js';

export const aiRouter = Router();

aiRouter.post(
  '/complete',
  asyncRoute(async (req, res) => {
    const prompt = req.body?.prompt;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw badRequest('No prompt was given.');
    }
    const text = await completeWithAnthropic(prompt, req.body?.pin);
    res.json({ text });
  })
);
