import { Router } from 'express';
import { getCurrentStudent } from '../db/seed.js';
import { asyncRoute, badRequest } from '../lib/httpError.js';
import {
  TOPIC_STATUSES,
  bulkUpdateTopics,
  createTopics,
  deleteTopic,
  getTopic,
  listTopics,
  reorderTopics,
  updateTopic,
} from '../services/topicService.js';
import {
  optionalDate,
  optionalEnum,
  optionalInteger,
  optionalString,
  optionalStringArray,
  requireString,
} from '../lib/validate.js';

export const topicsRouter = Router();

const studentId = () => getCurrentStudent().id;

const asId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`"${label}" must be a number.`);
  return id;
};

const asIdList = (value, label) => {
  if (!Array.isArray(value)) throw badRequest(`"${label}" must be a list of ids.`);
  return value.map((id) => asId(id, label));
};

/** Reads the editable fields of a topic out of a request body. */
function readTopicFields(body, { requireTitle = false } = {}) {
  const fields = {
    title: requireTitle
      ? requireString(body, 'title', { max: 300 })
      : optionalString(body, 'title', { max: 300 }) ?? undefined,
    unit: optionalString(body, 'unit', { max: 200 }),
    sub_topics: optionalStringArray(body, 'sub_topics'),
    key_concepts: optionalString(body, 'key_concepts', { max: 20000 }),
    allocated_duration_minutes: optionalInteger(body, 'allocated_duration_minutes', {
      min: 5,
      max: 24 * 60,
    }),
    difficulty: optionalInteger(body, 'difficulty', { min: 1, max: 5 }),
    status: optionalEnum(body, 'status', TOPIC_STATUSES),
    target_date: optionalDate(body, 'target_date'),
    notes: optionalString(body, 'notes', { max: 20000 }),
  };

  // Drop anything the caller did not mention so a PATCH stays a partial update.
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

topicsRouter.get('/', (req, res) => {
  const { subject_id: subjectId, status, difficulty, q } = req.query;

  res.json({
    topics: listTopics(studentId(), {
      subjectId: subjectId ? asId(subjectId, 'subject_id') : undefined,
      status: status ? optionalEnum({ status }, 'status', TOPIC_STATUSES) : undefined,
      difficulty: difficulty ? asId(difficulty, 'difficulty') : undefined,
      search: typeof q === 'string' && q.trim() ? q.trim().slice(0, 120) : undefined,
    }),
  });
});

/**
 * Creates one topic, or a whole batch from the syllabus review screen.
 * Body: { subject_id, topics: [...] }  or  { subject_id, title, ... }
 */
topicsRouter.post(
  '/',
  asyncRoute((req, res) => {
    const subjectId = asId(req.body.subject_id, 'subject_id');

    const drafts = Array.isArray(req.body.topics)
      ? req.body.topics.map((draft) => readTopicFields(draft, { requireTitle: true }))
      : [readTopicFields(req.body, { requireTitle: true })];

    if (drafts.length > 500) throw badRequest('That is more than 500 topics — save them in smaller batches.');

    res.status(201).json({ topics: createTopics(studentId(), subjectId, drafts) });
  })
);

topicsRouter.post(
  '/reorder',
  asyncRoute((req, res) => {
    const subjectId = asId(req.body.subject_id, 'subject_id');
    const order = asIdList(req.body.order, 'order');
    res.json({ topics: reorderTopics(studentId(), subjectId, order) });
  })
);

/** Bulk-edit, used for setting the same duration across many topics. */
topicsRouter.patch(
  '/bulk',
  asyncRoute((req, res) => {
    const ids = asIdList(req.body.ids, 'ids');
    if (!ids.length) throw badRequest('No topics were selected.');

    const changes = readTopicFields(req.body.changes ?? {});
    if (!Object.keys(changes).length) throw badRequest('There was nothing to change.');

    res.json({ topics: bulkUpdateTopics(studentId(), ids, changes) });
  })
);

topicsRouter.get(
  '/:id',
  asyncRoute((req, res) => {
    res.json({ topic: getTopic(studentId(), asId(req.params.id, 'id')) });
  })
);

topicsRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    const changes = readTopicFields(req.body);
    res.json({ topic: updateTopic(studentId(), asId(req.params.id, 'id'), changes) });
  })
);

topicsRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    res.json(deleteTopic(studentId(), asId(req.params.id, 'id')));
  })
);
