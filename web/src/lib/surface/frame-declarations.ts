// The operator's frame declarations (lib/frame-declarations.ts) applied to the surface profiles, so the
// bridge's own reads (the Send Protocol's frame, its running sign, the rows under the box) take the box
// the operator's extensions draw. The phone's harness reader takes the same declaration, so both sides
// agree on where the box is.
//
// A declaration applies to the profile whose id is its key. Only the anchors it names are rewritten,
// each from the profile's own value, the way the harness reader widens its own constants:
//   - `ruleGlyphs`: every `─+` run in the top and bottom edges and in the running rows takes the glyphs;
//   - `ruleLabels: "ends"`: the top and bottom edges take a label before or after the run;
//   - `statusRows`, `statusIndent`, `statusBlankRows`: the rows under the box.
// A profile no declaration names is returned as the same object.

import type { FrameDeclaration, FrameDeclarations } from "../frame-declarations";
import type { FrameAnchor, Profile } from "./profile";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Declaration = FrameDeclaration;

function runOf(declaration: Declaration): string {
  const glyphs = [...new Set(["─", ...(declaration.ruleGlyphs ?? "")])].map((g) => escapeRegExp(g)).join("");
  return `[${glyphs}]+`;
}

/** The label a rule's end may carry, or null when the declaration takes none there. */
function endLabel(declaration: Declaration): string | null {
  return declaration.ruleLabels === "ends" ? String.raw`\S.*?` : null;
}

/** `^…$` with every `─+` run widened to the declared glyphs, and a label allowed at each end. */
function edgePattern(source: string, declaration: Declaration): string {
  const label = endLabel(declaration);
  const body = source.replace(/^\^/, "").replace(/\$$/, "").replaceAll("─+", runOf(declaration));
  const lead = label === null ? "" : `(?:${label}\\s+)?`;
  const tail = label === null ? "" : `(?:\\s+${label})?`;
  return `^${lead}${body}${tail}$`;
}

function edge(anchor: FrameAnchor, declaration: Declaration): FrameAnchor {
  return anchor.blank === true || anchor.open === true ? anchor : { ...anchor, pattern: edgePattern(anchor.pattern, declaration) };
}

function declared(profile: Profile, declaration: Declaration): Profile {
  const { frame, volatile } = profile.idle;
  const redrawn = declaration.ruleGlyphs !== undefined || declaration.ruleLabels === "ends";
  // A status row indented by the declared columns still opens with the words `under` reads.
  const under =
    frame.under === undefined || declaration.statusIndent === undefined
      ? frame.under
      : frame.under.replace(/^\^/, `^ {0,${String(declaration.statusIndent)}}`);
  const underBlankRows = declaration.statusBlankRows ?? frame.underBlankRows;
  const reframed = redrawn ? { ...frame, top: edge(frame.top, declaration), bottom: edge(frame.bottom, declaration) } : { ...frame };
  if (under !== undefined) reframed.under = under;
  if (underBlankRows !== undefined && frame.underPainted === true) reframed.underBlankRows = underBlankRows;

  const rows = declaration.statusRows;
  const below = rows === undefined ? volatile.below : { ...volatile.below, maxRows: rows, footerMaxRows: rows };
  // A running sign drawn into a rule (`── ⠴ Working`) is drawn with the declared glyphs too.
  const runningRows = redrawn
    ? profile.idle.runningRows?.map((source) => source.replaceAll("─+", runOf(declaration)))
    : profile.idle.runningRows;
  const idle = { ...profile.idle, frame: reframed, volatile: { ...volatile, below } };
  if (runningRows !== undefined) idle.runningRows = runningRows;
  return { ...profile, idle };
}

/** `profile` with the operator's declaration for it applied, or `profile` itself when there is none. */
export function withFrameDeclaration(profile: Profile, declarations: FrameDeclarations | undefined): Profile {
  const declaration = declarations === undefined ? undefined : Object.entries(declarations).find(([id]) => id === profile.id)?.[1];
  return declaration === undefined ? profile : declared(profile, declaration);
}
