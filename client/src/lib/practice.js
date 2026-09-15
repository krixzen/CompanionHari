/**
 * The five-stage chapter practice cycle and the error notebook's four-tag
 * classification — both borrowed directly from the practice-plan document
 * this was built from, so the labels and guidance text stay in the
 * student's own words rather than being re-invented.
 */
export const PRACTICE_STAGES = [
  { value: 1, label: 'NCERT solved examples', short: 'Examples' },
  { value: 2, label: 'NCERT exercises', short: 'Exercises' },
  { value: 3, label: 'Module (Aakash etc.)', short: 'Module' },
  { value: 4, label: 'Previous-year questions', short: 'PYQs' },
  { value: 5, label: 'Timed sets', short: 'Timed sets' },
];

export const PRACTICE_STAGE_LABELS = Object.fromEntries(
  PRACTICE_STAGES.map((stage) => [stage.value, stage.label])
);

export const ERROR_TAGS = [
  { value: 'C', label: 'Concept gap', hint: 'Did not know the idea — go back to theory.' },
  { value: 'A', label: 'Application gap', hint: 'Knew the idea, could not deploy it — more varied problems.' },
  { value: 'S', label: 'Silly slip', hint: 'Calculation or sign error — slow down, write cleaner steps.' },
  { value: 'T', label: 'Time', hint: 'Would have got it with more minutes — the earlier rungs are not automatic yet.' },
];

export const ERROR_TAG_META = Object.fromEntries(ERROR_TAGS.map((tag) => [tag.value, tag]));
