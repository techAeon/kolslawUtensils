/**
 * patent-parser.js
 * Kolslaw Utensils — Shared Core · packages/shared-core
 *
 * THE BRAIN. Reads and understands a patent document.
 * Stateless pure functions only — no Office.js dependency.
 * Consume via: import * as PatentParser from './patent-parser.js';
 *
 * All functions accept plain text strings or pre-parsed ClaimSet objects.
 * No function here touches the Word DOM — that's office-helpers.js's job.
 */

"use strict";

import {
  APPLICATION_SECTIONS,
  APPLICATION_SECTION_PATTERNS,
  DOCUMENT_TYPE_PATTERNS,
  classifyApplicationSection,
  classifyDocumentType,
  getLabelForKey,
} from "./uspto-headings.js";

// Re-export heading utilities so consumers only need to import patent-parser
export {
  classifyApplicationSection,
  classifyDocumentType,
  getLabelForKey,
  APPLICATION_SECTIONS,
  DOCUMENT_TYPE_PATTERNS,
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: DOCUMENT STRUCTURE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Splits a full patent application text into its named sections.
 * Uses the comprehensive USPTO-accepted heading list from uspto-headings.js.
 *
 * @param {string} text - Full document text
 * @returns {Object} Map of section key → { header, body, startIndex, label }
 *
 * @example
 * const sections = parseDocumentStructure(fullText);
 * const claimsText = sections.claims?.body;
 */
export function parseDocumentStructure(text) {
  const found = [];

  for (const [key, pattern] of APPLICATION_SECTION_PATTERNS) {
    // Reset lastIndex for global patterns (safety)
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      found.push({
        key,
        startIndex: match.index,
        header:     match[0].trim(),
        label:      getLabelForKey(key),
      });
    }
  }

  // Sort by position in document
  found.sort((a, b) => a.startIndex - b.startIndex);

  const sections = {};
  for (let i = 0; i < found.length; i++) {
    const current = found[i];
    const next    = found[i + 1];
    const bodyStart = current.startIndex + current.header.length;
    const bodyEnd   = next ? next.startIndex : text.length;
    sections[current.key] = {
      header:     current.header,
      label:      current.label,
      body:       text.slice(bodyStart, bodyEnd).trim(),
      startIndex: current.startIndex,
    };
  }

  return sections;
}

/**
 * Attempts to classify the document type from its title/header lines.
 * Returns a document type key (e.g. "amendmentNonFinal") or null.
 * Used by OA Response Generator and Amendment Converter to auto-detect context.
 *
 * @param {string} text - Full document text (checks first ~500 chars)
 * @returns {string|null}
 */
export function detectDocumentType(text) {
  const header = text.slice(0, 500);
  for (const [key, pattern] of DOCUMENT_TYPE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(header)) return key;
  }
  return null;
}

/**
 * Best-effort extractor: returns the claims section text from a full document.
 * Handles documents where only the claims are pasted.
 *
 * @param {string} text
 * @returns {string}
 */
export function extractClaimsText(text) {
  const sections = parseDocumentStructure(text);
  if (sections.claims?.body) return sections.claims.body;
  // Fallback: if no section headers found, treat the whole text as claims
  return text.trim();
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: CLAIM PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} Claim
 * @property {number}   number       - Claim number (1-based)
 * @property {string}   raw          - Full raw text of the claim
 * @property {string}   preamble     - Text before "comprising" / "consisting" / "wherein" etc.
 * @property {string}   body         - Text of the claim body (after transitional phrase)
 * @property {string}   transition   - The transitional phrase ("comprising", "consisting of", etc.)
 * @property {boolean}  isIndependent
 * @property {number[]} dependsOn    - Claim numbers this claim depends on (usually 1, can be multiple for multiple deps)
 * @property {string[]} limitations  - Individual claim limitations (split on ";" or structured newlines)
 * @property {string[]} terms        - Unique noun phrases introduced in this claim
 */

