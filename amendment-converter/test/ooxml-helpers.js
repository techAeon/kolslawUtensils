// Shared OOXML construction helpers for tests.
// Each helper returns a string fragment or a complete document string.

export const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;
export const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Wrap content in a minimal w:document / w:body / w:p */
export function doc(...paras) {
  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<w:document ${W}><w:body>${paras.join("")}</w:body></w:document>`;
}

/** A paragraph containing the given content fragments */
export function para(...contents) {
  return `<w:p>${contents.join("")}</w:p>`;
}

/** A plain run */
export function run(text, { underline = false, strike = false, dstrike = false, uVal = "single" } = {}) {
  const props = [];
  if (underline) props.push(`<w:u w:val="${uVal}"/>`);
  if (strike)   props.push(`<w:strike/>`);
  if (dstrike)  props.push(`<w:dstrike/>`);
  const rPr = props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  return `<w:r>${rPr}<w:t${space}>${text}</w:t></w:r>`;
}

/** A tracked-changes insertion */
export function ins(id, ...runs) {
  return `<w:ins w:id="${id}" w:author="Test" w:date="2024-01-01T00:00:00Z">${runs.join("")}</w:ins>`;
}

/** A tracked-changes deletion (delText) */
export function del(id, text) {
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  return `<w:del w:id="${id}" w:author="Test" w:date="2024-01-01T00:00:00Z">`
    + `<w:r><w:delText${space}>${text}</w:delText></w:r></w:del>`;
}

/** A tracked-changes deletion with a bold run */
export function delRun(id, text, rPrXml = "") {
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  return `<w:del w:id="${id}" w:author="Test" w:date="2024-01-01T00:00:00Z">`
    + `<w:r>${rPrXml}<w:delText${space}>${text}</w:delText></w:r></w:del>`;
}

/** Count occurrences of a substring */
export function count(str, sub) {
  let n = 0, i = 0;
  while ((i = str.indexOf(sub, i)) !== -1) { n++; i += sub.length; }
  return n;
}

/** Return all text content visible in a serialised OOXML string (w:t nodes) */
export function allText(xmlStr) {
  return [...xmlStr.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map(m => m[1]).join("");
}
