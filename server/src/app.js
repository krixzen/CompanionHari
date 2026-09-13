import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import { config } from './config.js';
import { createApiRouter } from './routes/index.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(morgan('dev'));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      database: path.basename(config.databasePath),
    });
  });

  app.use('/api', createApiRouter());

  // Anything under /api that we do not recognise is a 404 in JSON, not HTML.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
  });

  // Central error handler so route handlers can simply throw.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // multer reports an oversized upload with its own error code.
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'That file is larger than 10 MB. Syllabus outlines are usually much smaller — check you have not uploaded a textbook.' });
    }
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    return res.status(status).json({ error: err.message || 'Something went wrong on the server.' });
  });

  return app;
}
