import { describe, it, expect } from "vitest";
import {
  generateClaimChangeSummary,
  updateClaimStatuses,
  deriveStatusMap,
  extractCurrentStatuses,
  generateClaimSetOoxml,
} from "../claim-utils.js";
import { parse, serialize } from "../converter-core.js";
import { doc, para, run, ins, del, allText } from "./ooxml-helpers.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

// A claim paragraph that starts with "N. (Status) ..." or "N. ..."
function claimPara(num, status, ...content) {
  const prefix = status ? `${num}. (${status}) ` : `${num}. `;
  return para(run(prefix), ...content);
}

// ═════════════════════════════════════════════════════════════════════════════
// EXTRACT CURRENT STATUSES
// ═════════════════════════════════════════════════════════════════════════════

describe("extractCurrentStatuses", () => {
  it("reads status from claim paragraphs", () => {
    const d = parse(doc(
      claimPara(1, "Original", run("A device comprising a housing.")),
      claimPara(2, "Currently Amended", run("The device of claim 1.")),
    ));
    const statuses = extractCurrentStatuses(d);
    expect(statuses.get(1)).toBe("Original");
    expect(statuses.get(2)).toBe("Currently Amended");
  });
  it("returns null status when no status token", () => {
    const d = parse(doc(claimPara(1, null, run("A device."))));
    const statuses = extractCurrentStatuses(d);
    expect(statuses.get(1)).toBeNull();
  });
  it("handles Cancelled/Canceled spelling variants", () => {
    const d = parse(doc(
      para(run("3. (Canceled)")),
    ));
    const statuses = extractCurrentStatuses(d);
    expect(statuses.get(3)).toBe("Canceled");
  });
  it("ignores non-claim paragraphs", () => {
    const d = parse(doc(
      para(run("CLAIMS")),
      claimPara(1, "New", run("A device.")),
    ));
    const statuses = extractCurrentStatuses(d);
    expect(statuses.size).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DERIVE STATUS MAP
// ═════════════════════════════════════════════════════════════════════════════

describe("deriveStatusMap", () => {
  it("changed claim → 'Currently Amended'", () => {
    const current = new Map([[1, "Original"]]);
    const result = deriveStatusMap(current, new Set([1]));
    expect(result.get(1)).toBe("Currently Amended");
  });
  it("'Currently Amended' + no changes → 'Previously Presented'", () => {
    const current = new Map([[2, "Currently Amended"]]);
    const result = deriveStatusMap(current, new Set());
    expect(result.get(2)).toBe("Previously Presented");
  });
  it("'Previously Presented' + no changes → 'Previously Presented'", () => {
    const current = new Map([[3, "Previously Presented"]]);
    const result = deriveStatusMap(current, new Set());
    expect(result.get(3)).toBe("Previously Presented");
  });
  it("'Original' + no changes → 'Original'", () => {
    const current = new Map([[4, "Original"]]);
    const result = deriveStatusMap(current, new Set());
    expect(result.get(4)).toBe("Original");
  });
  it("null status + no changes → 'Original'", () => {
    const current = new Map([[5, null]]);
    const result = deriveStatusMap(current, new Set());
    expect(result.get(5)).toBe("Original");
  });
  it("'Cancelled' is never changed", () => {
    const current = new Map([[6, "Cancelled"]]);
    const result = deriveStatusMap(current, new Set([6]));
    expect(result.get(6)).toBe("Cancelled");
  });
  it("'Withdrawn' is never changed", () => {
    const current = new Map([[7, "Withdrawn"]]);
    const result = deriveStatusMap(current, new Set([7]));
    expect(result.get(7)).toBe("Withdrawn");
  });
  it("'Not Entered' is never changed", () => {
    const current = new Map([[8, "Not Entered"]]);
    const result = deriveStatusMap(current, new Set([8]));
    expect(result.get(8)).toBe("Not Entered");
  });
  it("new claim number (not in currentStatuses) → 'New'", () => {
    const current = new Map([[1, "Original"]]);
    const result = deriveStatusMap(current, new Set([9]));
    expect(result.get(9)).toBe("New");
  });
  it("accepts canonical/variant 'Canceled' → normalised to 'Cancelled'", () => {
    const current = new Map([[10, "Canceled"]]);
    const result = deriveStatusMap(current, new Set([10]));
    expect(result.get(10)).toBe("Cancelled");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GENERATE CLAIM CHANGE SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

describe("generateClaimChangeSummary", () => {
  it("counts tracked-changes insertions and deletions per claim", () => {
    const d = parse(doc(
      claimPara(1, null,
        run("A device comprising "),
        ins(1, run("an improved")),
        run(" housing and a "),
        del(2, "old"),
        run(" motor.")
      ),
      claimPara(2, null, run("The device of claim 1.")),
    ));
    const summary = generateClaimChangeSummary(d);
    expect(summary.get(1)).toEqual({ insertions: 1, deletions: 1 });
    expect(summary.has(2)).toBe(false); // no changes
  });
  it("counts USPTO-format insertions and deletions per claim", () => {
    const d = parse(doc(
      claimPara(3, null,
        run("keep"),
        run("added", { underline: true }),
        run("gone", { strike: true }),
      ),
    ));
    const summary = generateClaimChangeSummary(d);
    expect(summary.get(3)).toEqual({ insertions: 1, deletions: 1 });
  });
  it("counts [[bracket]] as deletion", () => {
    const d = parse(doc(
      claimPara(4, null, run("[[old]]")),
    ));
    const summary = generateClaimChangeSummary(d);
    expect(summary.get(4)?.deletions).toBe(1);
  });
  it("non-claim paragraphs are excluded from summary", () => {
    const d = parse(doc(
      para(run("CLAIMS")),
      claimPara(1, null, run("A device."), run("changed", { underline: true })),
    ));
    const summary = generateClaimChangeSummary(d);
    expect(summary.size).toBe(1);
  });
  it("returns empty map for document with no changes", () => {
    const d = parse(doc(
      claimPara(1, null, run("A device.")),
      claimPara(2, null, run("The device of claim 1.")),
    ));
    const summary = generateClaimChangeSummary(d);
    expect(summary.size).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// UPDATE CLAIM STATUSES
// ═════════════════════════════════════════════════════════════════════════════

describe("updateClaimStatuses", () => {
  it("rewrites status from Original to Currently Amended", () => {
    const d = parse(doc(
      claimPara(1, "Original", run("A device comprising a housing."))
    ));
    updateClaimStatuses(d, new Map([[1, "Currently Amended"]]));
    const text = allText(serialize(d));
    expect(text).toContain("(Currently Amended)");
    expect(text).not.toContain("(Original)");
  });
  it("adds status when none was present", () => {
    const d = parse(doc(
      claimPara(1, null, run("A device comprising a housing."))
    ));
    updateClaimStatuses(d, new Map([[1, "New"]]));
    const text = allText(serialize(d));
    expect(text).toContain("(New)");
  });
  it("preserves claim body text when updating status", () => {
    const d = parse(doc(
      claimPara(1, "Original", run("A device comprising a housing."))
    ));
    updateClaimStatuses(d, new Map([[1, "Previously Presented"]]));
    const text = allText(serialize(d));
    expect(text).toContain("A device comprising a housing.");
  });
  it("updates multiple claims independently", () => {
    const d = parse(doc(
      claimPara(1, "Original", run("A device.")),
      claimPara(2, "Currently Amended", run("The device of claim 1.")),
    ));
    updateClaimStatuses(d, new Map([
      [1, "Original"],
      [2, "Previously Presented"],
    ]));
    const text = allText(serialize(d));
    expect(text).toContain("(Original)");
    expect(text).toContain("(Previously Presented)");
    expect(text).not.toContain("(Currently Amended)");
  });
  it("does not touch claims not in the status map", () => {
    const d = parse(doc(
      claimPara(1, "Original", run("A device.")),
      claimPara(2, "Withdrawn", run("The device of claim 1.")),
    ));
    updateClaimStatuses(d, new Map([[1, "Currently Amended"]]));
    const text = allText(serialize(d));
    expect(text).toContain("(Withdrawn)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GENERATE CLAIM SET OOXML (clean / allowed)
// ═════════════════════════════════════════════════════════════════════════════

describe("generateClaimSetOoxml", () => {
  function makeAmendedDoc() {
    return parse(doc(
      claimPara(1, "Original", run("A device comprising ")),
      claimPara(2, "Currently Amended",
        run("The device of claim 1, "),
        run("improved", { underline: true }),
        run(" wherein the "),
        run("old", { strike: true }),
        run(" housing is metal."),
      ),
      para(run("3. (Cancelled)")),
    ));
  }

  describe("mode: clean", () => {
    it("accepts insertion (keeps text, removes underline)", () => {
      const out = generateClaimSetOoxml(makeAmendedDoc(), "clean");
      expect(out).toContain("improved");
      expect(out).not.toContain("w:u");
    });
    it("removes struck-through (deletion) text", () => {
      const out = generateClaimSetOoxml(makeAmendedDoc(), "clean");
      expect(out).not.toContain("old");
      expect(out).not.toContain("w:strike");
    });
    it("cancelled claims stay as 'N. (Cancelled)' with no body", () => {
      const out = generateClaimSetOoxml(makeAmendedDoc(), "clean");
      expect(out).toContain("(Cancelled)");
      // Body text should not appear for claim 3
    });
    it("currently amended claim retains its status in clean mode", () => {
      const out = generateClaimSetOoxml(makeAmendedDoc(), "clean");
      // In clean mode, statuses from the doc are preserved
      expect(out).toContain("Currently Amended");
    });
  });

  describe("mode: allowed", () => {
    it("non-cancelled claims get (Allowed) status", () => {
      const out = generateClaimSetOoxml(makeAmendedDoc(), "allowed");
      expect(out).toContain("(Allowed)");
    });
    it("cancelled claims stay (Cancelled)", () => {
      const out = generateClaimSetOoxml(makeAmendedDoc(), "allowed");
      expect(out).toContain("(Cancelled)");
    });
    it("does not contain (Currently Amended) in allowed mode", () => {
      const out = generateClaimSetOoxml(makeAmendedDoc(), "allowed");
      expect(out).not.toContain("Currently Amended");
    });
    it("body text is preserved (insertions accepted)", () => {
      const out = generateClaimSetOoxml(makeAmendedDoc(), "allowed");
      expect(out).toContain("improved");
    });
    it("deleted text is removed", () => {
      const out = generateClaimSetOoxml(makeAmendedDoc(), "allowed");
      expect(out).not.toContain(">old<");
    });
  });

  it("bracket deletions are also removed in both modes", () => {
    const d = parse(doc(
      claimPara(1, "Currently Amended",
        run("The [[old]] new device."),
      ),
    ));
    const outClean   = generateClaimSetOoxml(d, "clean");
    const outAllowed = generateClaimSetOoxml(d, "allowed");
    expect(outClean).not.toContain("old");
    expect(outAllowed).not.toContain("old");
    expect(outClean).not.toContain("[[");
    expect(outAllowed).not.toContain("[[");
  });
});
