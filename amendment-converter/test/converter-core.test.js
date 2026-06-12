import { describe, it, expect } from "vitest";
import {
  parse, serialize,
  hasTrackedChanges, hasUsptoCues, hasMixedFormats,
  applyTcToUsptoTransform, applyUsptoToTcTransform,
  acceptUsptMarkup, NS,
} from "../converter-core.js";
import { doc, para, run, ins, del, delRun, count, allText } from "./ooxml-helpers.js";

// ═════════════════════════════════════════════════════════════════════════════
// DETECTION
// ═════════════════════════════════════════════════════════════════════════════

describe("hasTrackedChanges", () => {
  it("returns true when w:ins present", () => {
    const d = parse(doc(para(ins(1, run("added")))));
    expect(hasTrackedChanges(d)).toBe(true);
  });
  it("returns true when w:del present", () => {
    const d = parse(doc(para(del(1, "removed"))));
    expect(hasTrackedChanges(d)).toBe(true);
  });
  it("returns false for plain text", () => {
    const d = parse(doc(para(run("plain text"))));
    expect(hasTrackedChanges(d)).toBe(false);
  });
  it("returns false for empty document", () => {
    const d = parse(doc(para()));
    expect(hasTrackedChanges(d)).toBe(false);
  });
});

describe("hasUsptoCues", () => {
  it("detects underlined run", () => {
    const d = parse(doc(para(run("added", { underline: true }))));
    expect(hasUsptoCues(d)).toBe(true);
  });
  it("detects strikethrough run", () => {
    const d = parse(doc(para(run("deleted", { strike: true }))));
    expect(hasUsptoCues(d)).toBe(true);
  });
  it("detects double-strikethrough (dstrike)", () => {
    const d = parse(doc(para(run("gone", { dstrike: true }))));
    expect(hasUsptoCues(d)).toBe(true);
  });
  it("detects [[bracket]] deletion", () => {
    const d = parse(doc(para(run("[[hi]]"))));
    expect(hasUsptoCues(d)).toBe(true);
  });
  it("ignores w:u val=none (explicit no-underline)", () => {
    const d = parse(doc(para(run("text", { underline: true, uVal: "none" }))));
    expect(hasUsptoCues(d)).toBe(false);
  });
  it("does NOT flag underline/strike inside w:ins (TC format)", () => {
    const d = parse(doc(para(ins(1, run("added", { underline: true })))));
    expect(hasUsptoCues(d)).toBe(false);
  });
  it("returns false for plain text", () => {
    const d = parse(doc(para(run("nothing special"))));
    expect(hasUsptoCues(d)).toBe(false);
  });
  it("ignores single brackets [text] (not USPTO format)", () => {
    const d = parse(doc(para(run("[optional element]"))));
    expect(hasUsptoCues(d)).toBe(false);
  });
});

