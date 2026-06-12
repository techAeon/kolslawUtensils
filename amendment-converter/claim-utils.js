"use strict";

// ════════════════════════════════════════════════════════════════════════════
// claim-utils.js — Claim status management and change summary
//
// Works on OOXML strings / DOM for status-identifier tasks, and on plain
// paragraph-text arrays for claim parsing.
// ════════════════════════════════════════════════════════════════════════════

import {
  NS, parse, serialize,
  collectText, firstChild, childrenNamed, allNamed, ancestorOf,
  stripRpr, acceptUsptMarkup,
  parseClaimHeader, canonicalStatus, uVal,
} from "./converter-core.js";

// ════════════════════════════════════════════════════════════════════════════
// CLAIM PARAGRAPH DETECTION
// A claim paragraph starts with "N. " or "N. (Status) "
// ════════════════════════════════════════════════════════════════════════════

// Extract full text from a paragraph node (concatenate all w:t and w:delText)
function paraText(para) {
  return [
    ...allNamed(para, "t"),
    ...allNamed(para, "delText"),
  ].map(n => n.textContent).join("");
}

// Returns claim number if paragraph looks like a claim, else null.
function claimNumberOf(para) {
  const text = paraText(para).trimStart();
  const m = text.match(/^(\d+)\.\s/);
  return m ? parseInt(m[1], 10) : null;
}

// ════════════════════════════════════════════════════════════════════════════
// CHANGE SUMMARY  (per-claim insertion / deletion counts)
// ════════════════════════════════════════════════════════════════════════════

// Given a parsed OOXML document, returns a Map of claimNumber → {insertions, deletions}
// covering runs in paragraphs that look like claims.
// Works on BOTH tracked-changes format and USPTO format (underline/strike).
function generateClaimChangeSummary(xmlDoc) {
  const summary = new Map(); // claimNumber → {insertions:0, deletions:0}

  for (const para of allNamed(xmlDoc, "p")) {
    const claimNum = claimNumberOf(para);
    if (claimNum === null) continue;

    let ins = 0, del = 0;

    // Tracked-changes format
    ins += allNamed(para, "ins").length;
    del += allNamed(para, "del").length;

    // USPTO format (underline / strikethrough / brackets on plain runs)
    for (const run of allNamed(para, "r")) {
      if (ancestorOf(run, "ins") || ancestorOf(run, "del")) continue;
      const text = collectText(run, "t");
      if (/^\[\[[\s\S]*?\]\]$/.test(text)) { del++; continue; }
      const rPr = firstChild(run, "rPr");
      if (!rPr) continue;
      const hasU = childrenNamed(rPr, "u").some(u => uVal(u) !== "none");
      const hasSt = childrenNamed(rPr, "strike").length > 0
        || childrenNamed(rPr, "dstrike").length > 0;
      if (hasU) ins++;
      else if (hasSt) del++;
    }

    if (ins > 0 || del > 0) summary.set(claimNum, { insertions: ins, deletions: del });
  }
  return summary;
}

// ════════════════════════════════════════════════════════════════════════════
// STATUS IDENTIFIER UPDATE
//
// Rewrites "(Status)" text in claim paragraphs in-place on xmlDoc.
// claimStatusMap: Map of claimNumber → newStatus string
// ════════════════════════════════════════════════════════════════════════════

function updateClaimStatuses(xmlDoc, claimStatusMap) {
  for (const para of allNamed(xmlDoc, "p")) {
    const claimNum = claimNumberOf(para);
    if (claimNum === null) continue;
    const newStatus = claimStatusMap.get(claimNum);
    if (!newStatus) continue;

    // Collect all text nodes across runs in order
    const runs = allNamed(para, "r")
      .filter(r => !ancestorOf(r, "ins") && !ancestorOf(r, "del"));

    // Build the full text and find where the current status token is
    let fullText = runs.map(r => collectText(r, "t")).join("");
    const headerMatch = fullText.match(/^(\d+\.\s+)(?:\([^)]+\)\s+)?/);
    if (!headerMatch) continue;

    const claimNumPrefix = fullText.match(/^\d+\.\s+/)?.[0] ?? "";
    const existingStatusMatch = fullText.match(/^(\d+\.\s+)\(([^)]+)\)\s+/);

    // Rebuild the header with the new status
    const restStart = existingStatusMatch
      ? existingStatusMatch[0].length
      : claimNumPrefix.length;
    const bodyText = fullText.slice(restStart);
    const newHeader = `${claimNumPrefix}(${newStatus}) `;
    const newFullText = newHeader + bodyText;

    // Rewrite into the runs: put all text in the first run, clear others
    if (runs.length === 0) continue;
    const firstT = firstChild(runs[0], "t");
    if (!firstT) continue;
    firstT.textContent = newFullText;
    if (/^\s|\s$/.test(newFullText)) firstT.setAttribute("xml:space", "preserve");

    for (let i = 1; i < runs.length; i++) {
      for (const t of childrenNamed(runs[i], "t")) {
        t.textContent = "";
      }
    }
  }
  return xmlDoc;
}

