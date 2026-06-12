"use strict";

// ════════════════════════════════════════════════════════════════════════════
// ep-to-us-converter.js — EP claimset → US Preliminary Amendment
//
// Pure text-processing; no Office.js or OOXML dependency.
// Input:  array of paragraph strings (one per paragraph from the EP document)
// Output: { claims, remarks, stats, warnings }
// ════════════════════════════════════════════════════════════════════════════

// ── Claim parsing ─────────────────────────────────────────────────────────────

// Patterns for recognised status tokens (EP may not have these; handle anyway)
const STATUS_TOKEN_RE = /^\((?:Original|Currently\s+Amended|Previously\s+Presented|Cancelled|Canceled|New|Withdrawn|Not\s+Entered|Allowed|Allowable)\)\s+/i;

/**
 * Parse an array of paragraph strings into a structured claim array.
 * Handles: multi-paragraph claims (accumulates until the next numbered claim),
 * status tokens, and blank separating paragraphs.
 *
 * @param {string[]} paragraphs
 * @returns {Array<{number, status, text, rawText, paragraphs}>}
 */
function parseClaims(paragraphs) {
  const claims = [];
  let current = null;

  for (const raw of paragraphs) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (current) current.paragraphs.push("");
      continue;
    }

    const headerMatch = trimmed.match(/^(\d+)\.\s+(.*)/s);
    if (headerMatch) {
      if (current) claims.push(_finalizeClaim(current));
      let body = headerMatch[2];
      let status = null;
      const stMatch = body.match(STATUS_TOKEN_RE);
      if (stMatch) {
        status = stMatch[0].trim().replace(/[()]/g, "").trim();
        body = body.slice(stMatch[0].length);
      }
      current = {
        number: parseInt(headerMatch[1], 10),
        status,
        paragraphs: [body],
        rawText: trimmed,
      };
    } else if (current) {
      current.paragraphs.push(trimmed);
    }
  }
  if (current) claims.push(_finalizeClaim(current));
  return claims;
}

function _finalizeClaim(c) {
  const text = c.paragraphs
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    number: c.number,
    status: c.status,
    text,
    rawText: c.rawText,
    isIndependent: !_hasDependencyLanguage(text),
    originalText: text,
  };
}

function _hasDependencyLanguage(text) {
  // A claim is dependent only if it OPENS with a dependency reference.
  // "The device of claim N" / "The method according to claim N" / anaphoric
  // phrases all appear near the start. Claims like "A computer-readable medium
  // storing instructions for the device of claims 1-5" are independent.
  return /^(?:the|said)\b/i.test(text)
    || /^(?:according to|of)\s+claims?\s+\d/i.test(text)
    || /\b(?:preceding|previous|foregoing)\s+claim/i.test(text);
}

// ── Reference numeral stripping ───────────────────────────────────────────────

/**
 * Strip EP-style reference numerals — parenthesized numbers appearing after
 * element names.  Does NOT strip claim dependency references like "claim (1)".
 *
 * @param {string} text
 * @returns {{text: string, changed: boolean, removed: string[]}}
 */
function stripReferenceNumerals(text) {
  const removed = [];
  // Match whitespace? + '(' + digits + optional single letter + ')'
  // Negative: do not strip if preceded by "claim" (word boundary check via offset)
  const result = text.replace(/\s*\((\d+[a-zA-Z]?)\)/g, (match, _num, offset) => {
    const preceding = text.slice(Math.max(0, offset - 7), offset).toLowerCase();
    if (/claim\s*$/.test(preceding)) return match; // keep claim reference
    removed.push(match.trim());
    return "";
  });
  return {
    text: result.replace(/\s{2,}/g, " ").trim(),
    changed: removed.length > 0,
    removed,
  };
}

// ── Dependency resolution ─────────────────────────────────────────────────────

// Extract all integers from a string
function _nums(str) {
  return (str.match(/\d+/g) || []).map(Number);
}
function _lowest(str) {
  const ns = _nums(str);
  return ns.length ? Math.min(...ns) : 1;
}

