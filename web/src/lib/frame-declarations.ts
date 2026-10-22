// An operator's declaration of how their harness draws its input box, when an extension redraws it
// (`frames.toml`, docs/configure.md). The bridge reads the file once at startup, applies it to its own
// surface profile (surface/profile.ts `declareFrames`), and publishes it on `/api/config`, where the
// phone hands it to the harness reader of that machine's panes. A crew member publishes its own in its
// `hello`, since its panes are drawn by its own extensions.
//
// Only the limits named here move, and each harness reader says what it does with them
// (harness/pi/frames.ts). With no declaration nothing changes.

import { asJsonNumber, asJsonObject, asJsonString, type JsonObject, type JsonValue } from "./json";

/** The operator's declaration for pi's editor frame, as `/api/config` carries it (camelCase). */
export interface PiFrameDeclaration {
  /** Further glyphs a rule may be drawn with besides `─`, such as `━` for a gauge in the border. */
  readonly ruleGlyphs?: string;
  /** Where a rule may carry a label. `middle` (pi's own, `── ⠴ Working ───`) is always read; `ends`
   *  also takes a label before or after the run (`──── INSERT`, ` Title · ────`). */
  readonly ruleLabels?: "middle" | "ends";
  /** The most rows under the editor's bottom rule (pi's own footer: 4). */
  readonly statusRows?: number;
  /** The most columns a status row may be indented (pi's own: 0). */
  readonly statusIndent?: number;
  /** The most blank rows that may stand between two status rows (pi's own: 0). */
  readonly statusBlankRows?: number;
  /** A one-column gutter glyph an option's wrapped rest may stand behind (` │    rest`). pi's own: none. */
  readonly optionGutter?: string;
  /** The tick glyphs of a checkbox question's tick column (`1. ✓ Label`). When set, a lone checkbox
   *  question whose footer names its keys lifts as checkboxes. pi's own: none, so checkboxes stay raw. */
  readonly checkboxTicks?: string;
  /** The label a checkbox question's typed-answer row starts with (`Other`): never a button. */
  readonly typedAnswer?: string;
}

/** Every harness's frame declaration. pi is the only reader that takes one today. */
export interface FrameDeclarations {
  readonly pi?: PiFrameDeclaration;
}

/** One harness's declaration, whichever harness it is (the surface code names none). */
export type FrameDeclaration = NonNullable<FrameDeclarations[keyof FrameDeclarations]>;

/** The bounds a declaration must keep. A value outside them is dropped with a warning. */
const MAX_RULE_GLYPHS = 8;
const MAX_STATUS_ROWS = 16;
const MAX_STATUS_INDENT = 4;
const MAX_STATUS_BLANK_ROWS = 2;
const MAX_TICK_GLYPHS = 4;
const MAX_TYPED_LABEL = 32;

/** A rule glyph is a box-drawing or block-element character: a letter in a rule would read prose as a border. */
const RULE_GLYPH = /^[\u2500-\u259F]$/u;

type Spelling = "toml" | "wire";

/** A declaration being built, before it is handed out read-only. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

const PI_KEYS = {
  ruleGlyphs: "rule_glyphs",
  ruleLabels: "rule_labels",
  statusRows: "status_rows",
  statusIndent: "status_indent",
  statusBlankRows: "status_blank_rows",
  optionGutter: "option_gutter",
  checkboxTicks: "checkbox_ticks",
  typedAnswer: "typed_answer",
} as const satisfies Record<keyof PiFrameDeclaration, string>;

function wholeIn(value: JsonValue | undefined, min: number, max: number): number | undefined {
  const n = asJsonNumber(value);
  return n !== undefined && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

function ruleGlyphs(value: JsonValue | undefined): string | undefined {
  const text = asJsonString(value);
  if (text === undefined) return undefined;
  const glyphs = [...text];
  if (glyphs.length === 0 || glyphs.length > MAX_RULE_GLYPHS || !glyphs.every((g) => RULE_GLYPH.test(g))) return undefined;
  return text;
}

/** One box-drawing glyph: a gutter is a column of the frame, never a letter. */
function gutterGlyph(value: JsonValue | undefined): string | undefined {
  const text = asJsonString(value);
  return text !== undefined && [...text].length === 1 && /^[\u2500-\u257F]$/u.test(text) ? text : undefined;
}

/** One to four tick glyphs, none a space, a digit or a letter: a tick never reads as a label. */
function tickGlyphs(value: JsonValue | undefined): string | undefined {
  const text = asJsonString(value);
  if (text === undefined) return undefined;
  const glyphs = [...text];
  return glyphs.length >= 1 && glyphs.length <= MAX_TICK_GLYPHS && glyphs.every((g) => !/[\s\p{L}\p{N}]/u.test(g)) ? text : undefined;
}