describe("hasMixedFormats", () => {
  it("true when both TC and USPTO cues present", () => {
    const d = parse(doc(para(
      ins(1, run("new")),
      run("deleted", { strike: true }),
    )));
    expect(hasMixedFormats(d)).toBe(true);
  });
  it("false when only TC", () => {
    const d = parse(doc(para(ins(1, run("new")))));
    expect(hasMixedFormats(d)).toBe(false);
  });
  it("false when only USPTO", () => {
    const d = parse(doc(para(run("gone", { strike: true }))));
    expect(hasMixedFormats(d)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TC → USPTO TRANSFORM
// ═════════════════════════════════════════════════════════════════════════════

describe("applyTcToUsptoTransform — insertions", () => {
  it("underlines inserted text and removes w:ins wrapper", () => {
    const d = parse(doc(para(ins(1, run("hello")))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).not.toContain("w:ins");
    expect(out).toContain("w:u");
    expect(out).toContain("hello");
  });
  it("strips existing strike from inserted run", () => {
    const d = parse(doc(para(ins(1, run("added", { strike: true })))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("w:u");
    expect(out).not.toContain("w:strike");
  });
  it("preserves existing run content (bold etc.) except formatting removed", () => {
    const d = parse(doc(para(
      ins(1, `<w:r><w:rPr><w:b/></w:rPr><w:t>bold insertion</w:t></w:r>`)
    )));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("bold insertion");
    expect(out).toContain("w:b"); // bold preserved
    expect(out).toContain("w:u"); // underline added
  });
  it("handles multiple insertions in sequence", () => {
    const d = parse(doc(para(
      ins(1, run("first")),
      run(" unchanged "),
      ins(2, run("second")),
    )));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(count(out, "w:u")).toBeGreaterThanOrEqual(2);
    expect(out).not.toContain("w:ins");
  });
});

describe("applyTcToUsptoTransform — deletions mixed mode", () => {
  it("converts short deletion (≤4 chars) to [[brackets]]", () => {
    const d = parse(doc(para(del(1, "abc"))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).not.toContain("w:del");
    expect(out).toContain("[[abc]]");
    expect(out).not.toContain("w:strike");
  });
  it("exactly 4 chars → brackets", () => {
    const d = parse(doc(para(del(1, "abcd"))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("[[abcd]]");
  });
  it("5 chars → strikethrough, not brackets", () => {
    const d = parse(doc(para(del(1, "abcde"))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("w:strike");
    expect(out).not.toContain("[[");
  });
  it("converts long deletion (>4 chars) to strikethrough", () => {
    const d = parse(doc(para(del(1, "longer deletion"))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).not.toContain("w:del");
    expect(out).toContain("w:strike");
    expect(out).toContain("longer deletion");
    expect(out).not.toContain("[[");
  });
  it("claim number deletion (e.g. '1. ') → brackets in mixed mode", () => {
    // "1. " is 3 chars ≤ 4 → brackets
    const d = parse(doc(para(del(1, "1. "), run("The device..."))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("[[1. ]]");
    expect(out).not.toContain("w:del");
  });
  it("claim number deletion (5-char '12.  ') → strikethrough", () => {
    const d = parse(doc(para(del(1, "12.  "), run("The device..."))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("w:strike");
    expect(out).not.toContain("[[");
  });
  it("strips underline from short bracketed deletion run", () => {
    const d = parse(doc(para(delRun(1, "no", `<w:rPr><w:u w:val="single"/></w:rPr>`))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("[[no]]");
    expect(out).not.toContain("w:u");
  });
  it("multi-run deletion — full text bracketed in first run, extra runs removed", () => {
    // Deletion spanning two runs: "ab" + "c" = "abc" (≤4 → brackets)
    const d = parse(doc(para(
      `<w:del w:id="1" w:author="T" w:date="2024-01-01T00:00:00Z">`
        + `<w:r><w:delText>ab</w:delText></w:r>`
        + `<w:r><w:delText>c</w:delText></w:r>`
      + `</w:del>`
    )));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("[[abc]]");
    // Only one <w:t> node for the bracket (the second run was removed)
    expect(count(out, "<w:t")).toBe(1);
  });
});

describe("applyTcToUsptoTransform — strike-only mode", () => {
  it("all deletions become strikethrough regardless of length", () => {
    const d = parse(doc(para(del(1, "no"), del(2, "yes longer"))));
    const out = applyTcToUsptoTransform(d, "strikethrough");
    expect(out).not.toContain("[[");
    expect(count(out, "w:strike")).toBeGreaterThanOrEqual(2);
  });
  it("short deletion (2 chars) → strikethrough in strike mode", () => {
    const d = parse(doc(para(del(1, "ab"))));
    const out = applyTcToUsptoTransform(d, "strikethrough");
    expect(out).toContain("w:strike");
    expect(out).not.toContain("[[");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// USPTO → TC TRANSFORM
// ═════════════════════════════════════════════════════════════════════════════

describe("applyUsptoToTcTransform — insertions", () => {
  it("wraps underlined run in w:ins and removes underline", () => {
    const d = parse(doc(para(run("added", { underline: true }))));
    const out = applyUsptoToTcTransform(d);
    expect(out).toContain("w:ins");
    expect(out).not.toContain("w:u");
    expect(out).toContain("added");
  });
  it("sets author to Kolslaw", () => {
    const d = parse(doc(para(run("text", { underline: true }))));
    const out = applyUsptoToTcTransform(d);
    expect(out).toContain('w:author="Kolslaw"');
  });
  it("generates sequential IDs continuing past existing ones", () => {
    const d = parse(doc(para(
      ins(5, run("existing")),
      run("new", { underline: true }),
    )));
    const out = applyUsptoToTcTransform(d);
    // New w:ins should have id > 5
    const ids = [...out.matchAll(/w:id="(\d+)"/g)].map(m => parseInt(m[1]));
    expect(ids.some(id => id > 5)).toBe(true);
  });
  it("does NOT re-wrap runs already inside w:ins", () => {
    const d = parse(doc(para(ins(1, run("safe", { underline: true })))));
    const out = applyUsptoToTcTransform(d);
    // Should not create a nested w:ins
    expect(count(out, "<w:ins")).toBe(1);
  });
});

describe("applyUsptoToTcTransform — strikethrough deletions", () => {
  it("wraps struck run in w:del and converts w:t to w:delText", () => {
    const d = parse(doc(para(run("removed", { strike: true }))));
    const out = applyUsptoToTcTransform(d);
    expect(out).toContain("w:del");
    expect(out).toContain("w:delText");
    expect(out).not.toContain("w:strike");
    expect(out).toContain("removed");
  });
  it("handles w:dstrike as deletion", () => {
    const d = parse(doc(para(run("gone", { dstrike: true }))));
    const out = applyUsptoToTcTransform(d);
    expect(out).toContain("w:del");
    expect(out).not.toContain("w:dstrike");
  });
});

describe("applyUsptoToTcTransform — bracket deletions", () => {
  it("converts [[bracket]] run to w:del with inner text as delText", () => {
    const d = parse(doc(para(run("[[abc]]"))));
    const out = applyUsptoToTcTransform(d);
    expect(out).toContain("w:del");
    expect(out).toContain("w:delText");
    expect(out).toContain("abc");
    expect(out).not.toContain("[[");
    expect(out).not.toContain("]]");
  });
  it("empty brackets [[]] → empty delText", () => {
    const d = parse(doc(para(run("[[]]"))));
    const out = applyUsptoToTcTransform(d);
    expect(out).toContain("w:del");
    // delText content is empty (may be self-closing or explicit closing tag)
    expect(out).toMatch(/<w:delText[^>]*(?:\/>|><\/w:delText>)/);
  });
  it("unclosed bracket [[text does NOT become deletion", () => {
    const d = parse(doc(para(run("[[unclosed"))));
    const out = applyUsptoToTcTransform(d);
    expect(out).not.toContain("w:del");
    expect(out).toContain("[[unclosed");
  });
  it("single bracket [text] does NOT become deletion", () => {
    const d = parse(doc(para(run("[optional]"))));
    const out = applyUsptoToTcTransform(d);
    expect(out).not.toContain("w:del");
    expect(out).toContain("[optional]");
  });
  it("[[text] with only one closing bracket does NOT become deletion", () => {
    const d = parse(doc(para(run("[[half]"))));
    const out = applyUsptoToTcTransform(d);
    expect(out).not.toContain("w:del");
    expect(out).toContain("[[half]");
  });
  it("[[brackets]] mid-run content (run has prefix text) — only full-run pattern matches", () => {
    // A run whose full text is "prefix [[abc]]" should NOT match (not a full-run bracket)
    const d = parse(doc(para(run("prefix [[abc]]"))));
    const out = applyUsptoToTcTransform(d);
    expect(out).not.toContain("w:del");
  });
  it("space preserved inside brackets", () => {
    const d = parse(doc(para(run("[[ hi ]]"))));
    const out = applyUsptoToTcTransform(d);
    expect(out).toContain("w:del");
    expect(out).toContain(" hi ");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ROUND-TRIP FIDELITY
// ═════════════════════════════════════════════════════════════════════════════

describe("round-trip: TC → USPTO → TC", () => {
  it("inserted text survives round-trip (text content preserved)", () => {
    const original = doc(para(ins(1, run("hello world")), run(" unchanged")));
    const d1 = parse(original);
    const uspto = applyTcToUsptoTransform(d1, "mixed");
    const d2 = parse(uspto);
    const backToTc = applyUsptoToTcTransform(d2);
    expect(allText(backToTc)).toContain("hello world");
    expect(backToTc).toContain("w:ins");
  });
  it("long deletion survives round-trip (strike → del)", () => {
    const original = doc(para(del(1, "deleted phrase")));
    const d1 = parse(original);
    const uspto = applyTcToUsptoTransform(d1, "mixed");
    const d2 = parse(uspto);
    const backToTc = applyUsptoToTcTransform(d2);
    expect(backToTc).toContain("w:del");
    expect(backToTc).toContain("deleted phrase");
  });
  it("short bracket deletion round-trips correctly", () => {
    const original = doc(para(del(1, "old")));
    const d1 = parse(original);
    const uspto = applyTcToUsptoTransform(d1, "mixed");
    expect(uspto).toContain("[[old]]");
    const d2 = parse(uspto);
    const backToTc = applyUsptoToTcTransform(d2);
    expect(backToTc).toContain("w:del");
    expect(backToTc).toContain("old");
  });
  it("plain text is not altered during round-trip", () => {
    const original = doc(para(
      ins(1, run("new text")),
      run("unchanged portion"),
      del(2, "old text"),
    ));
    const d = parse(original);
    const uspto = applyTcToUsptoTransform(d, "mixed");
    const d2 = parse(uspto);
    const back = applyUsptoToTcTransform(d2);
    expect(allText(back)).toContain("unchanged portion");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ACCEPT USPTO MARKUP
// ═════════════════════════════════════════════════════════════════════════════

describe("acceptUsptMarkup", () => {
  it("keeps underlined (insertion) text and removes formatting", () => {
    const d = parse(doc(para(run("kept", { underline: true }))));
    const out = acceptUsptMarkup(d);
    expect(allText(out)).toContain("kept");
    expect(out).not.toContain("w:u");
  });
  it("removes strikethrough (deletion) run entirely", () => {
    const d = parse(doc(para(run("deleted", { strike: true }))));
    acceptUsptMarkup(d);
    expect(allText(serialize(d))).not.toContain("deleted");
  });
  it("removes [[bracket]] run entirely", () => {
    const d = parse(doc(para(run("[[gone]]"))));
    acceptUsptMarkup(d);
    expect(serialize(d)).not.toContain("gone");
  });
  it("leaves plain text untouched", () => {
    const d = parse(doc(para(run("plain text"))));
    acceptUsptMarkup(d);
    expect(allText(serialize(d))).toContain("plain text");
  });
  it("mixed: keeps insertion, removes deletion", () => {
    const d = parse(doc(para(
      run("keep", { underline: true }),
      run(" unchanged "),
      run("remove", { strike: true }),
    )));
    acceptUsptMarkup(d);
    const txt = allText(serialize(d));
    expect(txt).toContain("keep");
    expect(txt).toContain("unchanged");
    expect(txt).not.toContain("remove");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("empty w:ins (no runs) does not crash", () => {
    const d = parse(doc(para(
      `<w:ins w:id="1" w:author="T" w:date="2024-01-01T00:00:00Z"></w:ins>`
    )));
    expect(() => applyTcToUsptoTransform(d, "mixed")).not.toThrow();
  });
  it("empty w:del does not crash", () => {
    const d = parse(doc(para(
      `<w:del w:id="1" w:author="T" w:date="2024-01-01T00:00:00Z"></w:del>`
    )));
    expect(() => applyTcToUsptoTransform(d, "mixed")).not.toThrow();
  });
  it("document with no changes is returned unchanged by both transforms", () => {
    const d = parse(doc(para(run("no changes here"))));
    const out1 = applyTcToUsptoTransform(d, "mixed");
    expect(out1).toContain("no changes here");
    const d2 = parse(out1);
    const out2 = applyUsptoToTcTransform(d2);
    expect(out2).toContain("no changes here");
  });
  it("multiple consecutive deletions all converted (no skipping)", () => {
    const d = parse(doc(para(
      del(1, "a"),
      del(2, "bb"),
      del(3, "ccc"),
      del(4, "dddd"),
      del(5, "eeeee"),
    )));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("[[a]]");
    expect(out).toContain("[[bb]]");
    expect(out).toContain("[[ccc]]");
    expect(out).toContain("[[dddd]]");
    expect(out).toContain("w:strike"); // eeeee → strikethrough
    expect(out).not.toContain("w:del");
  });
  it("insertion and deletion adjacent — both converted correctly", () => {
    const d = parse(doc(para(
      ins(1, run("new")),
      del(2, "old"),
    )));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("w:u");
    expect(out).toContain("[[old]]");
    expect(out).not.toContain("w:ins");
    expect(out).not.toContain("w:del");
  });
  it("nested formatting inside insertion is preserved after transform", () => {
    const d = parse(doc(para(
      ins(1, `<w:r><w:rPr><w:i/></w:rPr><w:t>italic add</w:t></w:r>`)
    )));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("italic add");
    expect(out).toContain("w:i");
    expect(out).toContain("w:u");
  });
  it("USPTO→TC does not double-wrap already-wrapped runs", () => {
    const alreadyWrapped = doc(para(
      `<w:ins w:id="1" w:author="K" w:date="2024-01-01T00:00:00Z">`
        + run("already", { underline: true })
      + `</w:ins>`
    ));
    const d = parse(alreadyWrapped);
    const out = applyUsptoToTcTransform(d);
    expect(count(out, "<w:ins")).toBe(1);
  });
  it("claim number in deletion ('21. ') handled without crash", () => {
    const d = parse(doc(para(
      del(1, "21. "),
      ins(2, run("22. ")),
      run("A new claim comprising..."),
    )));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).not.toContain("w:del");
    expect(out).not.toContain("w:ins");
    expect(out).toContain("[[21. ]]");
    expect(out).toContain("22. ");
  });
  it("very long deletion (100+ chars) → strikethrough in mixed mode", () => {
    const longText = "x".repeat(120);
    const d = parse(doc(para(del(1, longText))));
    const out = applyTcToUsptoTransform(d, "mixed");
    expect(out).toContain("w:strike");
    expect(out).not.toContain("[[");
    expect(out).toContain(longText);
  });
});