/**
 * Resolve multiple dependencies and anaphoric references to single dependencies.
 *
 * Transforms applied (in order):
 *  1. "any [one] of [the] [preceding|previous|…] claims [N-M]" → "claim 1" or lowest
 *  2. "the|said [preceding|previous|foregoing|above] claim" (singular) → "claim N-1"
 *  3. "claims N or M" / "claims N and M" / "claims N-M" / "claims N, M[, ...]" → "claim N"
 *  4. "claim N or M" (explicit alt with "claim" singular + two numbers) → "claim N"
 *
 * @param {string} text
 * @param {number} claimNumber
 * @returns {{text: string, changes: string[]}}
 */
function resolveDependencies(text, claimNumber) {
  const changes = [];
  let result = text;

  function replace(re, fn) {
    result = result.replace(re, (match, ...args) => {
      const replacement = fn(match, ...args);
      if (replacement !== match) changes.push(`"${match}" → "${replacement}"`);
      return replacement;
    });
  }

  // 1a. "any [one] of [the] preceding/previous/foregoing/above claims" (no numbers)
  replace(
    /\b(?:any(?:\s+one)?|either|all)\s+of\s+the\s+(?:preceding|previous|foregoing|above)\s+claims?\b/gi,
    () => "claim 1"
  );

  // 1b. "any [one] of [the] claims N-M" / "any of claims N, M, ..."
  replace(
    /\b(?:any(?:\s+one)?|either|all|one)\s+of\s+(?:the\s+)?claims?\s+([\d][,\d\s\-–andorto]*)/gi,
    (_, numPart) => `claim ${_lowest(numPart)}`
  );

  // 2. "the/said preceding/previous/foregoing/above claim" (singular anaphoric)
  replace(
    /\b(?:the|said)\s+(?:preceding|previous|foregoing|above)\s+claim\b/gi,
    () => `claim ${claimNumber - 1}`
  );

  // 3a. "claims N-M" or "claims N to M" (range)
  replace(
    /\bclaims?\s+(\d+)\s*[-–]\s*\d+\b/gi,
    (_, lo) => `claim ${parseInt(lo, 10)}`
  );

  // 3b. "claims N to M" (word form)
  replace(
    /\bclaims?\s+(\d+)\s+to\s+\d+\b/gi,
    (_, lo) => `claim ${parseInt(lo, 10)}`
  );

  // 3c. "claims N or M" / "claims N and M"
  replace(
    /\bclaims?\s+(\d+)\s+(?:or|and)\s+\d+\b/gi,
    (_, lo) => `claim ${parseInt(lo, 10)}`
  );

  // 3d. "claims N, M[, and/or P]" — comma-separated list of ≥2 numbers
  replace(
    /\bclaims?\s+(\d+(?:\s*,\s*(?:(?:and|or)\s+)?\d+)+)\b/gi,
    (_, numPart) => `claim ${_lowest(numPart)}`
  );

  // 4. "claim N or M" (singular "claim" with explicit alternative number)
  replace(
    /\bclaim\s+(\d+)\s+or\s+\d+\b/gi,
    (_, lo) => `claim ${parseInt(lo, 10)}`
  );

  return { text: result, changes };
}

// ── Non-transitory CRM ────────────────────────────────────────────────────────

const CRM_RE = /\b(computer[\s-]readable\s+(?:storage\s+)?medium|machine[\s-]readable\s+(?:storage\s+)?medium|storage\s+medium|computer\s+program\s+product)\b/i;

/**
 * Add "non-transitory" qualifier to CRM claims that lack it.
 * Idempotent: no change if already present.
 *
 * @param {string} text
 * @returns {{text: string, added: boolean}}
 */
function addNonTransitory(text) {
  if (/\bnon[\s-]transitory\b/i.test(text)) return { text, added: false };
  if (!CRM_RE.test(text)) return { text, added: false };
  const result = text.replace(CRM_RE, "non-transitory $1");
  return { text: result, added: true };
}

// ── "Characterized in that" detection ────────────────────────────────────────

