export const ANCHOR_TYPES = ['school', 'coaching', 'sport', 'meal', 'family', 'sleep', 'exam', 'other'];

/**
 * Commitments are background, not content: muted washes that a study block can
 * sit against without competing with it.
 */
export const ANCHOR_STYLES = {
  school: { label: 'School', tint: '#3f7fa8' },
  coaching: { label: 'Coaching', tint: '#7c6bb0' },
  sport: { label: 'Sport', tint: '#4f8a73' },
  meal: { label: 'Meal', tint: '#c07a3e' },
  family: { label: 'Family', tint: '#b05f7a' },
  sleep: { label: 'Sleep', tint: '#6f7a8a' },
  exam: { label: 'Exam', tint: '#c0392b' },
  other: { label: 'Other', tint: '#8b91a1' },
};

export const anchorStyle = (type) => ANCHOR_STYLES[type] ?? ANCHOR_STYLES.other;

export const REVISION_LABELS = {
  '1day': 'next day',
  '3day': 'three days later',
  '1week': 'a week later',
};
