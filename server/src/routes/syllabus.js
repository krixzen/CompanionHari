import { Router } from 'express';
import multer from 'multer';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import { extractText } from '../services/fileText.js';
import { UNIT_HANDLING, parseSyllabus } from '../services/syllabusParser.js';

export const syllabusRouter = Router();

// Files are held in memory, parsed, and thrown away — nothing is written to
// disk and nothing leaves this machine.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const readOptions = (source) => {
  const unitHandling = source.unitHandling ?? source.unit_handling;
  if (unitHandling !== undefined && !UNIT_HANDLING.includes(unitHandling)) {
    throw badRequest(`"unitHandling" must be one of: ${UNIT_HANDLING.join(', ')}.`);
  }
  const splitColonLists = source.splitColonLists ?? source.split_colon_lists;

  return {
    ...(unitHandling !== undefined ? { unitHandling } : {}),
    ...(splitColonLists !== undefined
      ? { splitColonLists: splitColonLists === true || splitColonLists === 'true' }
      : {}),
  };
};

/**
 * Reads a syllabus file or pasted text and returns a suggested topic list.
 * Nothing is saved here — the review screen decides what actually gets kept.
 */
syllabusRouter.post(
  '/parse',
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const pastedText = typeof req.body.text === 'string' ? req.body.text : '';

    if (!req.file && !pastedText.trim()) {
      throw badRequest('Choose a file or paste some syllabus text first.');
    }

    const text = req.file
      ? await extractText(req.file.buffer, req.file.originalname)
      : pastedText;

    const result = parseSyllabus(text, readOptions(req.body));

    res.json({
      ...result,
      // Returned so the review screen can re-parse with different settings
      // without asking for the file again.
      sourceText: text.slice(0, 500000),
      sourceName: req.file ? req.file.originalname : 'Pasted text',
    });
  })
);