/**
 * Master claim parser. Accepts raw claims text (or full document text).
 * Returns a structured ClaimSet array.
 *
 * @param {string} text - Claims section text or full document
 * @returns {Claim[]}
 */
export function parseClaims(text) {
  const claimsText = extractClaimsText(text);
  const rawClaims  = splitIntoClaims(claimsText);
  return rawClaims.map(parseSingleClaim).filter(Boolean);
}

/**
 * Splits a claims section into individual raw claim strings.
 * Handles numbered claims in the forms:
 *   "1. A widget..."
 *   "1. (Currently Amended) A widget..."
 *   "1. (New) A widget..."
 *   "1. (Cancelled)"
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoClaims(text) {
  // Lookahead split: split at start of "N." pattern at beginning of line
  // Handles 1–3 digit claim numbers
  const parts = text.split(/(?=^\d{1,3}\.\s)/m).map(s => s.trim()).filter(Boolean);
  return parts;
}

/**
 * Parses a single raw claim string into a Claim object.
 *
 * @param {string} raw
 * @returns {Claim|null}
 */
function parseSingleClaim(raw) {
  // Extract claim number
  const numMatch = raw.match(/^(\d{1,3})\.\s*/);
  if (!numMatch) return null;
  const number = parseInt(numMatch[1], 10);

  // Strip USPTO status annotations: (Currently Amended), (New), (Cancelled), etc.
  const statusPattern = /\((?:Currently Amended|Previously Presented|New|Cancelled|Withdrawn|Original)\)\s*/gi;
  let body = raw.slice(numMatch[0].length).replace(statusPattern, "").trim();

  // Detect cancelled claim
  if (/^\(Cancelled\)$/i.test(body) || body === "") {
    return {
      number, raw, body: "", preamble: "", transition: "",
      isIndependent: false, isCancelled: true, dependsOn: [],
      limitations: [], terms: [],
    };
  }

  // Detect dependency
  const depInfo = detectDependency(body);

  // Detect transitional phrase (only in independent claims)
  const transInfo = !depInfo.isDependent ? detectTransition(body) : { transition: "", preamble: body };

  // Split limitations
  const limitations = splitLimitations(body);

  // Extract introduced noun phrases (terms)
  const terms = extractIntroducedTerms(body);

  return {
    number,
    raw,
    body,
    preamble:      transInfo.preamble     || "",
    transition:    transInfo.transition   || "",
    isIndependent: !depInfo.isDependent,
    isCancelled:   false,
    dependsOn:     depInfo.dependsOn,
    limitations,
    terms,
  };
}

/**
 * Detects claim dependency.
 * Handles:
 *   "The widget of claim 1"
 *   "The widget of claims 1 or 2"
 *   "The widget of any of claims 1-3"
 *
 * @param {string} text
 * @returns {{ isDependent: boolean, dependsOn: number[] }}
 */
function detectDependency(text) {
  // Pattern: "of claim N" or "of claims N, M, or O" or "of any of claims N-M"
  const singleDep   = /\bof claim (\d+)\b/i;
  const multiDep    = /\bof claims? ([\d,\s\-or]+)/i;

  let m = singleDep.exec(text);
  if (m) return { isDependent: true, dependsOn: [parseInt(m[1], 10)] };

  m = multiDep.exec(text);
  if (m) {
    const nums = parseNumberList(m[1]);
    return { isDependent: true, dependsOn: nums };
  }

  return { isDependent: false, dependsOn: [] };
}

/**
 * Parses a string like "1, 2, or 3" or "1-4" into an array of numbers.
 */
function parseNumberList(str) {
  const nums = new Set();
  // Handle ranges like "1-4"
  str.replace(/(\d+)\s*[-–]\s*(\d+)/g, (_, a, b) => {
    for (let i = parseInt(a); i <= parseInt(b); i++) nums.add(i);
  });
  // Handle individual numbers
  str.replace(/\d+/g, n => nums.add(parseInt(n)));
  return Array.from(nums).sort((a, b) => a - b);
}

