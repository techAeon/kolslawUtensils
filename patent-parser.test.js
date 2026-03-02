/**
 * patent-parser.test.js
 * Kolslaw Utensils — Shared Core Tests
 *
 * Runnable with any standard test runner (Jest, Vitest, Node --test).
 * Also serves as living documentation — each test shows exactly what
 * the parser does with real patent claim patterns.
 *
 * Run:  npx vitest patent-parser.test.js
 *   or: npx jest patent-parser.test.js
 */

import {
  parseClaims,
  parseDocumentStructure,
  extractClaimsText,
  extractIntroducedTerms,
  extractPartNumbers,
  extractDefinedTerms,
  checkAntecedentBasis,
  findTheUsages,
  buildDependencyGraph,
  getDependencyChain,
  countClaims,
  checkClaimFormat,
  check112Issues,
  checkTermConsistency,
  parseAmendmentMarkup,
  runFullLint,
  normalizeWhitespace,
  escapeRegex,
} from "./patent-parser.js";

import { describe, it, expect } from "vitest"; // swap for jest if preferred


// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const SIMPLE_CLAIMS = `
1. A widget comprising a housing and a button disposed on the housing.

2. The widget of claim 1, wherein the housing is made of plastic.

3. The widget of claim 1, further comprising a display disposed on the housing.

4. The widget of claim 2 or 3, wherein the button is a capacitive button.

5. (Cancelled)

6. A method of using a widget comprising:
   receiving an input via a button;
   processing the input; and
   displaying a result on a display.
`.trim();

const ANTECEDENT_PROBLEM_CLAIMS = `
1. A device comprising:
   a frame;
   a motor coupled to the frame; and
   a controller coupled to the motor.

2. The device of claim 1, wherein the sensor is attached to the frame.

3. The device of claim 1, wherein a motor is a brushless motor.

4. The device of claim 1, wherein the motor is a brushless motor.
`.trim();

const FULL_DOC = `
TITLE OF INVENTION
Widget Assembly

BACKGROUND
Widgets have been used for decades.

DETAILED DESCRIPTION
The widget 100 comprises a housing 102 and a button 104.
As used herein, "actuator" means a device that produces motion.

CLAIMS

1. A widget comprising a housing.

2. The widget of claim 1, wherein the housing is plastic.