/** A label of one to 32 characters, with no space at either end. */
function typedLabel(value: JsonValue | undefined): string | undefined {
  const text = asJsonString(value);
  return text !== undefined && text.length > 0 && text.length <= MAX_TYPED_LABEL && text.trim() === text && !/\p{Cc}/u.test(text) ? text : undefined;
}

function ruleLabels(value: JsonValue | undefined): "middle" | "ends" | undefined {
  const word = asJsonString(value);
  return word === "middle" || word === "ends" ? word : undefined;
}

/**
 * The pi declaration in `node`, keyed as the file spells it (`toml`, snake_case) or as `/api/config`
 * carries it (`wire`, camelCase). Each key is checked on its own: an unknown key or a value out of
 * bounds is dropped with a warning and the rest stands, so a typo costs one setting, never the
 * reader. Undefined when nothing valid is left.
 */
function piDeclaration(node: JsonObject, spelling: Spelling, warn: (message: string) => void): PiFrameDeclaration | undefined {
  const name = (key: keyof PiFrameDeclaration): string => (spelling === "toml" ? PI_KEYS[key] : key);
  const keys: readonly (keyof PiFrameDeclaration)[] = ["ruleGlyphs", "ruleLabels", "statusRows", "statusIndent", "statusBlankRows", "optionGutter", "checkboxTicks", "typedAnswer"];
  const known = new Set(keys.map(name));
  for (const key of Object.keys(node)) if (!known.has(key)) warn(`frames.pi.${key} is not a frame setting, and is ignored`);
  const dropped = (key: keyof PiFrameDeclaration) => warn(`frames.pi.${name(key)} is out of bounds, and is ignored (docs/configure.md, frames.toml)`);
  const read = <T>(key: keyof PiFrameDeclaration, parse: (value: JsonValue | undefined) => T | undefined): T | undefined => {
    const value = node[name(key)];
    if (value === undefined) return undefined;
    const parsed = parse(value);
    if (parsed === undefined) dropped(key);
    return parsed;
  };
  const declaration: Writable<PiFrameDeclaration> = {};
  const glyphs = read("ruleGlyphs", ruleGlyphs);
  if (glyphs !== undefined) declaration.ruleGlyphs = glyphs;
  const labels = read("ruleLabels", ruleLabels);
  if (labels !== undefined) declaration.ruleLabels = labels;
  const rows = read("statusRows", (v) => wholeIn(v, 1, MAX_STATUS_ROWS));
  if (rows !== undefined) declaration.statusRows = rows;
  const indent = read("statusIndent", (v) => wholeIn(v, 0, MAX_STATUS_INDENT));
  if (indent !== undefined) declaration.statusIndent = indent;
  const blanks = read("statusBlankRows", (v) => wholeIn(v, 0, MAX_STATUS_BLANK_ROWS));
  if (blanks !== undefined) declaration.statusBlankRows = blanks;
  const gutter = read("optionGutter", gutterGlyph);
  if (gutter !== undefined) declaration.optionGutter = gutter;
  const ticks = read("checkboxTicks", tickGlyphs);
  if (ticks !== undefined) declaration.checkboxTicks = ticks;
  const typed = read("typedAnswer", typedLabel);
  if (typed !== undefined) declaration.typedAnswer = typed;
  return Object.keys(declaration).length === 0 ? undefined : declaration;
}

/**
 * The declarations in a parsed `frames.toml` (`toml`) or in an `/api/config` body or crew `hello`
 * (`wire`). Pure and total: anything it cannot believe is dropped with a warning, and an empty result
 * is `undefined`, which every reader takes as "nothing declared".
 */
export function frameDeclarationsFrom(
  doc: JsonValue | undefined,
  spelling: Spelling,
  warn: (message: string) => void = () => {},
): FrameDeclarations | undefined {
  if (doc === undefined || doc === null) return undefined;
  const root = asJsonObject(doc);
  if (root === undefined) {
    warn("frames must be a table of harness tables");
    return undefined;
  }
  for (const key of Object.keys(root)) if (key !== "pi") warn(`frames.${key}: no reader takes a frame declaration for ${key}, and it is ignored`);
  if (root.pi === undefined) return undefined;
  const node = asJsonObject(root.pi);
  if (node === undefined) {
    warn("frames.pi must be a table");
    return undefined;
  }
  const pi = piDeclaration(node, spelling, warn);
  return pi === undefined ? undefined : { pi };
}
