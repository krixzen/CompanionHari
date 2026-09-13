import { badRequest } from './httpError.js';

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function requireString(body, field, { max = 500, trim = true } = {}) {
  const raw = body[field];
  if (typeof raw !== 'string' || (trim ? raw.trim() : raw).length === 0) {
    throw badRequest(`"${field}" is required.`);
  }
  const value = trim ? raw.trim() : raw;
  if (value.length > max) throw badRequest(`"${field}" must be ${max} characters or fewer.`);
  return value;
}

export function optionalString(body, field, { max = 5000 } = {}) {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw badRequest(`"${field}" must be text.`);
  if (raw.length > max) throw badRequest(`"${field}" must be ${max} characters or fewer.`);
  return raw.trim();
}

export function optionalInteger(body, field, { min, max } = {}) {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw badRequest(`"${field}" must be a whole number.`);
  if (min !== undefined && value < min) throw badRequest(`"${field}" must be at least ${min}.`);
  if (max !== undefined && value > max) throw badRequest(`"${field}" must be at most ${max}.`);
  return value;
}

export function optionalEnum(body, field, allowed) {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (!allowed.includes(raw)) {
    throw badRequest(`"${field}" must be one of: ${allowed.join(', ')}.`);
  }
  return raw;
}

/** ISO date, 'YYYY-MM-DD'. Empty string clears the field. */
export function optionalDate(body, field) {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw badRequest(`"${field}" must be a date like 2026-03-14.`);
  }
  return raw;
}

export function optionalStringArray(body, field, { maxItems = 200, maxLength = 500 } = {}) {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (raw === null) return [];
  if (!Array.isArray(raw)) throw badRequest(`"${field}" must be a list.`);
  if (raw.length > maxItems) throw badRequest(`"${field}" can hold at most ${maxItems} items.`);
  return raw
    .map((item) => {
      if (typeof item !== 'string') throw badRequest(`Every item in "${field}" must be text.`);
      return item.trim();
    })
    .filter(Boolean)
    .map((item) => item.slice(0, maxLength));
}

export function requireObject(body, field) {
  const raw = body[field];
  if (!isPlainObject(raw)) throw badRequest(`"${field}" must be an object.`);
  return raw;
}

/** #RGB or #RRGGBB. */
export function optionalColour(body, field) {
  const raw = body[field];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.trim())) {
    throw badRequest(`"${field}" must be a colour like #4f8a73.`);
  }
  return raw.trim().toLowerCase();
}
