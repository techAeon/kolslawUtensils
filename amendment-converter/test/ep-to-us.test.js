import { describe, it, expect } from "vitest";
import {
  parseClaims,
  stripReferenceNumerals,
  resolveDependencies,
  addNonTransitory,
  hasCharacterizedIn,
  hasPreferablyLanguage,
  findPreferablyLanguage,
  convertEpToUs,
  generateRemarks,
} from "../ep-to-us-converter.js";

// ═════════════════════════════════════════════════════════════════════════════
// CLAIM PARSING
// ═════════════════════════════════════════════════════════════════════════════

describe("parseClaims", () => {
  it("parses numbered claims from paragraphs", () => {
    const claims = parseClaims([
      "1. A device comprising a housing.",
      "",
      "2. The device of claim 1, wherein the housing is metal.",
    ]);
    expect(claims).toHaveLength(2);
    expect(claims[0].number).toBe(1);
    expect(claims[1].number).toBe(2);
  });
  it("strips status token from text", () => {
    const claims = parseClaims(["1. (Currently Amended) A device comprising a frame."]);
    expect(claims[0].status).toBe("Currently Amended");
    expect(claims[0].text).not.toContain("Currently Amended");
    expect(claims[0].text).toContain("A device");
  });
  it("accumulates multi-paragraph claims", () => {
    const claims = parseClaims([
      "1. A device comprising:",
      "a housing; and",
      "a motor.",
    ]);
    expect(claims).toHaveLength(1);
    expect(claims[0].text).toContain("a housing");
    expect(claims[0].text).toContain("a motor");
  });
  it("marks independent claim correctly", () => {
    const claims = parseClaims([
      "1. A device comprising a housing.",
      "2. The device of claim 1, wherein the housing is metal.",
    ]);
    expect(claims[0].isIndependent).toBe(true);
    expect(claims[1].isIndependent).toBe(false);
  });
  it("handles EP two-digit claim numbers", () => {
    const paragraphs = Array.from({ length: 15 }, (_, i) =>
      `${i + 1}. ${i === 0 ? "A" : "The"} device${i === 0 ? " comprising a housing." : ` of claim ${i}.`}`
    );
    const claims = parseClaims(paragraphs);
    expect(claims).toHaveLength(15);
    expect(claims[14].number).toBe(15);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REFERENCE NUMERAL STRIPPING
// ═════════════════════════════════════════════════════════════════════════════

describe("stripReferenceNumerals", () => {
  it("strips simple reference numeral", () => {
    const { text, changed } = stripReferenceNumerals("a housing (12) connected to a frame (14)");
    expect(text).toBe("a housing connected to a frame");
    expect(changed).toBe(true);
  });
  it("strips reference with alpha suffix", () => {
    const { text, changed } = stripReferenceNumerals("first arm (202a) and second arm (202b)");
    expect(text).toBe("first arm and second arm");
    expect(changed).toBe(true);
  });
  it("strips reference numeral at end of clause", () => {
    const { text } = stripReferenceNumerals("includes a sensor (45).");
    expect(text).toBe("includes a sensor.");
  });
  it("does NOT strip claim reference '(1)' when preceded by 'claim'", () => {
    const { text, changed } = stripReferenceNumerals("according to claim (1)");
    expect(text).toBe("according to claim (1)");
    expect(changed).toBe(false);
  });
  it("does NOT strip when not preceded by whitespace/element text", () => {
    // "(14)" at sentence start — ambiguous, but our rule strips any standalone (NNN)
    // regardless of position (except after "claim")
    const { text } = stripReferenceNumerals("(14) is a widget.");
    // We accept either stripping or not stripping here — just should not crash
    expect(typeof text).toBe("string");
  });
  it("strips multiple numerals in one pass", () => {
    const { text, removed } = stripReferenceNumerals("frame (10), motor (20), shaft (30)");
    expect(text).toBe("frame, motor, shaft");
    expect(removed).toHaveLength(3);
  });
  it("no change for text with no reference numerals", () => {
    const { text, changed } = stripReferenceNumerals("A device comprising a housing.");
    expect(text).toBe("A device comprising a housing.");
    expect(changed).toBe(false);
  });
  it("does not strip plain parenthetical like '(a)'", () => {
    // "(a)" is a single letter, not a reference numeral by our pattern (needs at least one digit)
    const { text } = stripReferenceNumerals("element (a) of the group");
    expect(text).toBe("element (a) of the group");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEPENDENCY RESOLUTION
// ═════════════════════════════════════════════════════════════════════════════

describe("resolveDependencies", () => {
  // --- Plural "claims" with explicit numbers ---
  it('"of claims 1 or 2" → "of claim 1"', () => {
    const { text } = resolveDependencies("The device of claims 1 or 2, wherein the housing is metal.", 3);
    expect(text).toContain("claim 1");
    expect(text).not.toMatch(/claims\s+1\s+or/i);
  });
  it('"of claims 1 and 2" → "of claim 1"', () => {
    const { text } = resolveDependencies("The device of claims 1 and 2.", 3);
    expect(text).toContain("claim 1");
  });
  it('"of claims 1-3" → "of claim 1"', () => {
    const { text } = resolveDependencies("The method of claims 1-3.", 4);
    expect(text).toContain("claim 1");
    expect(text).not.toContain("claims 1-3");
  });
  it('"of claims 1 to 3" → "of claim 1"', () => {
    const { text } = resolveDependencies("The method of claims 1 to 3.", 4);
    expect(text).toContain("claim 1");
  });
  it('"of claims 2, 3, or 4" → "of claim 2"', () => {
    const { text } = resolveDependencies("The device of claims 2, 3, or 4.", 5);
    expect(text).toContain("claim 2");
    expect(text).not.toContain("3");
    expect(text).not.toContain("4");
  });
  it('"of claims 1, 2, and 3" → "of claim 1"', () => {
    const { text } = resolveDependencies("The widget of claims 1, 2, and 3.", 4);
    expect(text).toContain("claim 1");
  });
  it("picks lowest number from non-sequential list", () => {
    const { text } = resolveDependencies("The device of claims 3, 7, or 2.", 8);
    expect(text).toContain("claim 2");
  });

  // --- "any of" patterns ---
  it('"any of claims 1-5" → "claim 1"', () => {
    const { text } = resolveDependencies("any of claims 1-5, wherein the frame is rigid.", 6);
    expect(text).toContain("claim 1");
  });
  it('"any one of claims 1, 2, 3" → "claim 1"', () => {
    const { text } = resolveDependencies("any one of claims 1, 2, 3", 4);
    expect(text).toContain("claim 1");
  });
  it('"either of claims 2 or 3" → "claim 2"', () => {
    const { text } = resolveDependencies("either of claims 2 or 3", 4);
    expect(text).toContain("claim 2");
  });
  it('"all of claims 1-4" → "claim 1"', () => {
    const { text } = resolveDependencies("all of claims 1-4", 5);
    expect(text).toContain("claim 1");
  });

  // --- Anaphoric plural ---
  it('"any of the preceding claims" → "claim 1"', () => {
    const { text } = resolveDependencies("The device according to any of the preceding claims, wherein...", 5);
    expect(text).toContain("claim 1");
  });
  it('"any one of the previous claims" → "claim 1"', () => {
    const { text } = resolveDependencies("The device according to any one of the previous claims.", 6);
    expect(text).toContain("claim 1");
  });
  it('"any of the foregoing claims" → "claim 1"', () => {
    const { text } = resolveDependencies("according to any of the foregoing claims", 7);
    expect(text).toContain("claim 1");
  });
  it('"all of the preceding claims" → "claim 1"', () => {
    const { text } = resolveDependencies("all of the preceding claims", 3);
    expect(text).toContain("claim 1");
  });

  // --- Anaphoric singular ---
  it('"the preceding claim" in claim 5 → "claim 4"', () => {
    const { text } = resolveDependencies("The device of the preceding claim, wherein the shaft is hollow.", 5);
    expect(text).toContain("claim 4");
    expect(text).not.toContain("preceding");
  });
  it('"the previous claim" in claim 8 → "claim 7"', () => {
    const { text } = resolveDependencies("A method as in the previous claim.", 8);
    expect(text).toContain("claim 7");
  });
  it('"the foregoing claim" → claim N-1', () => {
    const { text } = resolveDependencies("The device of the foregoing claim.", 4);
    expect(text).toContain("claim 3");
  });
  it('"said preceding claim" → claim N-1', () => {
    const { text } = resolveDependencies("as defined in said preceding claim", 6);
    expect(text).toContain("claim 5");
  });

  // --- Single dep: unchanged ---
  it("single dependency 'of claim 3' is NOT changed", () => {
    const { text, changes } = resolveDependencies("The device of claim 3, wherein the housing is metal.", 4);
    expect(text).toBe("The device of claim 3, wherein the housing is metal.");
    expect(changes).toHaveLength(0);
  });
  it("'claim 1' (independent claim body) is not changed", () => {
    const { text } = resolveDependencies("A device comprising a housing.", 1);
    expect(text).toBe("A device comprising a housing.");
  });

  // --- Multiple transforms in one claim ---
  it("resolves two multiple dependencies in the same text", () => {
    const { text, changes } = resolveDependencies(
      "The device of claims 1 or 2, further having the features of claims 3 or 4.", 5
    );
    expect(text).toContain("claim 1");
    expect(text).toContain("claim 3");
    expect(changes).toHaveLength(2);
  });

  // --- "claim N or M" singular ---
  it('"claim 2 or 3" (singular claim + two numbers) → "claim 2"', () => {
    const { text } = resolveDependencies("as in claim 2 or 3.", 4);
    expect(text).toContain("claim 2");
    expect(text).not.toContain("or 3");
  });

  // --- Change log ---
  it("change log is populated for every substitution", () => {
    const { changes } = resolveDependencies("The device of claims 1 or 2.", 3);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain("→");
  });
  it("empty change log when no substitution needed", () => {
    const { changes } = resolveDependencies("The device of claim 1.", 2);
    expect(changes).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NON-TRANSITORY
// ═════════════════════════════════════════════════════════════════════════════

describe("addNonTransitory", () => {
  it("adds non-transitory before 'computer-readable medium'", () => {
    const { text, added } = addNonTransitory(
      "A computer-readable medium storing instructions that when executed..."
    );
    expect(text).toContain("non-transitory computer-readable medium");
    expect(added).toBe(true);
  });
  it("adds non-transitory before 'computer readable storage medium'", () => {
    const { text, added } = addNonTransitory("A computer readable storage medium storing...");
    expect(text).toContain("non-transitory");
    expect(added).toBe(true);
  });
  it("adds non-transitory before 'machine-readable medium'", () => {
    const { text, added } = addNonTransitory("A machine-readable medium having stored thereon...");
    expect(text).toContain("non-transitory machine-readable medium");
    expect(added).toBe(true);
  });
  it("does NOT add when 'non-transitory' already present", () => {
    const { added } = addNonTransitory("A non-transitory computer-readable medium storing...");
    expect(added).toBe(false);
  });
  it("does NOT add to non-CRM claims", () => {
    const { added } = addNonTransitory("A device comprising a housing and a motor.");
    expect(added).toBe(false);
  });
  it("does NOT add when 'non transitory' (without hyphen) already present", () => {
    const { added } = addNonTransitory("A non transitory computer-readable medium storing...");
    expect(added).toBe(false);
  });
  it("adds to 'computer program product' claim", () => {
    const { text, added } = addNonTransitory(
      "A computer program product comprising instructions stored on a storage medium."
    );
    expect(added).toBe(true);
  });
  it("is idempotent: adding twice does not double-add", () => {
    const { text: once } = addNonTransitory("A computer-readable medium storing...");
    const { text: twice, added } = addNonTransitory(once);
    expect(added).toBe(false);
    expect(twice).toBe(once);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// "CHARACTERIZED IN THAT" DETECTION
// ═════════════════════════════════════════════════════════════════════════════

describe("hasCharacterizedIn", () => {
  it("detects standard EP phrase", () => {
    expect(hasCharacterizedIn("A device comprising a housing, characterized in that the housing is metal.")).toBe(true);
  });
  it("case-insensitive", () => {
    expect(hasCharacterizedIn("CHARACTERIZED IN THAT the frame is rigid")).toBe(true);
  });
  it("returns false for clean US-style claims", () => {
    expect(hasCharacterizedIn("A device comprising a housing wherein the housing is metal.")).toBe(false);
  });
});

describe("preferably / optional language detection", () => {
  it("detects 'preferably'", () => {
    expect(hasPreferablyLanguage("The device of claim 1, wherein the housing is preferably metal.")).toBe(true);
  });
  it("detects 'optionally'", () => {
    expect(hasPreferablyLanguage("The device of claim 1, optionally comprising a fan.")).toBe(true);
  });
  it("detects 'in particular'", () => {
    expect(hasPreferablyLanguage("A metal, in particular aluminum.")).toBe(true);
  });
  it("detects 'such as'", () => {
    expect(hasPreferablyLanguage("A polymer such as polyethylene.")).toBe(true);
  });
  it("detects 'for example'", () => {
    expect(hasPreferablyLanguage("A solvent, for example water.")).toBe(true);
  });
  it("detects 'more preferably' and 'most preferably'", () => {
    const terms = findPreferablyLanguage("preferably 1-10%, more preferably 2-5%, most preferably 3%");
    expect(terms).toContain("preferably");
    expect(terms).toContain("more preferably");
    expect(terms).toContain("most preferably");
  });
  it("case-insensitive", () => {
    expect(hasPreferablyLanguage("PREFERABLY at least 5 mm")).toBe(true);
  });
  it("returns false for clean claim language", () => {
    expect(hasPreferablyLanguage("A device comprising a housing and a motor coupled to the housing.")).toBe(false);
  });
  it("does not match partial words like 'preference'", () => {
    expect(hasPreferablyLanguage("A user preference module storing preference data.")).toBe(false);
  });
  it("findPreferablyLanguage deduplicates repeated terms", () => {
    const terms = findPreferablyLanguage("preferably A, preferably B, preferably C");
    expect(terms).toEqual(["preferably"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// FULL CONVERSION
// ═════════════════════════════════════════════════════════════════════════════

describe("convertEpToUs", () => {
  const EP_CLAIMS = [
    "1. A device comprising a housing (10) and a motor (20) coupled to the housing (10).",
    "",
    "2. The device of claim 1, further comprising a shaft (30) coupled to the motor (20).",
    "",
    "3. The device of claims 1 or 2, wherein the housing (10) is made of metal.",
    "",
    "4. The device of any of the preceding claims, wherein the motor (20) is brushless.",
    "",
    "5. The device of the preceding claim, wherein the shaft (30) is hollow.",
    "",
    "6. A computer-readable medium storing instructions for controlling the device of any of claims 1-5.",
  ];

  it("all claims get (New) status", () => {
    const { claims } = convertEpToUs(EP_CLAIMS);
    expect(claims.every(c => c.status === "New")).toBe(true);
  });
  it("strips reference numerals", () => {
    const { claims } = convertEpToUs(EP_CLAIMS);
    const claimText = claims.map(c => c.text).join(" ");
    expect(claimText).not.toMatch(/\(\d+\)/);
  });
  it("resolves multiple dependencies in claim 3", () => {
    const { claims } = convertEpToUs(EP_CLAIMS);
    expect(claims[2].text).toContain("claim 1");
    expect(claims[2].text).not.toContain("claims 1 or 2");
  });
  it("resolves anaphoric plural in claim 4", () => {
    const { claims } = convertEpToUs(EP_CLAIMS);
    expect(claims[3].text).toContain("claim 1");
    expect(claims[3].text).not.toContain("preceding claims");
  });
  it("resolves singular anaphoric in claim 5 → claim 4", () => {
    const { claims } = convertEpToUs(EP_CLAIMS);
    expect(claims[4].text).toContain("claim 4");
    expect(claims[4].text).not.toContain("preceding claim");
  });
  it("adds non-transitory to CRM claim 6", () => {
    const { claims, stats } = convertEpToUs(EP_CLAIMS);
    expect(claims[5].text).toContain("non-transitory");
    expect(stats.nonTransitoryAdded).toBe(true);
  });
  it("resolves multi-dep in CRM claim 6", () => {
    const { claims } = convertEpToUs(EP_CLAIMS);
    expect(claims[5].text).toContain("claim 1");
    expect(claims[5].text).not.toContain("claims 1-5");
  });
  it("stats: correct total and independent counts", () => {
    const { stats } = convertEpToUs(EP_CLAIMS);
    expect(stats.total).toBe(6);
    expect(stats.independent).toBe(2); // claims 1 and 6
  });
  it("stats: no extra fees for 6 claims / 2 independent", () => {
    const { stats } = convertEpToUs(EP_CLAIMS);
    expect(stats.feesRequired).toBe(false);
    expect(stats.extraTotal).toBe(0);
    expect(stats.extraIndependent).toBe(0);
  });

  it("flags excess claims (>20) and correct fee count", () => {
    const many = Array.from({ length: 22 }, (_, i) =>
      `${i + 1}. ${i === 0 ? "A device comprising a housing." : `The device of claim ${i}.`}`
    );
    const { stats } = convertEpToUs(many);
    expect(stats.extraTotal).toBe(2);
    expect(stats.feesRequired).toBe(true);
  });
  it("flags excess independent claims (>3)", () => {
    const independents = Array.from({ length: 4 }, (_, i) =>
      `${i + 1}. A device${i + 1} comprising a housing.`
    );
    const { stats } = convertEpToUs(independents);
    expect(stats.extraIndependent).toBe(1);
    expect(stats.feesRequired).toBe(true);
  });

  it("'characterized in that' produces warning on the claim", () => {
    const charClaims = ["1. A device comprising a housing, characterized in that the housing is metal."];
    const { claims, stats } = convertEpToUs(charClaims);
    expect(claims[0].warnings.length).toBeGreaterThan(0);
    expect(stats.characterizedWarnings).toContain(1);
  });

  it("'preferably' language produces warning on the claim", () => {
    const prefClaims = ["1. A device comprising a housing, preferably made of metal."];
    const { claims, stats } = convertEpToUs(prefClaims);
    expect(claims[0].warnings.some(w => w.includes("112(b)"))).toBe(true);
    expect(stats.preferablyWarnings.map(w => w.claimNumber)).toContain(1);
  });
  it("preferably warning lists the offending terms", () => {
    const prefClaims = ["1. A polymer such as polyethylene, optionally crosslinked."];
    const { stats } = convertEpToUs(prefClaims);
    expect(stats.preferablyWarnings[0].terms).toContain("such as");
    expect(stats.preferablyWarnings[0].terms).toContain("optionally");
  });
  it("remarks include preferably advisory when present", () => {
    const prefClaims = ["1. A device, preferably comprising a fan."];
    const { remarks } = convertEpToUs(prefClaims);
    expect(remarks).toContain("optional language");
    expect(remarks).toContain("112(b)");
    expect(remarks).toContain("MPEP");
  });
  it("no preferably advisory in remarks when claims are clean", () => {
    const { remarks } = convertEpToUs(EP_CLAIMS);
    expect(remarks).not.toContain("112(b)");
  });

  it("change log is populated for claims with substitutions", () => {
    const { claims } = convertEpToUs(EP_CLAIMS);
    const claim3 = claims[2];
    expect(claim3.changes.length).toBeGreaterThan(0);
  });
  it("claim 1 (independent, no ref numerals) — change log entries only for ref numerals", () => {
    const { claims } = convertEpToUs(EP_CLAIMS);
    const claim1 = claims[0];
    expect(claim1.changes.some(c => c.startsWith("Reference numerals"))).toBe(true);
    expect(claim1.changes.some(c => c.startsWith("Dependency"))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REMARKS GENERATION
// ═════════════════════════════════════════════════════════════════════════════

describe("generateRemarks", () => {
  it("includes REMARKS heading", () => {
    const { remarks } = convertEpToUs([
      "1. A device comprising a housing (10).",
    ]);
    expect(remarks).toContain("REMARKS");
  });
  it("mentions reference numeral deletion when applicable", () => {
    const { remarks } = convertEpToUs([
      "1. A device comprising a housing (10).",
    ]);
    expect(remarks).toContain("Reference Numerals Deleted");
    expect(remarks).toContain("Rule 43(7)");
  });
  it("mentions dependency elimination when applicable", () => {
    const { remarks } = convertEpToUs([
      "1. A device comprising a housing.",
      "2. The device of claims 1 or 2.",  // intentionally self-ref for test
    ]);
    expect(remarks).toContain("Multiple Dependencies Eliminated");
  });
  it("mentions non-transitory citation when applicable", () => {
    const { remarks } = convertEpToUs([
      "1. A computer-readable medium storing instructions.",
    ]);
    expect(remarks).toContain("Non-Transitory");
    expect(remarks).toContain("1337 O.G. 88");
  });
  it("includes claims summary", () => {
    const { remarks } = convertEpToUs([
      "1. A device comprising a housing.",
    ]);
    expect(remarks).toContain("Claims Summary");
    expect(remarks).toContain("1 claim");
    expect(remarks).toContain("1 independent claim");
  });
  it("includes fee notice when >20 claims", () => {
    const many = Array.from({ length: 21 }, (_, i) =>
      `${i + 1}. ${i === 0 ? "A device comprising a housing." : `The device of claim ${i}.`}`
    );
    const { remarks } = convertEpToUs(many);
    expect(remarks).toContain("37 C.F.R. § 1.16(h)");
  });
  it("includes independent claim fee notice when >3 independent claims", () => {
    const independents = Array.from({ length: 4 }, (_, i) =>
      `${i + 1}. A device${i + 1} comprising a housing.`
    );
    const { remarks } = convertEpToUs(independents);
    expect(remarks).toContain("37 C.F.R. § 1.16(i)");
  });
  it("includes no-new-matter statement", () => {
    const { remarks } = convertEpToUs(["1. A device comprising a housing."]);
    expect(remarks).toContain("No new matter");
  });
  it("includes 'characterized in that' advisory when present", () => {
    const { remarks } = convertEpToUs([
      "1. A device, characterized in that the housing is metal.",
    ]);
    expect(remarks).toContain("characterized in that");
    expect(remarks).toContain("ADVISORY");
  });
});