/**
 * Detects the transitional phrase in a claim preamble.
 * Returns preamble (before transition) and transition.
 *
 * @param {string} text
 * @returns {{ preamble: string, transition: string }}
 */
function detectTransition(text) {
  // Order matters — more specific patterns first
  const transitions = [
    "consisting essentially of",
    "consisting of",
    "comprising",
    "characterized by",
    "wherein",
    "including",
    "having",
    "composed of",
    "containing",
  ];
  for (const t of transitions) {
    const idx = text.toLowerCase().indexOf(t);
    if (idx !== -1) {
      return {
        preamble:   text.slice(0, idx).trim(),
        transition: t,
      };
    }
  }
  return { preamble: text, transition: "" };
}

/**
 * Splits claim body into individual limitations.
 * Handles semicolon-delimited limitations and hard-wrapped lines
 * starting with lowercase (common in formatted claim drafts).
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitLimitations(text) {
  // First try semicolons
  const bySemicolon = text.split(/;\s*/).map(s => s.trim()).filter(Boolean);
  if (bySemicolon.length > 1) return bySemicolon;

  // Fallback: split on newlines that are followed by a lowercase word
  // (indicating a continued limitation list in formatted documents)
  return text.split(/\n(?=[a-z])/).map(s => s.replace(/\n/g, " ").trim()).filter(Boolean);
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: TERM EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extracts noun phrases introduced with an indefinite article ("a", "an")
 * in a claim or text block. These are the terms that need antecedent basis
 * if they appear with "the" later.
 *
 * Returns normalized term strings (lowercase, singular-normalized).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractIntroducedTerms(text) {
  // Match "a/an [adjective*] noun" — greedy up to punctuation or ";"
  // Captures multi-word noun phrases like "a first elongated metallic member"
  const pattern = /\b(?:a|an)\s+((?:[a-z][\w-]*\s+){0,4}[a-z][\w-]*)/gi;
  const terms = new Set();
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const phrase = m[1].trim().toLowerCase();
    // Filter out common non-noun phrases and transitional words
    if (!STOPWORD_PHRASES.has(phrase) && phrase.split(" ").length <= 5) {
      terms.add(phrase);
    }
  }
  return Array.from(terms);
}

/**
 * Phrases that start with a/an but aren't claim element introductions.
 */
const STOPWORD_PHRASES = new Set([
  "result", "function", "manner", "way", "time", "number", "amount",
  "degree", "portion", "variety", "example", "embodiment", "aspect",
  "further", "alternative", "least one", "least partially",
  "plurality of", "second", "third", "fourth",
]);

/**
 * Extracts all figure/part number references from text.
 * Matches patterns like: widget 102, member 104a, step S200
 *
 * @param {string} text
 * @returns {Array<{ term: string, number: string, fullMatch: string }>}
 */
export function extractPartNumbers(text) {
  // Part numbers are typically 3–4 digit numbers, optionally followed by a letter
  const pattern = /\b([A-Z]?[a-z][a-zA-Z\s-]{1,30}?)\s+(\d{2,4}[a-zA-Z]?)\b/g;
  const found = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const term = m[1].trim();
    const num  = m[2];
    // Skip pure dates, claim numbers, CFR refs
    if (/^(19|20)\d{2}$/.test(num)) continue;
    if (/^\d{1,2}$/.test(num)) continue;
    found.push({ term, number: num, fullMatch: m[0] });
  }
  return found;
}

/**
 * Extracts all defined terms from specification text.
 * Looks for patterns like: '"widget" means...', 'the term "widget" refers to...'
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractDefinedTerms(text) {
  const patterns = [
    /"([^"]+)"\s+(?:means?|refers? to|is defined as|shall mean)/gi,
    /the term\s+"([^"]+)"/gi,
    /herein(?:after)? referred to as\s+"?([^",.\n]+)"?/gi,
  ];
  const terms = new Set();
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(text)) !== null) {
      terms.add(m[1].trim().toLowerCase());
    }
  }
  return Array.from(terms);
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: ANTECEDENT BASIS CHECKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} AntecedentIssue
 * @property {number} claimNumber
 * @property {string} term          - The offending "the [term]" usage
 * @property {string} context       - Surrounding text snippet for location
 * @property {"missing_antecedent"|"double_introduction"} type
 */

