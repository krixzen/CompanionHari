/**
 * Response shapes the LLM Bridge knows how to check. Each one is both the
 * validation rule and the specification pasted into the prompt, so the two can
 * never drift apart.
 */

export const topicListSchema = {
  type: 'object',
  required: ['topics'],
  properties: {
    topics: {
      type: 'array',
      minItems: 1,
      maxItems: 500,
      items: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 2, maxLength: 300 },
          unit: { type: ['string', 'null'], maxLength: 200 },
          sub_topics: {
            type: 'array',
            maxItems: 60,
            items: { type: 'string', maxLength: 500 },
          },
          difficulty: { type: 'integer', minimum: 1, maximum: 5 },
          allocated_duration_minutes: { type: 'integer', minimum: 5, maximum: 1440 },
        },
      },
    },
  },
};

export const testPatternSchema = {
  type: 'object',
  required: ['overall_summary', 'weak_areas', 'recommendations'],
  properties: {
    overall_summary: { type: 'string', minLength: 10, maxLength: 1000 },
    strengths: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string', maxLength: 200 },
    },
    weak_areas: {
      type: 'array',
      minItems: 0,
      maxItems: 15,
      items: {
        type: 'object',
        required: ['subject', 'issue', 'recommendation'],
        properties: {
          subject: { type: 'string', maxLength: 120 },
          topic: { type: ['string', 'null'], maxLength: 200 },
          issue: { type: 'string', maxLength: 300 },
          recommendation: { type: 'string', maxLength: 300 },
        },
      },
    },
    mistake_pattern: {
      type: 'object',
      properties: {
        careless_errors: { type: 'integer', minimum: 0 },
        concept_gaps: { type: 'integer', minimum: 0 },
        time_pressure_evident: { type: 'boolean' },
        notes: { type: ['string', 'null'], maxLength: 500 },
      },
    },
    recommendations: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: { type: 'string', maxLength: 300 },
    },
  },
};

export const weeklyActionPlanSchema = {
  type: 'object',
  required: ['priorities', 'general_advice'],
  properties: {
    focus_subjects: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 120 },
    },
    priorities: {
      type: 'array',
      minItems: 1,
      maxItems: 15,
      items: {
        type: 'object',
        required: ['topic_title', 'reason'],
        properties: {
          tracking_number: { type: ['string', 'null'], maxLength: 20 },
          topic_title: { type: 'string', maxLength: 300 },
          reason: { type: 'string', maxLength: 300 },
          suggested_minutes: { type: 'integer', minimum: 5, maximum: 480 },
        },
      },
    },
    general_advice: { type: 'string', minLength: 10, maxLength: 1000 },
  },
};

export const topicNotesSchema = {
  type: 'object',
  required: ['key_concepts'],
  properties: {
    key_concepts: { type: 'string', minLength: 10, maxLength: 8000 },
    resources: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          type: { type: ['string', 'null'], maxLength: 40 },
          note: { type: ['string', 'null'], maxLength: 300 },
        },
      },
    },
  },
};

export const schedulePlanSchema = {
  type: 'object',
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      items: {
        type: 'object',
        required: ['tracking_number', 'date', 'start_time', 'duration_minutes'],
        properties: {
          tracking_number: { type: 'string', maxLength: 24 },
          date: { type: 'string', minLength: 10, maxLength: 10 },
          start_time: { type: 'string', minLength: 4, maxLength: 5 },
          duration_minutes: { type: 'integer', minimum: 5, maximum: 480 },
          note: { type: ['string', 'null'], maxLength: 200 },
        },
      },
    },
  },
};