// ════════════════════════════════════════════════════════════════════════════
// DERIVE STATUS MAP  (after a TC→USPTO conversion)
//
// Determines what each claim's new status should be given:
//   - currentStatuses: Map of claimNumber → current status string
//   - changedClaims:   Set of claim numbers that have changes in this pass
//
// Transition rules:
//   changed                           → "Currently Amended"
//   was "Currently Amended", unchanged → "Previously Presented"
//   status was "(Cancelled)"           → unchanged
//   "(Withdrawn)" or "(Not Entered)"   → unchanged (prosecution-history statuses)
//   otherwise unchanged               → keep current (or "Original" if null)
// ════════════════════════════════════════════════════════════════════════════

function deriveStatusMap(currentStatuses, changedClaims) {
  const result = new Map();
  for (const [num, status] of currentStatuses) {
    const canon = canonicalStatus(status);
    if (canon === "Cancelled" || canon === "Withdrawn" || canon === "Not Entered") {
      result.set(num, canon); // never auto-change these
      continue;
    }
    if (changedClaims.has(num)) {
      result.set(num, "Currently Amended");
    } else if (canon === "Currently Amended") {
      result.set(num, "Previously Presented");
    } else {
      result.set(num, canon || "Original");
    }
  }
  // Claims that appear in changedClaims but not in currentStatuses are new
  for (const num of changedClaims) {
    if (!currentStatuses.has(num)) result.set(num, "New");
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// EXTRACT CURRENT STATUSES from an OOXML document
// Returns Map of claimNumber → status string (null if no status)
// ════════════════════════════════════════════════════════════════════════════

function extractCurrentStatuses(xmlDoc) {
  const map = new Map();
  for (const para of allNamed(xmlDoc, "p")) {
    const text = paraText(para).trimStart();
    const m = text.match(/^(\d+)\.\s+(?:\(([^)]+)\))?/);
    if (!m) continue;
    map.set(parseInt(m[1], 10), m[2] ? m[2].trim() : null);
  }
  return map;
}

// ════════════════════════════════════════════════════════════════════════════
// GENERATE CLEAN CLAIM SET  (mode: "clean" | "allowed")
//
// Accepts all USPTO markup, updates status identifiers, produces OOXML.
// Cancelled claims: number retained, body removed, status = "(Cancelled)".
// mode "allowed": all non-cancelled claims → "(Allowed)".
// mode "clean":   status per deriveStatusMap with changedClaims = all amended.
// ════════════════════════════════════════════════════════════════════════════

function generateClaimSetOoxml(xmlDoc, mode) {
  const workDoc = parse(serialize(xmlDoc)); // deep clone via round-trip

  // Accept all markup
  acceptUsptMarkup(workDoc);

  // Get statuses post-acceptance
  const statuses = extractCurrentStatuses(workDoc);

  const newStatusMap = new Map();
  for (const [num, status] of statuses) {
    const canon = canonicalStatus(status);
    if (canon === "Cancelled") {
      newStatusMap.set(num, "Cancelled");
      // Remove body text for cancelled claims
      _removeCancelledBody(workDoc, num);
    } else if (mode === "allowed") {
      newStatusMap.set(num, "Allowed");
    } else {
      // "clean": preserve existing status, clear amendment formatting
      newStatusMap.set(num, canon || "Original");
    }
  }

  updateClaimStatuses(workDoc, newStatusMap);
  return serialize(workDoc);
}

// Remove claim body text, leaving only "N. (Cancelled)"
function _removeCancelledBody(xmlDoc, claimNumber) {
  for (const para of allNamed(xmlDoc, "p")) {
    const claimNum = claimNumberOf(para);
    if (claimNum !== claimNumber) continue;
    const runs = allNamed(para, "r")
      .filter(r => !ancestorOf(r, "ins") && !ancestorOf(r, "del"));
    if (runs.length === 0) continue;
    // Set first run to just the number + status placeholder, clear rest
    const firstT = firstChild(runs[0], "t");
    if (firstT) firstT.textContent = `${claimNumber}. (Cancelled)`;
    for (let i = 1; i < runs.length; i++) {
      for (const t of childrenNamed(runs[i], "t")) {
        t.textContent = "";
      }
    }
  }
}

export {
  paraText,
  claimNumberOf,
  generateClaimChangeSummary,
  updateClaimStatuses,
  deriveStatusMap,
  extractCurrentStatuses,
  generateClaimSetOoxml,
};