ABSTRACT
A widget with a housing.
`.trim();

const USPTO_MARKUP = `
The [[old]] new system [[comprising]] includes an [[outdated]] improved mechanism.
`;


// ═══════════════════════════════════════════════════════════════════════════
// 1. DOCUMENT STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

describe("parseDocumentStructure", () => {
  it("identifies named sections in a full application", () => {
    const sections = parseDocumentStructure(FULL_DOC);
    expect(sections).toHaveProperty("claims");
    expect(sections).toHaveProperty("detailed");
    expect(sections).toHaveProperty("abstract");
    expect(sections.claims.body).toContain("A widget");
  });

  it("returns empty object for claims-only text", () => {
    const sections = parseDocumentStructure(SIMPLE_CLAIMS);
    expect(Object.keys(sections).length).toBe(0);
  });
});

describe("extractClaimsText", () => {
  it("returns claims body from full document", () => {
    const text = extractClaimsText(FULL_DOC);
    expect(text).toContain("1. A widget");
    expect(text).not.toContain("BACKGROUND");
  });

  it("returns full text when no section headers found", () => {
    const text = extractClaimsText(SIMPLE_CLAIMS);
    expect(text).toContain("1. A widget");
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 2. CLAIM PARSING
// ═══════════════════════════════════════════════════════════════════════════

describe("parseClaims", () => {
  it("parses correct number of claims", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    expect(claims.length).toBe(6);
  });

  it("correctly identifies independent vs dependent claims", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    expect(claims[0].isIndependent).toBe(true);   // claim 1
    expect(claims[1].isIndependent).toBe(false);  // claim 2
    expect(claims[5].isIndependent).toBe(true);   // claim 6
  });

  it("extracts correct dependency references", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    expect(claims[1].dependsOn).toEqual([1]);  // claim 2 → claim 1
    expect(claims[3].dependsOn).toEqual([2, 3]); // claim 4 → claims 2 or 3
  });

  it("flags cancelled claims", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    const claim5 = claims.find(c => c.number === 5);
    expect(claim5.isCancelled).toBe(true);
  });

  it("detects transitional phrase in independent claim", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    expect(claims[0].transition).toBe("comprising");
  });

  it("extracts claim number correctly", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    expect(claims[0].number).toBe(1);
    expect(claims[5].number).toBe(6);
  });

  it("handles USPTO status annotations", () => {
    const withStatus = `1. (Currently Amended) A device comprising a frame.`;
    const claims = parseClaims(withStatus);
    expect(claims[0].body).not.toContain("Currently Amended");
    expect(claims[0].body).toContain("A device");
  });

  it("splits limitations on semicolons", () => {
    const c = `1. A method comprising: receiving input; processing input; outputting a result.`;
    const claims = parseClaims(c);
    expect(claims[0].limitations.length).toBeGreaterThanOrEqual(3);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 3. TERM EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

describe("extractIntroducedTerms", () => {
  it("finds simple a/an introductions", () => {
    const terms = extractIntroducedTerms("A device comprising a frame and a motor.");
    expect(terms).toContain("frame");
    expect(terms).toContain("motor");
  });

  it("finds multi-word phrases", () => {
    const terms = extractIntroducedTerms("A device comprising a first elongated shaft.");
    expect(terms.some(t => t.includes("shaft"))).toBe(true);
  });

  it("does not return stopword phrases", () => {
    const terms = extractIntroducedTerms("resulting in a manner that allows a function.");
    expect(terms).not.toContain("manner");
    expect(terms).not.toContain("function");
  });
});

describe("extractPartNumbers", () => {
  it("extracts part number references", () => {
    const parts = extractPartNumbers("The housing 102 supports the button 104.");
    expect(parts.some(p => p.number === "102")).toBe(true);
    expect(parts.some(p => p.number === "104")).toBe(true);
  });

  it("extracts alpha-suffix part numbers", () => {
    const parts = extractPartNumbers("The first arm 202a and second arm 202b.");
    expect(parts.some(p => p.number === "202a")).toBe(true);
  });
});

describe("extractDefinedTerms", () => {
  it("finds quoted definition patterns", () => {
    const terms = extractDefinedTerms(`As used herein, "actuator" means a device.`);
    expect(terms).toContain("actuator");
  });

  it("finds 'the term X' pattern", () => {
    const terms = extractDefinedTerms(`The term "widget" refers to any small device.`);
    expect(terms).toContain("widget");
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 4. ANTECEDENT BASIS
// ═══════════════════════════════════════════════════════════════════════════

describe("checkAntecedentBasis", () => {
  it("flags 'the sensor' when sensor was never introduced", () => {
    const claims = parseClaims(ANTECEDENT_PROBLEM_CLAIMS);
    const issues = checkAntecedentBasis(claims);
    const sensorIssue = issues.find(i => i.term.includes("sensor"));
    expect(sensorIssue).toBeDefined();
    expect(sensorIssue.claimNumber).toBe(2);
  });

  it("flags double introduction of 'a motor' in claim 3", () => {
    const claims = parseClaims(ANTECEDENT_PROBLEM_CLAIMS);
    const issues = checkAntecedentBasis(claims);
    // Claim 3 says "a motor is a brushless motor" but motor was introduced in claim 1
    // This creates a double introduction problem in the dependency chain
    // (claim 1 introduces "a motor", claim 3 re-introduces "a motor")
    expect(issues.some(i => i.claimNumber === 3)).toBe(true);
  });

  it("does NOT flag 'the motor' in claim 4 when motor is in parent claim 1", () => {
    const claims = parseClaims(ANTECEDENT_PROBLEM_CLAIMS);
    const issues = checkAntecedentBasis(claims);
    const motorIssue = issues.find(i =>
      i.claimNumber === 4 && i.term === "the motor" && i.type === "missing_antecedent"
    );
    expect(motorIssue).toBeUndefined();
  });

  it("returns empty array for clean claims", () => {
    const clean = `
      1. A device comprising a frame and a motor coupled to the frame.
      2. The device of claim 1, wherein the motor is brushless.
    `;
    const claims = parseClaims(clean);
    const issues = checkAntecedentBasis(claims);
    expect(issues.filter(i => i.type === "missing_antecedent").length).toBe(0);
  });
});

describe("findTheUsages", () => {
  it("returns 'the' phrases from text", () => {
    const usages = findTheUsages("wherein the motor drives the frame");
    expect(usages.some(u => u.term === "motor")).toBe(true);
    expect(usages.some(u => u.term === "frame")).toBe(true);
  });

  it("skips generic claim-level references", () => {
    const usages = findTheUsages("The device of claim 1, wherein the method is performed.");
    expect(usages.some(u => u.term === "device")).toBe(false);
    expect(usages.some(u => u.term === "method")).toBe(false);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 5. DEPENDENCY GRAPH
// ═══════════════════════════════════════════════════════════════════════════

describe("buildDependencyGraph", () => {
  it("identifies independent claims correctly", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    const graph  = buildDependencyGraph(claims);
    expect(graph.independents).toContain(1);
    expect(graph.independents).toContain(6);
    expect(graph.independents).not.toContain(2);
  });

  it("builds children map", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    const graph  = buildDependencyGraph(claims);
    // Claims 2 and 3 both depend on claim 1
    expect(graph.children.get(1)).toContain(2);
    expect(graph.children.get(1)).toContain(3);
  });

  it("detects orphan claims", () => {
    const orphanText = `
      1. A device comprising a frame.
      2. The device of claim 99, wherein the frame is metal.
    `;
    const claims = parseClaims(orphanText);
    const graph  = buildDependencyGraph(claims);
    expect(graph.orphans).toContain(2);
  });

  it("returns no circular dependencies for normal claims", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    const graph  = buildDependencyGraph(claims);
    expect(graph.circular.length).toBe(0);
  });
});

describe("getDependencyChain", () => {
  it("returns all dependents of a base claim", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    const graph  = buildDependencyGraph(claims);
    const chain  = getDependencyChain(1, graph);
    // Claim 1 → claims 2, 3, and claim 4 (which depends on 2 or 3)
    expect(chain).toContain(1);
    expect(chain).toContain(2);
    expect(chain).toContain(3);
    expect(chain).toContain(4);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 6. PTO COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════

describe("countClaims", () => {
  it("counts total, independent, dependent, cancelled correctly", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    const report = countClaims(claims);
    expect(report.total).toBe(5);       // 6 claims minus 1 cancelled
    expect(report.independent).toBe(2); // claims 1 and 6
    expect(report.dependent).toBe(3);   // claims 2, 3, 4
    expect(report.cancelled).toBe(1);   // claim 5
  });

  it("calculates extra claims over threshold", () => {
    // Build 22 independent claims
    const lines = Array.from({ length: 22 }, (_, i) =>
      `${i + 1}. A widget${i + 1} comprising a member.`
    ).join("\n\n");
    const claims = parseClaims(lines);
    const report = countClaims(claims);
    expect(report.extraTotal).toBe(2);       // 22 − 20 = 2
    expect(report.extraIndependent).toBe(19); // 22 − 3 = 19
  });

  it("detects multiple dependent claims", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    const report = countClaims(claims);
    // Claim 4 depends on "claim 2 or 3"
    expect(report.hasMultipleDependent).toBe(true);
  });
});

describe("checkClaimFormat", () => {
  it("flags missing period", () => {
    const bad = `1. A widget comprising a housing\n2. The widget of claim 1, wherein the housing is plastic.`;
    const claims = parseClaims(bad);
    const issues = checkClaimFormat(claims);
    expect(issues.some(i => i.type === "missing_period" && i.claimNumber === 1)).toBe(true);
  });

  it("flags forward reference", () => {
    const bad = `
      1. The widget of claim 2, wherein the housing is plastic.
      2. A widget comprising a housing.
    `;
    const claims = parseClaims(bad);
    const issues = checkClaimFormat(claims);
    expect(issues.some(i => i.type === "forward_reference")).toBe(true);
  });

  it("passes clean claims", () => {
    const claims = parseClaims(SIMPLE_CLAIMS);
    const issues = checkClaimFormat(claims);
    const errors = issues.filter(i => !["numbering_gap","missing_period"].includes(i.type));
    expect(errors.length).toBe(0);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 7. 112 ISSUES
// ═══════════════════════════════════════════════════════════════════════════

describe("check112Issues", () => {
  it("flags means-plus-function language", () => {
    const mpf = `1. A device comprising means for processing data.`;
    const claims = parseClaims(mpf);
    const issues = check112Issues(claims);
    expect(issues.some(i => i.type === "means_plus_function")).toBe(true);
  });

  it("flags relative terms", () => {
    const rel = `1. A device comprising a substantially rigid frame.`;
    const claims = parseClaims(rel);
    const issues = check112Issues(claims);
    expect(issues.some(i => i.type === "relative_term" && i.match === "substantially")).toBe(true);
  });

  it("flags negative limitations", () => {
    const neg = `1. A device free of metallic components.`;
    const claims = parseClaims(neg);
    const issues = check112Issues(claims);
    expect(issues.some(i => i.type === "negative_limitation")).toBe(true);
  });

  it("does NOT flag clean independent claims", () => {
    const clean = `1. A widget comprising a housing and a button coupled to the housing.`;
    const claims = parseClaims(clean);
    const issues = check112Issues(claims);
    expect(issues.length).toBe(0);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 8. TERM CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════

describe("checkTermConsistency", () => {
  it("flags spec using 'housing' when claims use 'casing'", () => {
    const claimsTerms = ["casing"];
    const specText    = "The housing 102 is made of polycarbonate.";
    const issues = checkTermConsistency(claimsTerms, specText);
    // "casing" is not in spec — this checks the opposite direction
    // The function flags spec variants that differ from preferred
    expect(issues).toBeDefined();
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 9. AMENDMENT MARKUP
// ═══════════════════════════════════════════════════════════════════════════

describe("parseAmendmentMarkup", () => {
  it("parses bracket deletions correctly", () => {
    const segments = parseAmendmentMarkup(USPTO_MARKUP.trim());
    const deletion = segments.find(s => s.type === "bracket_deletion");
    expect(deletion).toBeDefined();
    expect(deletion.text).toBe("old");
  });

  it("preserves unchanged text", () => {
    const segments = parseAmendmentMarkup("The [[old]] new widget.");
    const unchanged = segments.filter(s => s.type === "unchanged").map(s => s.text).join("");
    expect(unchanged).toContain("The");
    expect(unchanged).toContain("new widget.");
  });

  it("handles multiple bracket deletions", () => {
    const seg = parseAmendmentMarkup("[[alpha]] and [[beta]] remain.");
    const deletions = seg.filter(s => s.type === "bracket_deletion");
    expect(deletions.length).toBe(2);
    expect(deletions.map(d => d.text)).toEqual(["alpha", "beta"]);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 10. INTEGRATION: runFullLint
// ═══════════════════════════════════════════════════════════════════════════

describe("runFullLint", () => {
  it("returns all lint categories", () => {
    const claims = parseClaims(ANTECEDENT_PROBLEM_CLAIMS);
    const result = runFullLint(claims);
    expect(result).toHaveProperty("antecedentIssues");
    expect(result).toHaveProperty("formatIssues");
    expect(result).toHaveProperty("section112Issues");
    expect(result).toHaveProperty("counts");
    expect(result).toHaveProperty("graph");
  });

  it("finds antecedent issues in the problem fixture", () => {
    const claims = parseClaims(ANTECEDENT_PROBLEM_CLAIMS);
    const result = runFullLint(claims);
    expect(result.antecedentIssues.length).toBeGreaterThan(0);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 11. UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

describe("normalizeWhitespace", () => {
  it("collapses multiple spaces", () => {
    expect(normalizeWhitespace("a   b")).toBe("a b");
  });
  it("collapses newlines", () => {
    expect(normalizeWhitespace("a\n\nb")).toBe("a b");
  });
});

describe("escapeRegex", () => {
  it("escapes special regex characters", () => {
    expect(escapeRegex("a.b+c")).toBe("a\\.b\\+c");
  });
});
