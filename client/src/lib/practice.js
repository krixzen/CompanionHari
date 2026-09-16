/**
 * The five-stage chapter practice cycle — the master list's own shape —
 * and the error notebook's four-tag classification. Both borrowed
 * directly from the practice-plan document this was built from, so the
 * labels and guidance text stay in the student's own words rather than
 * being re-invented. Stage metadata mirrors STAGES in the server's
 * practiceItemService.js; only the label/short text needs to match, since
 * estimated_minutes defaults are set once when a row is created and then
 * freely editable.
 */
export const STAGES = [
  { stage: 1, label: 'NCERT solved examples', short: 'Examples' },
  { stage: 2, label: 'NCERT exercises', short: 'Exercises' },
  { stage: 3, label: 'Module (Aakash etc.)', short: 'Module' },
  { stage: 4, label: 'Previous-year questions', short: 'PYQs' },
  { stage: 5, label: 'Timed set', short: 'Timed set' },
];

export const STAGE_META = Object.fromEntries(STAGES.map((s) => [s.stage, s]));

export const ERROR_TAGS = [
  { value: 'C', label: 'Concept gap', hint: 'Did not know the idea — go back to theory.' },
  { value: 'A', label: 'Application gap', hint: 'Knew the idea, could not deploy it — more varied problems.' },
  { value: 'S', label: 'Silly slip', hint: 'Calculation or sign error — slow down, write cleaner steps.' },
  { value: 'T', label: 'Time', hint: 'Would have got it with more minutes — the earlier rungs are not automatic yet.' },
];

export const ERROR_TAG_META = Object.fromEntries(ERROR_TAGS.map((tag) => [tag.value, tag]));