/**
 * Checks all claims for antecedent basis issues.
 * Implements the core of what ClaimMaster charges $300/year for.
 *
 * Rules:
 *   1. Any "the [term]" usage requires prior "a/an [term]" in the same claim
 *      or in a parent claim (for dependent claims).
 *   2. A term introduced twice with "a/an" in the same claim is a double-introduction.
 *
 * @param {Claim[]} claims
 * @returns {AntecedentIssue[]}
 */
export function checkAntecedentBasis(claims) {
  const issues = [];
  const claimMap = buildClaimMap(claims);

  for (const claim of claims) {
    if (claim.isCancelled) continue;

    // Collect all terms available at this claim's scope (self + ancestors)
    const availableTerms = collectAncestorTerms(claim, claimMap);

    // Check every "the [phrase]" in this claim
    const theUsages = findTheUsages(claim.body);
    for (const usage of theUsages) {
      const normalized = usage.term.toLowerCase();
      if (!termIsIntroduced(normalized, availableTerms)) {
        issues.push({
          claimNumber: claim.number,
          term:        "the " + usage.term,
          context:     usage.context,
          type:        "missing_antecedent",
        });
      }
    }

    // Check for double introductions within this claim's own body
    const introTerms = claim.terms;
    const seen = new Map();
    for (const term of introTerms) {
      seen.set(term, (seen.get(term) || 0) + 1);
    }
    for (const [term, count] of seen) {
      if (count > 1) {
        issues.push({
          claimNumber: claim.number,
          term:        "a/an " + term,
          context:     `"${term}" introduced ${count} times`,
          type:        "double_introduction",
        });
      }
    }
  }

  return issues;
}

/**
 * Finds all "the [noun phrase]" usages in a text string.
 * Returns term and surrounding context.
 *
 * @param {string} text
 * @returns {Array<{ term: string, context: string }>}
 */
export function findTheUsages(text) {
  // Match "the" followed by optional adjectives and a noun
  // Excludes "the method", "the device", "the system" (these are claim preamble references, usually fine)
  const GENERIC_REFS = new Set(["method","device","system","apparatus","process","composition","assembly","arrangement","structure"]);

  const pattern = /\bthe\s+((?:[a-z][\w-]*\s+){0,4}[a-z][\w-]*)/gi;
  const found = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const phrase = m[1].trim().toLowerCase();
    const words  = phrase.split(/\s+/);

    // Skip single generic words used as claim-level references
    if (words.length === 1 && GENERIC_REFS.has(phrase)) continue;
    // Skip ordinal/article combos
    if (/^(first|second|third|fourth|at least|one or more)/.test(phrase)) continue;

    // Context: up to 40 chars before + the match
    const ctxStart = Math.max(0, m.index - 40);
    const context  = "…" + text.slice(ctxStart, m.index + m[0].length + 20) + "…";

    found.push({ term: phrase, context: context.replace(/\n/g, " ") });
  }
  return found;
}

/**
 * Collects the set of introduced terms available to a claim,
 * including all ancestor claims' terms (for dependent claims).
 *
 * @param {Claim} claim
 * @param {Map<number,Claim>} claimMap
 * @returns {Set<string>}
 */
function collectAncestorTerms(claim, claimMap) {
  const terms = new Set(claim.terms.map(t => t.toLowerCase()));
  const visited = new Set([claim.number]);

  let queue = [...claim.dependsOn];
  while (queue.length > 0) {
    const parentNum = queue.shift();
    if (visited.has(parentNum)) continue;
    visited.add(parentNum);
    const parent = claimMap.get(parentNum);
    if (!parent) continue;
    parent.terms.forEach(t => terms.add(t.toLowerCase()));
    queue.push(...parent.dependsOn);
  }
  return terms;
}

