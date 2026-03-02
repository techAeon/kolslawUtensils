/**
 * uspto-headings.js
 * Kolslaw Utensils — Shared Core · packages/shared-core
 *
 * Canonical USPTO document section heading data.
 * Source: Official USPTO accepted headings list (DOCX filing requirements).
 *
 * TWO DISTINCT USES:
 *
 * 1. SECTION_HEADER_PATTERNS (used by patent-parser.js → parseDocumentStructure)
 *    Detects the internal sections of a patent application — Abstract, Claims,
 *    Specification subsections, etc. These define content boundaries within a document.
 *
 * 2. DOCUMENT_TYPE_PATTERNS (used by future OA Response Generator + Amendment Converter)
 *    Detects what *kind of filing* a document is — Amendment after Non-Final,
 *    RCE, Appeal Brief, etc. These classify the document itself, not its sections.
 *
 * Each entry:
 *   key:      Canonical machine key (used in code)
 *   label:    Human-readable label (shown in UI)
 *   category: Grouping for UI display
 *   headers:  All known heading strings USPTO accepts for this section
 *             Stored as plain strings; buildPattern() converts them to regex at runtime.
 */

"use strict";


// ═══════════════════════════════════════════════════════════════════════════
// PART 1: APPLICATION CONTENT SECTIONS
// These are the sections *inside* a patent application document.
// Used by parseDocumentStructure() to split a document into named regions.
// ═══════════════════════════════════════════════════════════════════════════

