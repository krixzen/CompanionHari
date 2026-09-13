/**
 * Chart and subject colours. Mirrors server/src/lib/palette.js.
 *
 * None of these were picked by eye. The categorical set is eight hues in a
 * fixed order, validated so that every neighbouring pair stays apart under
 * simulated protanopia and deuteranopia as well as normal vision, sits inside
 * the lightness band, clears the chroma floor and reaches 3:1 against white.
 * The order is the safety mechanism: subjects take slots in sequence, and the
 * list is never cycled past eight.
 *
 * The worst neighbouring pair sits in the 6–8 band, which is only allowed when
 * something other than colour also tells marks apart. Everywhere these colours
 * appear there is a label doing that job: tracking numbers on calendar blocks,
 * subject names beside every chart bar, titles on the small multiples.
 */
export const SUBJECT_PALETTE = [
  '#3973bc',
  '#bb5e3b',
  '#009364',
  '#b27802',
  '#bc5c81',
  '#3a8035',
  '#5c57ab',
  '#b7544f',
];

/**
 * Topic status is a progression, not a set of names, so it takes a single hue
 * stepped light to dark rather than four separate colours. Validated for
 * monotone lightness, visible gaps between steps, and a light end that still
 * shows up against white.
 */
export const STATUS_RAMP = {
  not_started: '#93bcaa',
  in_progress: '#76a893',
  revised: '#58957d',
  mastered: '#378267',
};

/**
 * One hue for magnitude, where colour carries no identity. Two steps of it:
 * the lighter one for the run of bars, the darker to pick out the one worth
 * noticing. Both clear 3:1 against white on their own.
 */
export const MARK = '#2f6b52';
export const MARK_SOFT = '#58957d';

export const CHART_INK = {
  surface: '#ffffff',
  grid: 'rgba(47, 53, 66, 0.10)',
  primary: '#2f3542',
  secondary: '#5a6172',
  muted: '#8b91a1',
};
