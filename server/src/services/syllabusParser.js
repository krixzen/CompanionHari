/**
 * Turns the text of a syllabus outline into a reviewable list of topics and
 * sub-topics. No AI, no network: just line-by-line structure detection.
 *
 * The result is deliberately a *suggestion*. It is shown on a review screen
 * and corrected by hand before anything reaches the database, so the parser
 * errs towards keeping content rather than silently dropping it.
 */

const MAX_TOPICS = 500;
const MAX_SUB_TOPICS = 60;
const MAX_TITLE = 300;

export const UNIT_HANDLING = ['auto', 'unit-is-topic', 'unit-is-group'];

const DEFAULT_OPTIONS = {
  unitHandling: 'auto',
  splitColonLists: true,
};

// ---------------------------------------------------------------------------
// 1. Tidy the raw text
// ---------------------------------------------------------------------------

function normaliseText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/ /g, ' ')
    // A word split across a page break by a hyphen: "measure-\nment".
    .replace(/([a-z])-\n([a-z])/g, '$1$2')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim());
}

/** Strips page furniture, dot leaders and repeated running headers. */
function removeNoise(lines) {
  const counts = new Map();
  for (const line of lines) {
    if (line) counts.set(line, (counts.get(line) || 0) + 1);
  }

  const kept = [];
  let skipped = 0;

  for (const original of lines) {
    if (!original) continue;

    // "1. Sets ................ 12"  ->  "1. Sets"
    const line = original.replace(/[.·]{3,}\s*\d{1,4}\s*$/, '').trim();

    if (!line) { skipped += 1; continue; }
    if (/^\d{1,3}$/.test(line)) { skipped += 1; continue; }
    if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(line)) { skipped += 1; continue; }
    if (/^\d+\s*\|\s*page$/i.test(line)) { skipped += 1; continue; }
    if (/^[\s.\-_—–=•*]+$/.test(line)) { skipped += 1; continue; }
    if (/^(contents|table of contents|index|syllabus|course structure|curriculum)$/i.test(line)) {
      skipped += 1;
      continue;
    }
    // A short line appearing on every page is a header or footer.
    if (line.length < 60 && (counts.get(original) || 0) > 3) { skipped += 1; continue; }

    kept.push(line);
  }

  return { lines: kept, skipped };
}

// ---------------------------------------------------------------------------
// 2. Work out what each line is
// ---------------------------------------------------------------------------

const UNIT_RE =
  /^(unit|chapter|module|part|section|theme|paper)\b[\s:.\-–—]*([0-9]{1,3}|[IVXLCDM]{1,6}|[A-Z])?\b[\s:.\-–—]*(.*)$/i;
