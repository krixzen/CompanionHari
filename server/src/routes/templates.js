import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import { ANCHOR_TYPES } from '../services/anchorService.js';
import {
  addBlock,
  assignWeeks,
  createTemplate,
  deleteBlock,
  deleteTemplate,
  listTemplates,
  renameTemplate,
  unassignWeeks,
  updateBlock,
} from '../services/templateService.js';

export const templatesRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a valid id.');
  return id;
};

const readBlock = (body) => ({
  label: body.label,
  type: body.type,
  day_of_week: body.day_of_week === undefined ? undefined : Number(body.day_of_week),
  start_time: body.start_time,
  end_time: body.end_time,
  ...(body.is_active === undefined ? {} : { is_active: body.is_active }),
  ...(body.buffer_after_minutes === undefined ? {} : { buffer_after_minutes: body.buffer_after_minutes }),
});

templatesRouter.get('/', (req, res) => {
  res.json({ templates: listTemplates(studentId()), types: ANCHOR_TYPES });
});

templatesRouter.post(
  '/',
  asyncRoute((req, res) => {
    res.status(201).json({ template: createTemplate(studentId(), { name: req.body.name }) });
  })
);

templatesRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    res.json({ template: renameTemplate(studentId(), asId(req.params.id), req.body.name) });
  })
);

templatesRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteTemplate(studentId(), asId(req.params.id)));
  })
);

templatesRouter.post(
  '/:id/blocks',
  asyncRoute((req, res) => {
    res.status(201).json({ block: addBlock(studentId(), asId(req.params.id), readBlock(req.body)) });
  })
);

templatesRouter.patch(
  '/:id/blocks/:blockId',
  asyncRoute((req, res) => {
    const changes = Object.fromEntries(
      Object.entries(readBlock(req.body)).filter(([, value]) => value !== undefined)
    );
    res.json({ block: updateBlock(studentId(), asId(req.params.id), asId(req.params.blockId), changes) });
  })
);

templatesRouter.delete(
  '/:id/blocks/:blockId',
  asyncRoute((req, res) => {
    res.json(deleteBlock(studentId(), asId(req.params.id), asId(req.params.blockId)));
  })
);

templatesRouter.post(
  '/:id/assign',
  asyncRoute((req, res) => {
    res.json({ templates: assignWeeks(studentId(), asId(req.params.id), req.body.weeks) });
  })
);

templatesRouter.post(
  '/unassign',
  asyncRoute((req, res) => {
    res.json({ templates: unassignWeeks(studentId(), req.body.weeks) });
  })
);
