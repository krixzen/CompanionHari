/**
 * Subject colours.
 *
 * These are not picked by eye. They come from a validated categorical palette:
 * eight hues in a fixed order, each inside the lightness band and above the
 * chroma floor, with every neighbouring pair kept apart under simulated
 * protanopia and deuteranopia as well as normal vision.
 *
 * The order is the safety mechanism, so subjects are given colours by their
 * position rather than by preference — slot 1 to the first subject, slot 2 to
 * the second, and so on. Skipping around the list is what breaks the guarantee.
 *
 * The worst neighbouring pair sits in the 6–8 band, which is only allowed
 * alongside a second way of telling marks apart. Everything that uses these
 * colours also carries a label: tracking numbers on calendar blocks, subject
 * names on chart bars, panel titles on the small multiples.
 */
export const SUBJECT_PALETTE = [
  '#3973bc', // blue
  '#bb5e3b', // rust
  '#009364', // green
  '#b27802', // amber
  '#bc5c81', // rose
  '#3a8035', // leaf
  '#5c57ab', // violet
  '#b7544f', // brick
];

/** The colour a subject in this position should get. */
export const colourForPosition = (position) =>
  SUBJECT_PALETTE[((position % SUBJECT_PALETTE.length) + SUBJECT_PALETTE.length) % SUBJECT_PALETTE.length];