export const APPLICATION_SECTIONS = [

  // ── Title ───────────────────────────────────────────────────────────────
  {
    key: "title",
    label: "Title of Invention",
    category: "specification",
    headers: [
      "TITLE OF INVENTION",
      "TITLE OF THE INVENTION",
      "TITLE",
      "INVENTION TITLE",
    ],
  },

  // ── Cross References ─────────────────────────────────────────────────────
  {
    key: "crossRef",
    label: "Cross-Reference to Related Applications",
    category: "specification",
    headers: [
      "CROSS REFERENCES TO PRIORITY APPLICATIONS",
      "CROSS REFERENCES TO OTHER MATERIALS",
      "CROSSREFERENCE TO RELATED APPLICATIONS",
      "CROSSREFERENCE TO RELATED PATENT APPLICATIONS",
      "CROSSREFERENCES",
      "REFERENCE TO RELATED APPLICATIONS",
      "REFERENCE TO RELATED PATENTS",
      "RELATED APPLICATIONS",
      "INCORPORATION BY REFERENCE",
    ],
  },

  // ── Federal Sponsorship ───────────────────────────────────────────────────
  {
    key: "federalSponsorship",
    label: "Federally Sponsored Research",
    category: "specification",
    headers: [
      "ACKNOWLEDGMENT OF GOVERNMENT SUPPORT",
      "FEDERAL FUNDS STATEMENT",
      "FEDERALLY SPONSORED RESEARCH AND DEVELOPMENT",
      "FEDERALLY SPONSORED RIGHTS",
      "GOVERNMENT INTEREST",
      "GOVERNMENT RIGHTS IN THE INVENTION",
      "JOINT RESEARCH AGREEMENT",
      "ORIGIN OF THE INVENTION",
      "RIGHTS TO INVENTION UNDER FEDERAL RESEARCH",
      "STATEMENT AS TO RIGHTS TO INVENTIONS MADE UNDER FEDERALLY SPONSORED RESEARCH AND DEVELOPMENT",
      "STATEMENT OF FEDERALLY SPONSORED RESEARCH",
      "STATEMENT OF GOVERNMENT INTEREST",
    ],
  },

  // ── Field of the Invention ───────────────────────────────────────────────
  {
    key: "field",
    label: "Field of the Invention",
    category: "specification",
    headers: [
      "FIELD OF INVENTION",
      "FIELD OF THE INVENTION",
      "FIELD OF DISCLOSURE",
      "TECHNICAL FIELD",
      "TECHNICAL FIELD OF THE INVENTION",
      "FIELD AND BACKGROUND OF THE INVENTION",
    ],
  },

  // ── Background ───────────────────────────────────────────────────────────
  {
    key: "background",
    label: "Background",
    category: "specification",
    headers: [
      "BACKGROUND",
      "BACKGROUND ART",
      "BACKGROUND OF INVENTION",
      "BACKGROUND OF THE INVENTION",
      "BACKGROUND OF THE PRESENT INVENTION",
      "BACKGROUND OF DISCLOSURE",
      "BACKGROUND OF THE DISCLOSURE",
      "DESCRIPTION OF THE PRIOR ART",
      "DESCRIPTION OF THE RELATED ARTS",
      "PRIOR ART",
      "BRIEF STATEMENT OF THE PRIOR ART",
    ],
  },

  // ── Summary ───────────────────────────────────────────────────────────────
  {
    key: "summary",
    label: "Summary of the Invention",
    category: "specification",
    headers: [
      "BRIEF SUMMARY OF THE INVENTION",
      "BRIEF STATEMENT OF INVENTION",
      "BRIEF STATEMENT OF THE INVENTION",
      "INVENTION SUMMARY",
      "OBJECT AND SUMMARY OF THE INVENTION",
      "OBJECT OF THE INVENTION",
      "SUMMARY",
      "SUMMARY OF INVENTION",
      "SUMMARY OF THE INVENTION",
    ],
  },

  // ── Brief Description of Drawings ────────────────────────────────────────
  {
    key: "briefDrawings",
    label: "Brief Description of Drawings",
    category: "specification",
    headers: [
      "BRIEF DESCRIPTION OF DRAWINGS",
      "BRIEF DESCRIPTION OF THE DRAWINGS",
      "BRIEF DESCRIPTION OF FIGURES",
      "BRIEF DESCRIPTION OF THE FIGURES",
      "DESCRIPTION OF DRAWINGS",
      "DESCRIPTION OF THE DRAWINGS",
    ],
  },

  // ── Detailed Description ─────────────────────────────────────────────────
  {
    key: "detailedDescription",
    label: "Detailed Description",
    category: "specification",
    headers: [
      "BEST MODE FOR CARRYING OUT INVENTION",
      "BEST MODE FOR CARRYING OUT THE INVENTION",
      "DESCRIPTION",
      "DESCRIPTION OF INVENTION",
      "DESCRIPTION OF THE INVENTION",
      "DETAILED DESCRIPTION",
      "DETAILED DESCRIPTION OF DRAWINGS",
      "DETAILED DESCRIPTION OF THE DRAWINGS",
      "DETAILED DESCRIPTION OF INVENTION",
      "DETAILED DESCRIPTION OF THE INVENTION",
      "DETAILED DESCRIPTION OF AN EXEMPLARY EMBODIMENTS",
      "DETAILED DESCRIPTION OF THE EXEMPLARY EMBODIMENTS",
      "DETAILED DESCRIPTION OF SUMMARY OF THE PREFERRED EMBODIMENTS",
      "DETAILED DESCRIPTION OF SUMMARY OF A PREFERRED EMBODIMENTS",
      "EXAMPLE EMBODIMENTS",
      "PREAMBLE",
    ],
  },

  // ── Claims ────────────────────────────────────────────────────────────────
  {
    key: "claims",
    label: "Claims",
    category: "claims",
    headers: [
      "CLAIM",
      "CLAIMS",
      "CLAIM OR CLAIMS",
      "CLAIMS LIST",
      "CLAIMS LISTING",
      "EXEMPLARY CLAIMS",
      "I CLAIM",
      "IN THE CLAIMS",
      "LIST OF CLAIMS",
      "LIST OF THE CLAIMS",
      "LISTING OF CLAIMS",
      "LISTING OF THE CLAIMS",
      "PATENT CLAIMS",
      "THE CLAIMS",
      "THE CLAIMS DEFINING THE INVENTION ARE",
      "THE CLAIMS HERE DEFINING THE INVENTION ARE",
      "THE FOLLOWING IS CLAIMED",
      "THAT WHICH IS CLAIMED IS",
      "WE CLAIM",
      "WE HEREBY CLAIM",
      "WHAT IS CLAIMED",
      "WHAT IS CLAIMED IS",
      "WHAT IS PUT FORTH IS",
      "CLAIMED ARE",
      "CLAIM AMENDMENTS",
      "AMENDMENTS TO CLAIMS",
      "AMENDMENTS TO THE CLAIMS",
      "AMENDMENTS OF THE CLAIMS",
      "AMENDMENTS OF CLAIMS",
    ],
  },

  // ── Abstract ─────────────────────────────────────────────────────────────
  {
    key: "abstract",
    label: "Abstract",
    category: "abstract",
    headers: [
      "ABSTRACT",
      "ABSTRACT CLEAN",
      "ABSTRACT OF DISCLOSURE",
      "ABSTRACT OF THE DISCLOSURE",
      "ABSTRACT OF INVENTION",
      "ABSTRACT OF THE INVENTION",
      "DISCLOSURE ABSTRACT",
      "IN THE ABSTRACT",
      "INVENTION ABSTRACT",
      "SUBSTITUTE ABSTRACT",
      "AMENDMENTS TO THE ABSTRACT",
      "AMENDMENTS OF THE ABSTRACT",
      "AMENDMENTS TO THE ABSTRACT OF THE DISCLOSURE",
      "PLEASE REPLACE THE ABSTRACT WITH THE FOLLOWING ABSTRACT",
      "PLEASE REPLACE THE ABSTRACT WITH THE FOLLOWING AMENDED ABSTRACT",
    ],
  },

  // ── Drawings ──────────────────────────────────────────────────────────────
  {
    key: "drawings",
    label: "Drawings",
    category: "drawings",
    headers: [
      "AMENDMENTS TO THE DRAWINGS",
      "DRAWING SECTION",
      "DRAWING",
      "DRAWINGS",
      "FIG",
      "FIGS",
      "FIGURE",
      "FIGURES",
      "IMAGES",
      "NEW DRAWINGS",
      "REPLACEMENT DRAWINGS",
      "NEW REPLACEMENT DRAWINGS",
      "NEW REPLACEMENT SHEET",
      "SHEET",
      "SHEET OF",
    ],
  },

  // ── Specification (generic catch-all) ────────────────────────────────────
  {
    key: "specification",
    label: "Specification",
    category: "specification",
    headers: [
      "SPECIFICATION",
      "INVENTION SPECIFICATION",
      "SUBSTITUTE SPECIFICATION",
      "SUBSTITUTE SPECIFICATION CLEAN VERSION",
      "SUBSTITUTE SPECIFICATION CLEAN",
      "SUBSTITUTE SPECIFICATION MARKED",
      "SPECIFICATION AMENDMENT",
      "SPECIFICATION AMENDMENTS",
      "AMENDMENTS TO SPECIFICATION",
      "AMENDMENTS OF SPECIFICATION",
      "AMENDMENTS TO THE SPECIFICATION",
      "AMENDMENTS OF THE SPECIFICATION",
      "IN THE SPECIFICATION",
    ],
  },
];


