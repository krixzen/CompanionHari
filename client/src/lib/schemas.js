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
          tracking_number: { type: ['string', 'null'], maxLength: 20 },
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
    behavioural_goals: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        required: ['goal', 'how_to_measure'],
        properties: {
          goal: { type: 'string', maxLength: 200 },
          how_to_measure: { type: 'string', maxLength: 200 },
        },
      },
    },
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

const isoDayCount = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

/**
 * meals and personal_time are asked for on every single day of the stretch
 * (three meals each, plus whatever family/leisure time), so their caps have
 * to scale with how many days are actually being planned — a fixed cap
 * sized for a one-week reply silently rejects an honest, correct reply for
 * a two-week-or-longer one. `from`/`to` are optional so existing callers
 * that already had a schema in hand keep working against a generous
 * default; pass the real range to size it exactly.
 */
export function schedulePlanSchema(from, to) {
  const days = from && to ? Math.max(isoDayCount(from, to), 1) : 30;

  return {
    type: 'object',
    required: ['entries'],
    properties: {
      gap_note: { type: ['string', 'null'], maxLength: 300 },
      entries: {
        type: 'array',
        minItems: 0,
        maxItems: 200,
        items: {
          type: 'object',
          required: ['item_reference', 'date', 'start_time', 'duration_minutes'],
          properties: {
            item_reference: { type: 'string', maxLength: 24 },
            date: { type: 'string', minLength: 10, maxLength: 10 },
            start_time: { type: 'string', minLength: 4, maxLength: 5 },
            duration_minutes: { type: 'integer', minimum: 5, maximum: 480 },
            note: { type: ['string', 'null'], maxLength: 200 },
          },
        },
      },
      meals: {
        type: 'array',
        maxItems: days * 3 + 5,
        items: {
          type: 'object',
          required: ['date', 'label', 'start_time', 'end_time'],
          properties: {
            date: { type: 'string', minLength: 10, maxLength: 10 },
            label: { type: 'string', maxLength: 40 },
            start_time: { type: 'string', minLength: 4, maxLength: 5 },
            end_time: { type: 'string', minLength: 4, maxLength: 5 },
          },
        },
      },
      personal_time: {
        type: 'array',
        maxItems: days * 4 + 5,
        items: {
          type: 'object',
          required: ['date', 'label', 'kind', 'start_time', 'end_time'],
          properties: {
            date: { type: 'string', minLength: 10, maxLength: 10 },
            label: { type: 'string', maxLength: 40 },
            kind: { type: 'string', enum: ['family', 'leisure'] },
            start_time: { type: 'string', minLength: 4, maxLength: 5 },
            end_time: { type: 'string', minLength: 4, maxLength: 5 },
          },
        },
      },
    },
  };
}

/**
 * The weekly shape of study time itself — which windows are for studying
 * at all, before any subject gets scheduled into them. `note` is a short
 * reason a block suits the kind of work it's meant for ("longest block —
 * good for deep practice"), shown on the review screen but not saved.
 */
export const studyBlockSchema = {
  type: 'object',
  required: ['blocks'],
  properties: {
    blocks: {
      type: 'array',
      minItems: 0,
      maxItems: 40,
      items: {
        type: 'object',
        required: ['day_of_week', 'start_time', 'end_time'],
        properties: {
          day_of_week: { type: 'integer', minimum: 0, maximum: 6 },
          start_time: { type: 'string', minLength: 4, maxLength: 5 },
          end_time: { type: 'string', minLength: 4, maxLength: 5 },
          note: { type: ['string', 'null'], maxLength: 200 },
        },
      },
    },
  },
};

export const topicEnrichmentSchema = {
  type: 'object',
  required: ['topics'],
  properties: {
    topics: {
      type: 'array',
      minItems: 0,
      maxItems: 20,
      items: {
        type: 'object',
        required: ['tracking_number', 'what_to_understand', 'key_concepts', 'difficulty', 'estimated_hours'],
        properties: {
          tracking_number: { type: 'string', maxLength: 20 },
          what_to_understand: { type: 'string', maxLength: 1500 },
          key_concepts: {
            type: 'array',
            minItems: 1,
            maxItems: 15,
            items: { type: 'string', maxLength: 200 },
          },
          difficulty: { type: 'integer', minimum: 1, maximum: 5 },
          estimated_hours: { type: 'number', minimum: 0.25, maximum: 20 },
          resources: {
            type: 'array',
            maxItems: 6,
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
      },
    },
  },
};
