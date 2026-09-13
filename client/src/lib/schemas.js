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