function hasCharacterizedIn(text) {
  return /\bcharacterized\s+in\s+that\b/i.test(text);
}

// ── Full claimset conversion ──────────────────────────────────────────────────

/**
 * Convert an EP claim set (array of paragraph strings) to a US-style
 * preliminary amendment claim set.
 *
 * @param {string[]} paragraphs
 * @returns {{
 *   claims: Array<{number, status, text, changes, warnings}>,
 *   remarks: string,
 *   stats: {total, independent, extraTotal, extraIndependent, nonTransitoryAdded, feesRequired}
 * }}
 */
function convertEpToUs(paragraphs) {
  const parsed = parseClaims(paragraphs);
  const changeLog = []; // {claimNumber, description}
  let nonTransitoryAdded = false;
  const characterizedWarnings = [];

  const processedClaims = parsed.map(claim => {
    let { text, number } = claim;
    const claimChanges = [];
    const claimWarnings = [];

    // 1. Strip reference numerals
    const refResult = stripReferenceNumerals(text);
    if (refResult.changed) {
      text = refResult.text;
      claimChanges.push(`Reference numerals deleted: ${refResult.removed.join(", ")}`);
    }

    // 2. Resolve multiple dependencies
    const depResult = resolveDependencies(text, number);
    if (depResult.changes.length > 0) {
      text = depResult.text;
      claimChanges.push(...depResult.changes.map(c => `Dependency resolved: ${c}`));
    }

    // 3. Add non-transitory
    const ntResult = addNonTransitory(text);
    if (ntResult.added) {
      text = ntResult.text;
      nonTransitoryAdded = true;
      claimChanges.push(`"non-transitory" added before medium term`);
    }

    // 4. Flag "characterized in that"
    if (hasCharacterizedIn(text)) {
      claimWarnings.push(
        `Contains "characterized in that" language. Consider amending to conform to U.S. claim drafting conventions.`
      );
      characterizedWarnings.push(number);
    }

    if (claimChanges.length > 0) {
      changeLog.push({ claimNumber: number, changes: claimChanges });
    }

    return {
      number,
      status: "New",
      text,
      changes: claimChanges,
      warnings: claimWarnings,
      isIndependent: !_hasDependencyLanguage(text),
    };
  });

  // Stats (count pending only — exclude cancelled)
  const pending = processedClaims.filter(c => canonicalIsCancelled(c.status) === false);
  const independents = pending.filter(c => c.isIndependent);
  const total = pending.length;
  const indep = independents.length;
  const extraTotal = Math.max(0, total - 20);
  const extraIndep = Math.max(0, indep - 3);
  const feesRequired = extraTotal > 0 || extraIndep > 0;

  const stats = {
    total,
    independent: indep,
    extraTotal,
    extraIndependent: extraIndep,
    feesRequired,
    nonTransitoryAdded,
    characterizedWarnings,
  };

  const remarks = generateRemarks(changeLog, stats);

  return { claims: processedClaims, remarks, stats };
}

function canonicalIsCancelled(status) {
  return status && /^cancel/i.test(status.trim());
}

// ── Remarks generator ─────────────────────────────────────────────────────────

/**
 * Generate attorney-quality draft remarks for the preliminary amendment.
 *
 * @param {Array<{claimNumber, changes}>} changeLog
 * @param {object} stats
 * @returns {string}
 */