/**
 * Checks whether a "the [term]" phrase has a matching introduction
 * in the available terms set. Uses fuzzy matching to handle
 * singular/plural and adjective variations.
 *
 * @param {string} thePhrase  - Normalized "the ..." phrase (lowercase)
 * @param {Set<string>} introduced - Set of introduced a/an terms
 * @returns {boolean}
 */
function termIsIntroduced(thePhrase, introduced) {
  if (introduced.has(thePhrase)) return true;

  // Try dropping leading adjectives one at a time
  const words = thePhrase.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const shorter = words.slice(i).join(" ");
    if (introduced.has(shorter)) return true;
  }

  // Try singular/plural normalization
  const singular = toSingular(thePhrase);
  if (introduced.has(singular)) return true;
  for (const term of introduced) {
    if (toSingular(term) === singular) return true;
  }

  return false;
}

/**
 * Very lightweight English singularizer for common patent claim patterns.
 * Not a full morphology engine — handles the 90% case.
 *
 * @param {string} word
 * @returns {string}
 */
function toSingular(word) {
  const w = word.trim().toLowerCase();
  if (w.endsWith("ies"))  return w.slice(0, -3) + "y";
  if (w.endsWith("ves"))  return w.slice(0, -3) + "f";
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: DEPENDENCY GRAPH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} DependencyGraph
 * @property {Map<number,Claim>}     claimMap      - Number → Claim lookup
 * @property {Map<number,number[]>}  children      - Number → direct dependents
 * @property {number[]}              independents  - Independent claim numbers
 * @property {number[]}              orphans       - Claims depending on non-existent claims
 * @property {number[][]}            circular      - Sets of claims in circular dependency
 */

/**
 * Builds a full dependency graph from a parsed claim set.
 * Detects orphans (depends on non-existent claim) and circular dependencies.
 *
 * Used by: Visual Claim Tree, Claim Linter, PTO Compliance Checker
 *
 * @param {Claim[]} claims
 * @returns {DependencyGraph}
 */
export function buildDependencyGraph(claims) {
  const claimMap   = buildClaimMap(claims);
  const children   = new Map();
  const orphans    = [];
  const independents = [];

  // Init children map
  for (const claim of claims) children.set(claim.number, []);

  for (const claim of claims) {
    if (claim.isCancelled) continue;

    if (claim.isIndependent) {
      independents.push(claim.number);
    } else {
      for (const parentNum of claim.dependsOn) {
        if (!claimMap.has(parentNum)) {
          orphans.push(claim.number);
        } else {
          const siblings = children.get(parentNum) || [];
          siblings.push(claim.number);
          children.set(parentNum, siblings);
        }
      }
    }
  }

  const circular = detectCircularDependencies(claimMap);

  return { claimMap, children, independents, orphans, circular };
}

/**
 * Builds a simple number → Claim lookup map.
 * @param {Claim[]} claims
 * @returns {Map<number,Claim>}
 */
export function buildClaimMap(claims) {
  const map = new Map();
  for (const claim of claims) map.set(claim.number, claim);
  return map;
}

/**
 * Detects circular dependency chains using DFS.
 * @param {Map<number,Claim>} claimMap
 * @returns {number[][]} - Each sub-array is a cycle
 */
function detectCircularDependencies(claimMap) {
  const visited  = new Set();
  const inStack  = new Set();
  const cycles   = [];

  function dfs(num, path) {
    if (inStack.has(num)) {
      // Found a cycle — extract it
      const cycleStart = path.indexOf(num);
      cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(num)) return;

    visited.add(num);
    inStack.add(num);
    path.push(num);

    const claim = claimMap.get(num);
    if (claim) {
      for (const dep of claim.dependsOn) {
        dfs(dep, [...path]);
      }
    }

    inStack.delete(num);
  }

  for (const num of claimMap.keys()) dfs(num, []);
  return cycles;
}