const NUMBERED_RE = /^(\d{1,3}(?:\.\d{1,3})*)\s*[.)\]:\-–]?\s+(.{2,})$/;
const NUMBERED_BARE_RE = /^(\d{1,2})\s+([A-Za-z].{2,})$/;
const ROMAN_RE = /^\(?([ivxlcdm]{1,6})[.)]\s+(.{2,})$/i;
const LETTER_RE = /^\(?([a-z])[.)]\s+(.{2,})$/i;
const BULLET_RE = /^[-–—•*▪▫◦‣·]\s+(.{2,})$/;
const CAPS_RE = /^[A-Z0-9][A-Z0-9 ,&'()/\-.:]{2,69}$/;

const SUB_LEVEL = 9;

function classify(line) {
  const unit = line.match(UNIT_RE);
  // Only a unit line if there is a number/letter marker or a title after it —
  // otherwise "Section" on its own is just a word.
  if (unit && (unit[2] || unit[3])) {
    const marker = unit[2] ? `${capitalise(unit[1])} ${unit[2].toUpperCase()}` : capitalise(unit[1]);
    const heading = unit[3].trim();
    return {
      kind: 'unit',
      level: 0,
      marker,
      title: CAPS_RE.test(heading) ? titleCaseIfShouting(heading) : heading,
    };
  }

  const bullet = line.match(BULLET_RE);
  if (bullet) return { kind: 'bullet', level: SUB_LEVEL, title: bullet[1].trim() };

  const numbered = line.match(NUMBERED_RE) || line.match(NUMBERED_BARE_RE);
  if (numbered) {
    const depth = numbered[1].split('.').length;
    return { kind: 'numbered', level: depth, marker: numbered[1], title: numbered[2].trim() };
  }

  // Roman numerals are checked before single letters so "iv)" is not read
  // as the letter "i". Single-character markers fall through to LETTER_RE.
  const roman = line.match(ROMAN_RE);
  if (roman && roman[1].length > 1) {
    return { kind: 'roman', level: SUB_LEVEL, marker: roman[1], title: roman[2].trim() };
  }

  const letter = line.match(LETTER_RE);
  if (letter) return { kind: 'letter', level: SUB_LEVEL, marker: letter[1], title: letter[2].trim() };

  if (roman) return { kind: 'roman', level: SUB_LEVEL, marker: roman[1], title: roman[2].trim() };

  if (CAPS_RE.test(line) && /[A-Z]{2}/.test(line)) {
    return { kind: 'caps', level: 1, title: titleCaseIfShouting(line) };
  }

  return { kind: 'text', level: null, title: line };
}

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

const SMALL_WORDS = new Set([
  'and', 'of', 'the', 'in', 'to', 'for', 'a', 'an', 'on', 'with',
  'or', 'is', 'its', 'by', 'from', 'at', 'as',
]);

/**
 * "PHYSICAL WORLD AND MEASUREMENT" reads better as sentence case — but
 * "CLASS XI" and "AI" must not become "Class Xi" and "Ai", so short words
 * that are not ordinary English are left shouting.
 */
function titleCaseIfShouting(line) {
  return line
    .split(' ')
    .map((word, index) => {
      const bare = word.replace(/[^A-Za-z]/g, '');
      const keepUpper =
        /^[IVXLCDM]+$/.test(bare) || (bare.length <= 4 && !SMALL_WORDS.has(bare.toLowerCase()));
      if (keepUpper) return word;

      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// 3. Assemble topics
// ---------------------------------------------------------------------------

const tidyTitle = (title) =>
  title
    .replace(/\s+/g, ' ')
    .replace(/[\s:;,.\-–—]+$/, '')
    .trim()
    .slice(0, MAX_TITLE);

const endsOpen = (line) => !/[.;:!?)\]]$/.test(line) && !/[a-z]\)$/.test(line);

function assemble(items, unitHandling) {
  const groups = [];
  let group = null;
  let topic = null;
  let lastTouched = null; // 'topic' | 'sub' — where a continuation line belongs

  const startGroup = (unitLabel) => {
    group = { unit: unitLabel, topics: [] };
    groups.push(group);
    topic = null;
    return group;
  };

  const startTopic = (title) => {
    if (!group) startGroup(null);
    topic = { unit: group.unit, title: tidyTitle(title), subTopics: [] };
    group.topics.push(topic);
    lastTouched = 'topic';
    return topic;
  };

  const addSubTopic = (title) => {
    if (!topic) {
      // A bullet with nothing above it: the unit heading is the real topic.
      startTopic(group && group.unit ? group.unit : title);
      if (group && group.unit) {
        group.unit = null;
        topic.unit = null;
      } else {
        return;
      }
    }
    topic.subTopics.push(tidyTitle(title));
    lastTouched = 'sub';
  };

  for (const item of items) {
    switch (item.kind) {
      case 'unit': {
        const label = [item.marker, item.title].filter(Boolean).join(' — ');
        if (unitHandling === 'unit-is-topic') {
          startGroup(null);
          startTopic(item.title || item.marker);
        } else {
          startGroup(label);
        }
        break;
      }

      case 'numbered':
      case 'caps': {
        if (unitHandling === 'unit-is-topic' && topic) {
          addSubTopic(item.marker ? `${item.marker} ${item.title}` : item.title);
        } else if (item.level >= 2) {
          addSubTopic(item.title);
        } else {
          startTopic(item.title);
        }
        break;
      }

      case 'bullet':
      case 'letter':
      case 'roman':
        addSubTopic(item.title);
        break;

      case 'text': {
        // Most stray lines are a heading that wrapped. Join them back on.
        const target =
          lastTouched === 'sub' && topic && topic.subTopics.length
            ? { get: () => topic.subTopics[topic.subTopics.length - 1],
                set: (value) => { topic.subTopics[topic.subTopics.length - 1] = value; } }
            : topic
              ? { get: () => topic.title, set: (value) => { topic.title = value; } }
              : null;

        if (target && endsOpen(target.get()) && /^[a-z(]/.test(item.title)) {
          target.set(tidyTitle(`${target.get()} ${item.title}`));
        } else if (topic) {
          addSubTopic(item.title);
        } else {
          startTopic(item.title);
        }
        break;
      }

      default:
        break;
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// 4. Polish
// ---------------------------------------------------------------------------

/** "Sets: finite sets, subsets, power set" -> a title plus three sub-topics. */
function splitColonList(topic) {
  if (topic.subTopics.length) return topic;

  const match = topic.title.match(/^(.{3,90}?)\s*[:–—]\s*(.+)$/);
  if (!match) return topic;

  const parts = match[2]
    .split(/[;,]/)
    .map((part) => tidyTitle(part))
    .filter((part) => part.length >= 3);

  if (parts.length < 2) return topic;

  return { ...topic, title: tidyTitle(match[1]), subTopics: parts };
}

function dedupe(topic) {
  const seen = new Set([topic.title.toLowerCase()]);
  const subTopics = [];
  for (const sub of topic.subTopics) {
    const key = sub.toLowerCase();
    if (!sub || seen.has(key)) continue;
    seen.add(key);
    subTopics.push(sub);
    if (subTopics.length >= MAX_SUB_TOPICS) break;
  }
  return { ...topic, subTopics };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseSyllabus(rawText, options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const warnings = [];

  const { lines, skipped } = removeNoise(normaliseText(rawText));

  if (!lines.length) {
    return {
      topics: [],
      warnings: ['There was no readable text in that file. If it is a scanned PDF, the text will need typing or pasting in by hand.'],
      stats: { lines: 0, topics: 0, subTopics: 0, skippedLines: skipped },
      options: settings,
    };
  }

  const items = lines.map(classify);
  const structured = items.filter((item) => item.kind !== 'text');

  // A plain list with no numbering or bullets at all: every line is a topic.
  if (structured.length === 0) {
    const topics = lines.slice(0, MAX_TOPICS).map((line) => ({
      unit: null,
      title: tidyTitle(line),
      subTopics: [],
    }));
    return {
      topics,
      warnings: ['No numbering or bullets were found, so every line was read as its own topic.'],
      stats: { lines: lines.length, topics: topics.length, subTopics: 0, skippedLines: skipped },
      options: { ...settings, unitHandling: 'unit-is-group' },
    };
  }

  let unitHandling = settings.unitHandling;
  if (unitHandling === 'auto') {
    // If the units contain numbered headings of their own, those headings are
    // the real topics and the units are just groupings.
    const unitCount = items.filter((item) => item.kind === 'unit').length;
    const topLevelHeadings = items.filter(
      (item) => (item.kind === 'numbered' || item.kind === 'caps') && item.level === 1
    ).length;
    unitHandling = unitCount > 0 && topLevelHeadings >= unitCount ? 'unit-is-group' : 'unit-is-topic';
    if (unitCount === 0) unitHandling = 'unit-is-group';
  }

  const groups = assemble(items, unitHandling);

  let topics = groups
    .flatMap((group) => group.topics)
    .map((topic) => (settings.splitColonLists ? splitColonList(topic) : topic))
    .map(dedupe)
    .filter((topic) => topic.title.length >= 2);

  if (topics.length > MAX_TOPICS) {
    warnings.push(
      `That file produced ${topics.length} topics, which is more than expected — only the first ${MAX_TOPICS} are shown. Check that you uploaded a syllabus outline rather than a textbook.`
    );
    topics = topics.slice(0, MAX_TOPICS);
  }

  if (skipped > 0) {
    warnings.push(
      skipped === 1
        ? '1 line looked like a page number or a header and was left out.'
        : `${skipped} lines looked like page numbers or headers and were left out.`
    );
  }

  const subTopicCount = topics.reduce((total, topic) => total + topic.subTopics.length, 0);

  return {
    topics,
    warnings,
    stats: {
      lines: lines.length,
      topics: topics.length,
      subTopics: subTopicCount,
      skippedLines: skipped,
    },
    options: { ...settings, unitHandling },
  };
}