function generateRemarks(changeLog, stats) {
  const lines = [];

  lines.push("REMARKS");
  lines.push("");
  lines.push(
    "The present claims have been amended to put them in better form for examination " +
    "before the United States Patent and Trademark Office. The following amendments have been made:"
  );
  lines.push("");

  // Reference numeral section
  const refNumClaims = changeLog
    .filter(e => e.changes.some(c => c.startsWith("Reference numerals")))
    .map(e => e.claimNumber);
  if (refNumClaims.length > 0) {
    lines.push("Reference Numerals Deleted.");
    lines.push(
      "Reference numerals appearing in the originally-filed claims have been deleted. " +
      "The reference numerals were included pursuant to European Patent Convention Rule 43(7) " +
      "and are not required under USPTO practice. No new matter has been added."
    );
    lines.push("");
  }

  // Multiple dependency section
  const multiDepEntries = changeLog.filter(e =>
    e.changes.some(c => c.startsWith("Dependency resolved:"))
  );
  if (multiDepEntries.length > 0) {
    lines.push("Multiple Dependencies Eliminated.");
    lines.push(
      "Multiple-dependent claims are not permitted under 35 U.S.C. § 112(e) except " +
      "when claims depend alternatively upon a single prior claim. The following claims have " +
      "been amended to depend from a single claim:"
    );
    for (const entry of multiDepEntries) {
      const deps = entry.changes.filter(c => c.startsWith("Dependency resolved:"));
      for (const dep of deps) {
        const detail = dep.slice("Dependency resolved: ".length);
        lines.push(`    Claim ${entry.claimNumber}: ${detail}`);
      }
    }
    lines.push("No new matter has been added.");
    lines.push("");
  }

  // Non-transitory section
  if (stats.nonTransitoryAdded) {
    const ntClaims = changeLog
      .filter(e => e.changes.some(c => c.includes("non-transitory")))
      .map(e => e.claimNumber);
    lines.push(`"Non-Transitory" Added.`);
    lines.push(
      `The term "non-transitory" has been added to claim${ntClaims.length > 1 ? "s" : ""} ` +
      `${_formatList(ntClaims)} to clarify that the claimed computer-readable medium does not ` +
      `encompass transitory signals or carrier waves, which are not patent-eligible subject matter ` +
      `under 35 U.S.C. § 101. See USPTO, "Subject Matter Eligibility of Computer Readable Media," ` +
      `1337 O.G. 88 (Aug. 18, 2009). No new matter has been added.`
    );
    lines.push("");
  }

  // Claims summary
  lines.push("Claims Summary.");
  lines.push(
    `There are currently ${stats.total} claim${stats.total !== 1 ? "s" : ""} pending ` +
    `in this application, including ${stats.independent} independent claim${stats.independent !== 1 ? "s" : ""}.`
  );

  if (stats.extraTotal > 0) {
    lines.push(
      `Applicant notes that claim fees for claims in excess of 20 are required pursuant to ` +
      `37 C.F.R. § 1.16(h) (${stats.extraTotal} additional claim${stats.extraTotal !== 1 ? "s" : ""}). ` +
      `The required fees will be paid with this amendment or upon notification.`
    );
  }
  if (stats.extraIndependent > 0) {
    lines.push(
      `Applicant notes that fees for independent claims in excess of three are required pursuant to ` +
      `37 C.F.R. § 1.16(i) (${stats.extraIndependent} additional independent claim${stats.extraIndependent !== 1 ? "s" : ""}). ` +
      `The required fees will be paid with this amendment or upon notification.`
    );
  }

  lines.push("");
  lines.push("No new matter has been added by any of the above amendments.");

  // "Characterized in that" advisory
  if (stats.characterizedWarnings.length > 0) {
    lines.push("");
    lines.push(
      `ADVISORY: Claim${stats.characterizedWarnings.length > 1 ? "s" : ""} ` +
      `${_formatList(stats.characterizedWarnings)} contain${stats.characterizedWarnings.length === 1 ? "s" : ""} ` +
      `"characterized in that" language consistent with European claim drafting conventions. ` +
      `Applicant may wish to amend these claims to omit this phrase, as it has no substantive ` +
      `effect under U.S. patent law but may cause confusion during examination. This advisory ` +
      `is for Applicant's review and does not reflect an amendment.`
    );
  }

  return lines.join("\n");
}

function _formatList(nums) {
  if (nums.length === 1) return String(nums[0]);
  if (nums.length === 2) return `${nums[0]} and ${nums[1]}`;
  return `${nums.slice(0, -1).join(", ")}, and ${nums[nums.length - 1]}`;
}

export {
  parseClaims,
  stripReferenceNumerals,
  resolveDependencies,
  addNonTransitory,
  hasCharacterizedIn,
  convertEpToUs,
  generateRemarks,
};