// ═══════════════════════════════════════════════════════════════════════════
// PART 2: DOCUMENT TYPE CLASSIFIERS
// These identify what *kind of filing* a document is.
// Used by: OA Response Generator, Amendment Converter, future routing logic.
// ═══════════════════════════════════════════════════════════════════════════

export const DOCUMENT_TYPES = [

  // ── Cover letter / Office header ────────────────────────────────────────
  {
    key: "coverLetter",
    label: "Cover Letter",
    category: "filing",
    headers: [
      "IN THE UNITED STATES PATENT AND TRADEMARK OFFICE",
      "IN THE UNITED STATES PATENT & TRADEMARK OFFICE",
      "UNITED STATES PATENT AND TRADEMARK OFFICE",
      "UNITED STATES PATENT & TRADEMARK OFFICE",
    ],
  },

  // ── Prosecution responses ────────────────────────────────────────────────
  {
    key: "amendmentNonFinal",
    label: "Amendment / Response After Non-Final Rejection",
    category: "amendment",
    headers: [
      "AMENDMENT AFTER NON FINAL OFFICE ACTION",
      "AMENDMENT AFTER NON FINAL REJECTION",
      "AMENDMENT AFTER NON-FINAL OFFICE ACTION",
      "AMENDMENT AFTER NON-FINAL REJECTION",
      "RESPONSE AND AMENDMENT",
      "RESPONSE TO NON FINAL OFFICE ACTION",
      "RESPONSE TO NON FINAL REJECTION",
      "RESPONSE TO NON-FINAL OFFICE ACTION",
      "RESPONSE TO NON-FINAL REJECTION",
    ],
  },

  {
    key: "amendmentFinal",
    label: "Response After Final Action",
    category: "amendment",
    headers: [
      "AMENDMENT AFTER FINAL REJECTION",
      "AMENDMENT AFTER FINAL OFFICE ACTION",
      "AMENDMENT AFTER FINAL REJECTION/OFFICE ACTION",
      "RESPONSE TO FINAL REJECTION",
      "RESPONSE TO FINAL OFFICE ACTION",
      "RESPONSE TO FINAL REJECTION/OFFICE ACTION",
    ],
  },

  {
    key: "amendmentWithRce",
    label: "Amendment / Response with RCE",
    category: "amendment",
    headers: [
      "AMENDMENT AFTER FINAL OFFICE ACTION WITH RCE",
      "AMENDMENT AFTER FINAL OFFICE ACTION WITH REQUEST FOR CONTINUED EXAMINATION",
      "AMENDMENT AFTER FINAL REJECTION WITH RCE",
      "AMENDMENT AFTER FINAL REJECTION WITH REQUEST FOR CONTINUED",
      "AMENDMENT ENTERED WITH FILING OF CPA/RCE",
      "AMENDMENT SUBMITTED WITH FILING OF CPA/RCE",
      "AMENDMENT WITH RCE",
      "AMENDMENT WITH REQUEST FOR CONTINUED EXAMINATION",
      "REPLY AFTER FINAL OFFICE ACTION WITH RCE",
      "REPLY AFTER FINAL OFFICE ACTION WITH REQUEST FOR CONTINUED",
      "REPLY AFTER FINAL REJECTION WITH RCE",
      "REPLY AFTER FINAL REJECTION WITH REQUEST FOR CONTINUED",
      "RESPONSE TO FINAL OFFICE ACTION WITH RCE",
      "RESPONSE TO FINAL OFFICE ACTION WITH REQUEST FOR CONTINUED",
      "RESPONSE TO FINAL REJECTION WITH RCE",
      "RESPONSE TO FINAL REJECTION WITH REQUEST FOR CONTINUED",
      "RESPONSE WITH RCE",
      "RESPONSE WITH REQUEST FOR CONTINUED",
    ],
  },

  {
    key: "preliminaryAmendment",
    label: "Preliminary Amendment",
    category: "amendment",
    headers: [
      "PRELIMINARY AMENDMENT",
      "PRELIMINARY AMENDMENT UNDER 37 CFR 1.115",
    ],
  },

  {
    key: "amendmentAfterAllowance",
    label: "Amendment After Notice of Allowance (Rule 312)",
    category: "amendment",
    headers: [
      "AMENDMENT AFTER ALLOWANCE UNDER 37 CFR 1.312",
      "AMENDMENT AFTER NOTICE OF ALLOWANCE",
      "AMENDMENT UNDER 37 CFR 1.312",
      "RESPONSE UNDER 37 CFR 1.312",
    ],
  },

  {
    key: "supplementalAmendment",
    label: "Supplemental Amendment / Response",
    category: "amendment",
    headers: [
      "SUPPLEMENTAL AMENDMENT",
      "SUPPLEMENTAL RESPONSE",
    ],
  },

  {
    key: "restrictionResponse",
    label: "Response to Restriction / Election Requirement",
    category: "amendment",
    headers: [
      "AMENDMENT AFTER ELECTION RESTRICTION REQUIREMENT",
      "AMENDMENT AFTER RESTRICTION ELECTION REQUIREMENT",
      "AMENDMENT AFTER RESTRICTION/ELECTION REQUIREMENT",
      "AMENDMENT TO ELECTION/RESTRICTION REQUIREMENT",
      "AMENDMENT TO RESTRICTION/ELECTION REQUIREMENT",
      "RESPONSE TO ELECTION RESTRICTION REQUIREMENT",
      "RESPONSE TO RESTRICTION ELECTION REQUIREMENT",
      "RESPONSE TO RESTRICTION/ELECTION REQUIREMENT",
    ],
  },

  {
    key: "quayleResponse",
    label: "Response After Ex Parte Quayle Action",
    category: "amendment",
    headers: [
      "EX PARTE QUAYLE",
      "QUAYLE OFFICE ACTION",
    ],
  },

  // ── Remarks / Arguments ──────────────────────────────────────────────────
  {
    key: "remarks",
    label: "Applicant Arguments / Remarks",
    category: "remarks",
    headers: [
      "APPLICANT ARGUMENTS",
      "APPLICANT ARGUMENTS MADE IN AN AMENDMENT",
      "APPLICANT ARGUMENTS/REMARKS MADE IN AN AMENDMENT",
      "APPLICANT REMARKS",
      "APPLICANT REMARKS MADE IN AN AMENDMENT",
      "APPLICANTS REMARKS AND/OR ARGUMENTS",
      "ARGUMENTS AND/OR REMARKS",
      "ARGUMENTS/REMARKS",
      "REMARKS AND/OR ARGUMENTS",
      "REMARKS MADE IN AN AMENDMENT",
    ],
  },

  // ── Appeal ───────────────────────────────────────────────────────────────
  {
    key: "appealBrief",
    label: "Appeal Brief",
    category: "appeal",
    headers: [
      "APPEAL BRIEF",
      "APPEAL BRIEF FILED",
    ],
  },

  {
    key: "replyBrief",
    label: "Reply Brief",
    category: "appeal",
    headers: [
      "REPLY BRIEF",
      "REPLY BRIEF FILED",
    ],
  },

  {
    key: "supplementalAppealBrief",
    label: "Supplemental Appeal Brief",
    category: "appeal",
    headers: [
      "SUPPLEMENTAL APPEAL BRIEF",
    ],
  },

  {
    key: "amendmentAfterAppeal",
    label: "Amendment / Argument After Notice of Appeal",
    category: "appeal",
    headers: [
      "AMENDMENT AFTER NOTICE OF APPEAL",
      "ARGUMENT AFTER NOTICE OF APPEAL",
      "REPLY AFTER NOTICE OF APPEAL",
      "RESPONSE TO NOTICE OF APPEAL",
    ],
  },

  {
    key: "amendmentAfterBoardDecision",
    label: "Amendment / Argument After Board Decision",
    category: "appeal",
    headers: [
      "AMENDMENT AFTER BOARD DECISION",
      "AMENDMENT AFTER BPAI DECISION",
      "AMENDMENT AFTER DECISION BY BOARD",
      "AMENDMENT AFTER DECISION BY BPAI",
      "AMENDMENT AFTER DECISION BY PTAB",
      "AMENDMENT AFTER DECISION ON APPEAL",
      "AMENDMENT AFTER PTAB DECISION",
      "AMENDMENT/ARGUMENT AFTER BPAI DECISION",
      "ARGUMENT AFTER BPAI DECISION",
      "REPLY AFTER BOARD DECISION",
      "REPLY AFTER BPAI DECISION",
      "REPLY AFTER DECISION BY BPAI",
      "REPLY AFTER DECISION BY PTAB",
      "REPLY AFTER DECISION ON APPEAL",
      "REPLY AFTER PTAB DECISION",
      "RESPONSE TO BOARD DECISION",
      "RESPONSE TO BPAI DECISION",
      "RESPONSE TO DECISION BY BOARD",
      "RESPONSE TO DECISION BY BPAI",
      "RESPONSE TO DECISION BY PTAB",
      "RESPONSE TO DECISION ON APPEAL",
      "RESPONSE TO PTAB DECISION",
    ],
  },

  {
    key: "boardRehearing",
    label: "Request for Rehearing of Board Decision",
    category: "appeal",
    headers: [
      "REQUEST FOR REHEARING OF BPAI DECISION",
    ],
  },

  // ── Affidavits ───────────────────────────────────────────────────────────
  {
    key: "affidavitRule130a",
    label: "Affidavit Under Rule 130(a) — AIA",
    category: "affidavit",
    headers: ["AFFIDAVIT UNDER RULE 130A"],
  },

  {
    key: "affidavitRule130b",
    label: "Affidavit Under Rule 130(b) — AIA",
    category: "affidavit",
    headers: ["AFFIDAVIT UNDER RULE 130B"],
  },

  {
    key: "affidavitRule131",
    label: "Affidavit Under Rule 131 — pre-AIA",
    category: "affidavit",
    headers: ["AFFIDAVIT UNDER RULE 131"],
  },

  {
    key: "affidavitRule132",
    label: "Affidavit Under Rule 132",
    category: "affidavit",
    headers: ["AFFIDAVIT UNDER RULE 132"],
  },

  // ── Interview Summary ────────────────────────────────────────────────────
  {
    key: "interviewSummary",
    label: "Applicant Summary of Interview with Examiner",
    category: "misc",
    headers: [
      "EXAMINER INTERVIEW SUMMARY",
      "INTERVIEW SUMMARY",
      "SUMMARY OF EXAMINER INTERVIEW",
    ],
  },

  // ── Copying Claims ───────────────────────────────────────────────────────
  {
    key: "copyingClaims",
    label: "Amendment Copying Claims",
    category: "amendment",
    headers: [
      "AMENDMENT COPYING CLAIMS/RESPONSE TO SUGGESTED CLAIMS",
      "AMENDMENT COPYING CLAIMS NOT IN RESPONSE TO EXAMINER SUGGESTING CLAIMS",
    ],
  },

  // ── Misc ─────────────────────────────────────────────────────────────────
  {
    key: "inventorshipCorrection",
    label: "Request Under Rule 48 Correcting Inventorship",
    category: "misc",
    headers: ["REQUEST UNDER RULE 48 CORRECTING INVENTORSHIP"],
  },

  {
    key: "electronicCorrection",
    label: "Electronic Record Correction",
    category: "misc",
    headers: ["ELECTRONIC RECORD CORRECTION"],
  },
];


