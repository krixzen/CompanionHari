/**
 * A very small JSON Schema checker, written so that its error messages read
 * like a person wrote them. It only covers the keywords the app's prompts
 * actually use — enough to catch a paste that came back in the wrong shape,
 * without pulling in a validation library.
 */

/** Removes ```json fences and any stray prose before a { or [. */
function stripCodeFences(raw) {
  let text = String(raw ?? '').trim();

  const fence = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) text = fence[1].trim();
  else text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim();

  // Chat models often wrap the JSON in a sentence or two.
  const firstBrace = text.search(/[{[]/);
  if (firstBrace > 0) {
    const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (lastBrace > firstBrace) text = text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function describe(value) {
  if (value === null) return 'nothing';
  if (Array.isArray(value)) return 'a list';
  switch (typeof value) {
    case 'string':
      return 'text';
    case 'number':
      return 'a number';
    case 'boolean':
      return 'true or false';
    case 'object':
      return 'an object';
    default:
      return 'something unexpected';
  }
}

const EXPECTED = {
  object: 'an object',
  array: 'a list',
  string: 'text',
  number: 'a number',
  integer: 'a whole number',
  boolean: 'true or false',
  null: 'nothing',
};

function matchesType(value, type) {
  switch (type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

/** Turns an internal path into something readable at the start of a sentence. */
const label = (path) => path || 'The response';

function check(value, schema, path, errors) {
  if (!schema) return;

  const types = schema.type ? [].concat(schema.type) : null;

  if (types && !types.some((type) => matchesType(value, type))) {
    const wanted = types.map((type) => EXPECTED[type] ?? type).join(' or ');
    errors.push(`${label(path)} should be ${wanted}, but ${describe(value)} was given.`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${label(path)} should be one of: ${schema.enum.join(', ')}.`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) {
      errors.push(`${label(path)} is too short — it needs at least ${schema.minLength} characters.`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${label(path)} is too long — keep it under ${schema.maxLength} characters.`);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${label(path)} should be at least ${schema.minimum}.`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${label(path)} should be at most ${schema.maximum}.`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(
        `${label(path)} needs at least ${schema.minItems} ${schema.minItems === 1 ? 'item' : 'items'}, but has ${value.length}.`
      );
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(
        `${label(path)} has ${value.length} items, which is more than the ${schema.maxItems} allowed.`
      );
    }
    if (schema.items) {
      value.forEach((item, index) => check(item, schema.items, `${path}[${index}]`, errors));
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) errors.push(`${label(path)} is missing "${key}".`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (value[key] === undefined) continue;
      check(value[key], childSchema, path ? `${path}.${key}` : key, errors);
    }
  }
}

/**
 * Parses pasted text and checks it against a schema.
 * Returns { ok, data, errors } — errors are complete sentences, ready to show.
 *
 * `sanitize`, when given, runs on the parsed JSON before validation — for a
 * caller where one malformed item in an otherwise-good list (a stray
 * duration of 0, say) shouldn't fail the whole reply, it can drop just
 * that item rather than the caller having to discard everything and ask
 * again. Every other caller leaves this out and behaves exactly as before.
 */
export function parseAndValidate(rawText, schema, sanitize) {
  const text = stripCodeFences(rawText);

  if (!text) {
    return { ok: false, data: null, errors: ['There is nothing pasted in yet.'] };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const position = Number(String(error.message).match(/position (\d+)/)?.[1]);
    const hint = Number.isFinite(position)
      ? ` The problem starts around character ${position}: “${text.slice(Math.max(0, position - 25), position + 25).trim()}”.`
      : '';
    return {
      ok: false,
      data: null,
      errors: [
        `That is not valid JSON, so it could not be read.${hint}`,
        'Copy the whole reply again — it usually means a bracket or a comma is missing, or part of the answer was cut off.',
      ],
    };
  }

  if (typeof sanitize === 'function') {
    try {
      data = sanitize(data);
    } catch {
      // A sanitizer that itself chokes on the shape just means the reply is
      // genuinely too malformed to help with — fall through to the normal
      // check below, which will report that properly.
    }
  }

  const errors = [];
  check(data, schema, '', errors);

  // Long lists of the same mistake are noise; the first few make the point.
  const trimmed = errors.slice(0, 8);
  if (errors.length > trimmed.length) {
    trimmed.push(`…and ${errors.length - trimmed.length} more problems like these.`);
  }

  return { ok: trimmed.length === 0, data: trimmed.length === 0 ? data : null, errors: trimmed };
}
