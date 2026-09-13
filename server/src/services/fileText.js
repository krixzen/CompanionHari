import { createRequire } from 'node:module';
import path from 'node:path';
import { badRequest } from '../lib/httpError.js';

const require = createRequire(import.meta.url);

const PDF_MAGIC = Buffer.from('%PDF-');

// pdf.js loads font metrics and character maps from disk at parse time and
// needs to be told where its own copies live.
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
const asDirUrl = (name) => `${path.join(pdfjsRoot, name)}${path.sep}`;

// pdf.js is a large module, so it is only loaded the first time a PDF is
// actually uploaded. The legacy build is the one meant for Node.
let pdfjsPromise;
const loadPdfjs = () => {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
};

/**
 * Rebuilds readable lines from pdf.js text items.
 *
 * pdf.js hands back positioned fragments, not lines, so fragments are grouped
 * by their vertical position: anything on roughly the same baseline belongs to
 * the same line. Without this a syllabus arrives as one long run-on string and
 * every heading and bullet is lost.
 */
function itemsToLines(items) {
  const rows = [];
  let current = null;

  for (const item of items) {
    if (typeof item.str !== 'string') continue;

    const y = Math.round(item.transform[5]);

    if (!current || Math.abs(current.y - y) > 2) {
      current = { y, parts: [] };
      rows.push(current);
    }
    current.parts.push(item.str);

    // pdf.js marks an explicit end-of-line inside the same text run.
    if (item.hasEOL) current = null;
  }

  return rows.map((row) => row.parts.join('').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

async function extractPdfText(buffer) {
  const pdfjs = await loadPdfjs();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // This runs against files the student chose on their own machine, but
    // there is still no reason to let a PDF execute anything.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: asDirUrl('standard_fonts'),
    cMapUrl: asDirUrl('cmaps'),
    cMapPacked: true,
  });
  const doc = await loadingTask.promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(itemsToLines(content.items).join('\n'));
    page.cleanup();
  }
  await loadingTask.destroy();

  return pages.join('\n');
}

/**
 * Pulls plain text out of an uploaded syllabus. PDFs go through pdf.js;
 * anything else is treated as text. Everything happens on this machine — the
 * file is never sent anywhere.
 */
export async function extractText(buffer, originalName = '') {
  if (!buffer || buffer.length === 0) throw badRequest('That file was empty.');

  const looksLikePdf =
    buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC) ||
    originalName.toLowerCase().endsWith('.pdf');

  if (looksLikePdf) {
    let text;
    try {
      text = await extractPdfText(buffer);
    } catch {
      throw badRequest('That PDF could not be read. Try pasting the syllabus text in instead.');
    }
    if (!text.trim()) {
      throw badRequest(
        'That PDF has no text in it — it is probably a scan or a photo. Try copying the syllabus text and pasting it in instead.'
      );
    }
    return text;
  }

  const text = buffer.toString('utf8');
  // A binary file decoded as UTF-8 comes back full of replacement characters.
  if (/�/.test(text.slice(0, 2000))) {
    throw badRequest('That file is not a PDF or a text file. Try a .pdf or .txt file.');
  }
  return text;
}