// ═══════════════════════════════════════════════════════════════════════════
// PART 3: RUNTIME PATTERN BUILDERS
// Converts the plain-string header arrays above into compiled RegExp objects.
// Called once at module init — not on every parse.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalizes a header string for matching:
 *   - Strips trailing/leading whitespace
 *   - Collapses internal whitespace to \s+
 *   - Escapes regex metacharacters
 *   - Makes common punctuation variants optional (& vs AND, / vs OR)
 *
 * @param {string} header
 * @returns {string} - regex fragment
 */
function normalizeHeaderToPattern(header) {
  return header
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")   // escape metacharacters
    .replace(/\s+/g, "\\s+")                    // flexible whitespace
    .replace(/&/g, "(?:&|AND)")                 // & ↔ AND
    .replace(/\bAND\b/g, "(?:AND|&)")           // AND ↔ &
    .replace(/\//g, "(?:\\/|OR|\\s+(?:OR)\\s+)") // / ↔ OR
    .replace(/\\\./g, "\\.?");                  // optional periods
}

/**
 * Builds a compiled RegExp from a section entry's headers array.
 * Matches any of the headers at the start of a line, case-insensitive.
 *
 * @param {Object} entry - APPLICATION_SECTIONS or DOCUMENT_TYPES entry
 * @returns {RegExp}
 */
export function buildPattern(entry) {
  const fragments = entry.headers.map(normalizeHeaderToPattern);
  const pattern   = `^(?:${fragments.join("|")})\\s*$`;
  return new RegExp(pattern, "im");
}

/**
 * Pre-compiled patterns for all application sections.
 * Map of key → RegExp.
 * Import this instead of calling buildPattern() in hot paths.
 *
 * @type {Map<string, RegExp>}
 */
export const APPLICATION_SECTION_PATTERNS = new Map(
  APPLICATION_SECTIONS.map(entry => [entry.key, buildPattern(entry)])
);

/**
 * Pre-compiled patterns for all document types.
 * @type {Map<string, RegExp>}
 */
export const DOCUMENT_TYPE_PATTERNS = new Map(
  DOCUMENT_TYPES.map(entry => [entry.key, buildPattern(entry)])
);


// ═══════════════════════════════════════════════════════════════════════════
// PART 4: LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Finds which APPLICATION_SECTIONS key matches a given header string.
 * Returns null if no match found.
 *
 * @param {string} headerText
 * @returns {string|null} key
 */
export function classifyApplicationSection(headerText) {
  for (const [key, pattern] of APPLICATION_SECTION_PATTERNS) {
    if (pattern.test(headerText.trim())) return key;
  }
  return null;
}

/**
 * Finds which DOCUMENT_TYPES key matches a given document header/title.
 * Returns null if no match found.
 *
 * @param {string} headerText
 * @returns {string|null} key
 */
export function classifyDocumentType(headerText) {
  for (const [key, pattern] of DOCUMENT_TYPE_PATTERNS) {
    if (pattern.test(headerText.trim())) return key;
  }
  return null;
}

/**
 * Returns the human-readable label for a section or document type key.
 *
 * @param {string} key
 * @returns {string}
 */
export function getLabelForKey(key) {
  const all = [...APPLICATION_SECTIONS, ...DOCUMENT_TYPES];
  return all.find(e => e.key === key)?.label ?? key;
}

/**
 * Returns all canonical section keys grouped by category.
 * Useful for building UI pickers or navigation menus.
 *
 * @returns {Object} category → string[]
 */
export function getSectionsByCategory() {
  const result = {};
  for (const entry of APPLICATION_SECTIONS) {
    (result[entry.category] ||= []).push(entry.key);
  }
  return result;
}