/**
 * Returns all claims in the dependency chain of a given claim number.
 * Useful for: "which claims would be cancelled if claim 1 is rejected?"
 *
 * @param {number} claimNumber
 * @param {DependencyGraph} graph
 * @returns {number[]} - Includes the claim itself
 */
export function getDependencyChain(claimNumber, graph) {
  const chain = [claimNumber];
  const queue = [claimNumber];
  while (queue.length > 0) {
    const num  = queue.shift();
    const kids = graph.children.get(num) || [];
    for (const child of kids) {
      chain.push(child);
      queue.push(child);
    }
  }
  return chain;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: PTO COMPLIANCE CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * USPTO fee thresholds (37 CFR 1.16) — update when fees change.
 * These drive the PTO Compliance Checker.
 */
export const USPTO_CLAIM_THRESHOLDS = {
  totalIncluded:       20,  // Claims included in basic filing fee
  independentIncluded:  3,  // Independent claims included in basic filing fee
  multipleDepExtra:  true,  // Multiple dependent claims incur extra fee
};

/**
 * @typedef {Object} ClaimCountReport
 * @property {number}   total
 * @property {number}   independent
 * @property {number}   dependent
 * @property {number}   cancelled
 * @property {number}   extraTotal         - Total claims over threshold (fee-bearing)
 * @property {number}   extraIndependent   - Independent claims over threshold (fee-bearing)
 * @property {boolean}  hasMultipleDependent
 * @property {number[]} independentNums
 * @property {number[]} cancelledNums
 */

/**
 * Counts claims and calculates USPTO fee exposure.
 * Core of the PTO Compliance Checker.
 *
 * @param {Claim[]} claims
 * @returns {ClaimCountReport}
 */
export function countClaims(claims) {
  const active    = claims.filter(c => !c.isCancelled);
  const cancelled = claims.filter(c =>  c.isCancelled);
  const indeps    = active.filter(c => c.isIndependent);
  const deps      = active.filter(c => !c.isIndependent);

  // Multiple dependent claim: a claim that depends on more than one parent
  const hasMultipleDependent = deps.some(c => c.dependsOn.length > 1);

  return {
    total:               active.length,
    independent:         indeps.length,
    dependent:           deps.length,
    cancelled:           cancelled.length,
    extraTotal:          Math.max(0, active.length    - USPTO_CLAIM_THRESHOLDS.totalIncluded),
    extraIndependent:    Math.max(0, indeps.length    - USPTO_CLAIM_THRESHOLDS.independentIncluded),
    hasMultipleDependent,
    independentNums:     indeps.map(c => c.number),
    cancelledNums:       cancelled.map(c => c.number),
  };
}

/**
 * @typedef {Object} ClaimFormatIssue
 * @property {number} claimNumber
 * @property {string} type
 * @property {string} message
 */

/**
 * Checks claims for basic formatting requirements.
 *
 * Checks:
 *   - Each claim ends with a period
 *   - No claim begins with a lowercase letter (after number)
 *   - Dependent claims reference valid parent claim numbers
 *   - Claims are sequentially numbered
 *
 * @param {Claim[]} claims
 * @returns {ClaimFormatIssue[]}
 */
export function checkClaimFormat(claims) {
  const issues = [];
  const claimMap = buildClaimMap(claims);

  let expectedNumber = 1;
  for (const claim of claims) {
    // Sequential numbering
    if (claim.number !== expectedNumber) {
      issues.push({
        claimNumber: claim.number,
        type:        "numbering_gap",
        message:     `Expected claim ${expectedNumber}, found claim ${claim.number}`,
      });
    }
    expectedNumber = claim.number + 1;

    if (claim.isCancelled) continue;

    // Ends with period
    if (!claim.body.trimEnd().endsWith(".")) {
      issues.push({
        claimNumber: claim.number,
        type:        "missing_period",
        message:     "Claim does not end with a period",
      });
    }

    // Starts with capital letter (after status annotation stripped)
    if (claim.body && !/^[A-Z]/.test(claim.body.trim())) {
      issues.push({
        claimNumber: claim.number,
        type:        "lowercase_start",
        message:     "Claim body begins with a lowercase letter",
      });
    }

    // Valid parent references
    for (const parentNum of claim.dependsOn) {
      if (parentNum >= claim.number) {
        issues.push({
          claimNumber: claim.number,
          type:        "forward_reference",
          message:     `Claim ${claim.number} depends on claim ${parentNum}, which appears later`,
        });
      }
      if (!claimMap.has(parentNum)) {
        issues.push({
          claimNumber: claim.number,
          type:        "missing_parent",
          message:     `Claim ${claim.number} depends on claim ${parentNum}, which does not exist`,
        });
      }
    }
  }

  return issues;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: 112 ISSUES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} Section112Issue
 * @property {number} claimNumber
 * @property {string} type
 * @property {string} match     - The offending text
 * @property {string} message
 */

/**
 * Checks claims for potential 35 U.S.C. § 112 issues:
 *   - Means-plus-function language (§ 112(f))
 *   - Step-plus-function language (§ 112(f))
 *   - Relative/indefinite terms (§ 112(b))
 *   - Negative limitations (flag for review — not per se invalid)
 *
 * @param {Claim[]} claims
 * @returns {Section112Issue[]}
 */
export function check112Issues(claims) {
  const issues = [];

  // Means-plus-function triggers (§ 112(f))
  const MPF_PATTERN    = /\bmeans\s+for\s+\w/gi;
  const STEP_PATTERN   = /\bstep\s+for\s+\w/gi;

  // Indefiniteness triggers (§ 112(b)) — relative terms that courts have found problematic
  const RELATIVE_TERMS = [
    /\bsubstantially\b/gi,
    /\bapproximately\b/gi,
    /\babout\s+\d/gi,
    /\bgenerally\b/gi,
    /\bsimilar(?:ly)?\b/gi,
    /\bsuitable\b/gi,
    /\boptionally\b/gi,
    /\bif desired\b/gi,
    /\brelatively\b/gi,
    /\bhigh(?:er)?\s+(?:speed|temperature|pressure|frequency)\b/gi,
    /\blow(?:er)?\s+(?:speed|temperature|pressure|frequency)\b/gi,
  ];

  // Negative limitations — not invalid but flag for attorney review
  const NEG_PATTERN = /\b(?:not|without|free of|devoid of|absent|excluding|other than)\b/gi;

  for (const claim of claims) {
    if (claim.isCancelled) continue;

    // MPF
    for (const match of (claim.body.match(MPF_PATTERN) || [])) {
      issues.push({
        claimNumber: claim.number,
        type:    "means_plus_function",
        match,
        message: `Potential § 112(f) means-plus-function: "${match}"`,
      });
    }

    // Step-plus-function
    for (const match of (claim.body.match(STEP_PATTERN) || [])) {
      issues.push({
        claimNumber: claim.number,
        type:    "step_plus_function",
        match,
        message: `Potential § 112(f) step-plus-function: "${match}"`,
      });
    }

    // Relative terms
    for (const pat of RELATIVE_TERMS) {
      let m;
      while ((m = pat.exec(claim.body)) !== null) {
        issues.push({
          claimNumber: claim.number,
          type:    "relative_term",
          match:   m[0],
          message: `Potential § 112(b) indefiniteness: relative term "${m[0]}"`,
        });
      }
    }

    // Negative limitations (lower severity — flag only)
    let nm;
    while ((nm = NEG_PATTERN.exec(claim.body)) !== null) {
      issues.push({
        claimNumber: claim.number,
        type:    "negative_limitation",
        match:   nm[0],
        message: `Negative limitation present — review for definiteness: "${nm[0]}"`,
      });
    }
  }

  return issues;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: TERM CONSISTENCY CHECKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ConsistencyIssue
 * @property {string}   preferredTerm
 * @property {string}   foundTerm
 * @property {string}   section        - "claims" | "spec" | "abstract"
 * @property {string}   context
 */

/**
 * Checks that key terms are used consistently across document sections.
 * A term used in claims should appear in the same form in the spec.
 *
 * @param {string[]} claimsTerms    - Terms extracted from claims
 * @param {string}   specText       - Full specification text
 * @param {string[]} [preferredTerms] - Optional explicit preferred term list
 * @returns {ConsistencyIssue[]}
 */
export function checkTermConsistency(claimsTerms, specText, preferredTerms = []) {
  const issues = [];
  const allPreferred = [...new Set([...claimsTerms, ...preferredTerms])];

  for (const term of allPreferred) {
    // Check if spec uses a variant instead
    const variants = generateVariants(term);
    for (const variant of variants) {
      if (variant === term) continue;
      const variantRegex = new RegExp(`\\b${escapeRegex(variant)}\\b`, "gi");
      const m = variantRegex.exec(specText);
      if (m) {
        const ctxStart = Math.max(0, m.index - 30);
        issues.push({
          preferredTerm: term,
          foundTerm:     variant,
          section:       "spec",
          context:       "…" + specText.slice(ctxStart, m.index + variant.length + 30) + "…",
        });
      }
    }
  }

  return issues;
}

/**
 * Generates common variants of a term for consistency checking.
 * E.g., "widget" → ["widgets", "Widget", "Widgets", "the widget"]
 *
 * @param {string} term
 * @returns {string[]}
 */
function generateVariants(term) {
  const t = term.toLowerCase();
  return [
    t,
    t + "s",
    t.replace(/y$/, "ies"),
    t.replace(/f$/, "ves"),
    t.charAt(0).toUpperCase() + t.slice(1),
  ].filter((v, i, arr) => arr.indexOf(v) === i); // dedupe
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: AMENDMENT PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} AmendedSegment
 * @property {"insertion"|"deletion"|"bracket_deletion"|"unchanged"} type
 * @property {string} text
 */

/**
 * Parses a text string containing USPTO-format amendment markup
 * into typed segments. Used by the Amendment Converter tool and
 * any tool that needs to understand what changed.
 *
 * Works on plain text; formatting cues (underline/strike) are
 * applied by office-helpers.js before calling this.
 *
 * @param {string} text - Plain text with [[brackets]] for deletions
 * @returns {AmendedSegment[]}
 */
export function parseAmendmentMarkup(text) {
  const segments = [];
  // Regex: captures [[deleted]], or anything else
  const pattern = /(\[\[.*?\]\])/g;
  let lastIndex = 0;
  let m;

  while ((m = pattern.exec(text)) !== null) {
    // Unchanged text before this match
    if (m.index > lastIndex) {
      segments.push({ type: "unchanged", text: text.slice(lastIndex, m.index) });
    }
    // Bracket deletion
    const inner = m[0].slice(2, -2);
    segments.push({ type: "bracket_deletion", text: inner });
    lastIndex = m.index + m[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ type: "unchanged", text: text.slice(lastIndex) });
  }

  return segments;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Escapes a string for use in a RegExp constructor.
 * @param {string} str
 * @returns {string}
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes whitespace in claim text.
 * Collapses multiple spaces/newlines into single spaces.
 * @param {string} text
 * @returns {string}
 */
export function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Quick summary of all issues found in a claim set.
 * Useful for building a dashboard or status indicator.
 *
 * @param {Claim[]} claims
 * @returns {Object}
 */
export function runFullLint(claims) {
  return {
    antecedentIssues: checkAntecedentBasis(claims),
    formatIssues:     checkClaimFormat(claims),
    section112Issues: check112Issues(claims),
    counts:           countClaims(claims),
    graph:            buildDependencyGraph(claims),
  };
}
