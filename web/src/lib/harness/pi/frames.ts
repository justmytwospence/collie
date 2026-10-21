// What the pi reader takes for the editor's frame, and the operator's declaration that widens it.
//
// pi extensions redraw the editor's frame: a gauge painted into the rules, a mode label at the end
// of a rule, a status area taller than pi's own. The reader cannot guess those shapes, so an operator
// who runs such an extension declares them (`frames.toml`, docs/configure.md). The declaration only
// moves the limits named here. Every other check the reader makes stays: the rules span the same
// width and wear the same colour, the frame sits at the tail, the status rows are painted.
//
// With no declaration every predicate below is the reader's original constant, so a pane is read
// byte for byte as before (pi/frames.test.ts runs the whole pi corpus through both).
import type { PiFrameDeclaration } from "../../frame-declarations";

export type { PiFrameDeclaration } from "../../frame-declarations";

/** The limits as the readers ask them. Build one with {@link piFrames}. */
export interface PiFrames {
  /** True when an operator declared anything: the readers then compare rules by shape, not by text. */
  readonly declared: boolean;
  /** A rule of the frame's own edge: bare, or (with `ends`) labelled at an end. Never a middle label. */
  edge(text: string): boolean;
  /** Any rule an editor draws: bare, labelled in the middle, or (with `ends`) at an end. */
  rule(text: string): boolean;
  /** A row that starts with a run of rule glyphs (a status row may never). */
  ruleStart(text: string): boolean;
  /** A row whose first glyph is a rule glyph. */
  ruleGlyphStart(text: string): boolean;
  readonly statusRows: number;
  readonly statusIndent: number;
  readonly statusBlankRows: number;
  /**
   * How wide a row is drawn, for comparing two rules. pi's own frame: the row's text with its trailing
   * spaces cut. A declared frame counts to the last cell drawn with a background too, because a label
   * at a rule's end is padded inside its own background (`── INSERT `) and is that much wider.
   */
  width(segments: readonly { text: string; bg?: string }[]): number;
}

// The reader's original constants, kept as they were so the default answers are the same objects.
const RULE = /^─{8,}$/;
const LABELLED_RULE = /^─{2,} \S.*? ─{3,}$/;

export const DEFAULT_PI_FRAMES: PiFrames = {
  declared: false,
  edge: (text) => RULE.test(text),
  rule: (text) => RULE.test(text) || LABELLED_RULE.test(text),
  ruleStart: (text) => /^\s*─{3,}/.test(text),
  ruleGlyphStart: (text) => /^\s*─/.test(text),
  statusRows: 4,
  statusIndent: 0,
  statusBlankRows: 0,
  width: (segments) => segments.map((s) => s.text).join("").trimEnd().length,
};

function drawnWidth(segments: readonly { text: string; bg?: string }[]): number {
  let at = 0;
  let end = 0;
  for (const segment of segments) {
    for (let i = 0; i < segment.text.length; i++) {
      if (segment.text[i] !== " " || segment.bg !== undefined) end = at + i + 1;
    }
    at += segment.text.length;
  }
  return end;
}

function escapeClass(glyphs: string): string {
  return [...glyphs].map((g) => g.replace(/[\\\]^-]/g, "\\$&")).join("");
}

const cache = new WeakMap<PiFrameDeclaration, PiFrames>();

/** The limits for `declaration`, or the defaults when there is none. Memoised per declaration object. */
export function piFrames(declaration: PiFrameDeclaration | undefined): PiFrames {
  if (declaration === undefined) return DEFAULT_PI_FRAMES;
  const known = cache.get(declaration);
  if (known !== undefined) return known;
  const glyphs = [...new Set(["─", ...(declaration.ruleGlyphs ?? "")])].join("");
  const run = `[${escapeClass(glyphs)}]`;
  const ends = declaration.ruleLabels === "ends";
  const bare = new RegExp(`^${run}{8,}$`, "u");
  const middle = new RegExp(`^${run}{2,} \\S.*? ${run}{3,}$`, "u");
  // A label before the run (one space in at most) or after it, or both, around a run of 8 or more.
  const labelled = new RegExp(`^(?: ?\\S.*? )?${run}{8,}(?: \\S.*?)?$`, "u");
  const runStart = new RegExp(`^\\s*${run}{3,}`, "u");
  const glyphStart = new RegExp(`^\\s*${run}`, "u");
  const frames: PiFrames = {
    declared: true,
    edge: (text) => bare.test(text) || (ends && labelled.test(text)),
    rule: (text) => bare.test(text) || middle.test(text) || (ends && labelled.test(text)),
    ruleStart: (text) => runStart.test(text),
    ruleGlyphStart: (text) => glyphStart.test(text),
    statusRows: declaration.statusRows ?? DEFAULT_PI_FRAMES.statusRows,
    statusIndent: declaration.statusIndent ?? DEFAULT_PI_FRAMES.statusIndent,
    statusBlankRows: declaration.statusBlankRows ?? DEFAULT_PI_FRAMES.statusBlankRows,
    width: drawnWidth,
  };
  cache.set(declaration, frames);
  return frames;
}

/** The colour a rule is drawn in: its first segment that holds a rule glyph, so a label before the run
 *  does not count. The original reader's answer (the first visible segment) when nothing is declared. */
export function ruleRunColor(
  segments: readonly { text: string; fg?: string }[],
  frames: PiFrames,
): string | undefined {
  if (!frames.declared) return segments.find((s) => s.text.trim() !== "")?.fg;
  return segments.find((s) => frames.ruleGlyphStart(s.text.trimStart()) && s.text.trim() !== "")?.fg;
}
