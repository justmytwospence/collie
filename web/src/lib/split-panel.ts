// A SECOND PANEL IN THE SAME PANE. An extension can draw a panel of its own on the terminal the agent
// draws on: a side chat, a log, a notes view. The agent's editor then shares the screen with a panel
// whose frame the readers do not know. Below the editor it is a second editor at the bottom of the
// screen, and the readers take that one for the agent's (the draft reads empty, the send goes to the
// wrong box). Beside it, no row spans the screen, and the readers find no editor at all.
//
// The operator declares the divider the extension draws between the two (`frames.toml`,
// docs/configure.md), and the readers read only the agent's own region of the screen:
//   - `below`: a panel under the agent. The divider is a row of its rule glyph with one pointer glyph in
//     it (`──────▴──────`, the pointer says which panel has the keys). The region is every row above it.
//   - `beside`: a panel to the right. The divider is a column of its rule glyph with one pointer glyph
//     in it (`│` down every row, `◂` on one). The region is every column left of it.
//
// The pointer is what makes a divider one. A row of `─` is also an editor's rule, a column of `│` is
// also a table's, so a rule glyph alone would cut a screen at any editor; a divider needs exactly one
// pointer, and every other cell of its row or column the rule glyph. A screen with no such divider is
// returned as it is, the same array, so a reader that takes a cut and finds none reads what it read
// before. With both declared, the beside divider is cut first.
//
// A cut keeps every row's index: a row cut off the bottom takes nothing above it with it, and a column
// cut keeps every row. A reader's row numbers are still the screen's.
//
// Pure, no harness imports. The cut is generic over the row type, so the phone's `StyledLine` and the
// surface's `FrameRow` both go through it.
import { graphemeSegmenter } from "./env";
import { displayWidth } from "./text-width";

/** One divider as the operator declares it: its rule glyph and the pointers it may carry. */
export interface PanelDivider {
  /** The glyph the divider is drawn with: a box-drawing glyph, `─` for a row, `│` for a column. */
  readonly rule: string;
  /** The pointer glyphs: the divider carries exactly one of them, and says by which one who has the keys. */
  readonly pointers: string;
}

/** The dividers the operator declared for one harness. */
export interface SplitPanels {
  /** A panel below the agent's: split off by a row of the rule glyph carrying one pointer. */
  readonly below?: PanelDivider;
  /** A panel beside the agent's, to its right: split off by a column of the rule glyph carrying one pointer. */
  readonly beside?: PanelDivider;
}

/** The dividers a declaration names (`panelBelow`, `panelBeside`), or undefined when it names none. */
export function splitPanelsOf(declaration: { readonly panelBelow?: PanelDivider; readonly panelBeside?: PanelDivider }): SplitPanels | undefined {
  if (declaration.panelBelow === undefined && declaration.panelBeside === undefined) return undefined;
  const panels: Writable<SplitPanels> = {};
  if (declaration.panelBelow !== undefined) panels.below = declaration.panelBelow;
  if (declaration.panelBeside !== undefined) panels.beside = declaration.panelBeside;
  return panels;
}

/** A value being built, before it is handed out read-only. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** A screen row as the cut needs it: styled runs of text. */
export interface CuttableRow {
  readonly segments: readonly { readonly text: string }[];
}

/** The agent's region of a screen, and where it was cut. */
export interface SplitPanelView<R extends CuttableRow> {
  /** The agent's rows: the screen's rows above a `below` divider, cut at a `beside` divider's column. */
  readonly lines: R[];
  /** The `beside` divider's column: every row was cut to its first `column` display columns. Null when not cut so. */
  readonly column: number | null;
  /** The `below` divider's row: only the rows above it are kept. Null when not cut so. */
  readonly rows: number | null;
}

/** A divider's rule row holds at least this many glyphs besides its pointer, so a short run of `─` is never one. */
const MIN_RULE_RUN = 8;
/** A divider column runs down at least this many rows. */
const MIN_COLUMN_ROWS = 3;
/** Pointer columns tried before giving up: a screen with more is not a split pane. */
const MAX_CANDIDATE_COLUMNS = 8;

function clusters(text: string): string[] {
  const segmenter = graphemeSegmenter();
  return segmenter === null ? Array.from(text) : Array.from(segmenter.segment(text), (s) => s.segment);
}

function textOf(row: CuttableRow): string {
  let out = "";
  for (const segment of row.segments) out += segment.text;
  return out;
}

/** True when `text` holds one of the `glyphs`. */
function holdsAny(text: string, glyphs: readonly string[]): boolean {
  return glyphs.some((glyph) => text.includes(glyph));
}

/** A row whose every cell is the rule glyph but one, which is a pointer: the `below` divider's row. */
function isDividerRow(text: string, rule: string, pointers: ReadonlySet<string>): boolean {
  let pointer = 0;
  let run = 0;
  for (const glyph of Array.from(text.trim())) {
    if (glyph === rule) run++;
    else if (pointers.has(glyph)) pointer++;
    else return false;
  }
  return pointer === 1 && run >= MIN_RULE_RUN;
}

/** The cell that starts at display column `column`, or null where a row has none (it ends before, or a wide glyph spans it). */
function cellAt(text: string, column: number): string | null {
  let at = 0;
  for (const cluster of clusters(text)) {
    if (at === column) return cluster;
    at += displayWidth(cluster);
    if (at > column) return null;
  }
  return null;
}

/** The display columns a row holds one of `glyphs` at. */
function columnsOf(text: string, glyphs: ReadonlySet<string>): number[] {
  const out: number[] = [];
  let at = 0;
  for (const cluster of clusters(text)) {
    if (glyphs.has(cluster)) out.push(at);
    at += displayWidth(cluster);
  }
  return out;
}

/** The row of the lowest `below` divider, or null. The lowest, so a divider quoted in the agent's own transcript is passed over. */
function belowDivider(texts: readonly string[], divider: PanelDivider): number | null {
  const pointers = new Set(Array.from(divider.pointers));
  const glyphs = [...pointers];
  for (let r = texts.length - 1; r > 0; r--) {
    const text = texts[r]!;
    if (holdsAny(text, glyphs) && isDividerRow(text, divider.rule, pointers)) return r;
  }
  return null;
}

/**
 * The column of a `beside` divider, or null: a column where every row down to the last that has text
 * holds the rule glyph or a pointer, and exactly one holds a pointer. The leftmost such column.
 */
function besideDivider(texts: readonly string[], divider: PanelDivider): number | null {
  const pointers = new Set(Array.from(divider.pointers));
  const glyphs = [...pointers];
  let last = texts.length - 1;
  while (last >= 0 && texts[last]!.trim() === "") last--;
  if (last + 1 < MIN_COLUMN_ROWS) return null;
  const candidates = new Set<number>();
  for (let r = 0; r <= last; r++) {
    if (!holdsAny(texts[r]!, glyphs)) continue;
    for (const column of columnsOf(texts[r]!, pointers)) candidates.add(column);
    if (candidates.size > MAX_CANDIDATE_COLUMNS) return null;
  }
  for (const column of [...candidates].toSorted((a, b) => a - b)) {
    if (column === 0) continue;
    let pointer = 0;
    let down = true;
    for (let r = 0; r <= last && down; r++) {
      const cell = cellAt(texts[r]!, column);
      if (cell === divider.rule) continue;
      if (cell !== null && pointers.has(cell)) pointer++;
      else down = false;
    }
    if (down && pointer === 1) return column;
  }
  return null;
}

/** One row cut at `columns` display columns, its styles kept. A wide glyph that would cross the cut is dropped. */
export function cutRowColumns<R extends CuttableRow>(row: R, columns: number): R {
  const segments: R["segments"][number][] = [];
  let used = 0;
  for (const segment of row.segments) {
    if (used >= columns) break;
    let kept = "";
    let width = 0;
    for (const cluster of clusters(segment.text)) {
      const cell = displayWidth(cluster);
      if (used + width + cell > columns) break;
      kept += cluster;
      width += cell;
    }
    if (kept.length > 0) segments.push(kept.length === segment.text.length ? segment : { ...segment, text: kept });
    used += width;
    if (kept.length < segment.text.length) break;
  }
  return { ...row, segments };
}

/**
 * The agent's region of `rows`, or null when `panels` names no divider that is on the screen. Row
 * indices are the screen's. A screen with no pointer glyph costs one substring test per row.
 */
export function splitPanelView<R extends CuttableRow>(rows: readonly R[], panels: SplitPanels | undefined): SplitPanelView<R> | null {
  if (panels === undefined || (panels.below === undefined && panels.beside === undefined)) return null;
  const glyphs = [...Array.from(panels.below?.pointers ?? ""), ...Array.from(panels.beside?.pointers ?? "")];
  let texts = rows.map(textOf);
  if (!texts.some((text) => holdsAny(text, glyphs))) return null;
  let lines = [...rows];
  let column: number | null = null;
  let kept: number | null = null;
  if (panels.beside !== undefined) {
    column = besideDivider(texts, panels.beside);
    if (column !== null) {
      const at = column;
      lines = lines.map((row) => cutRowColumns(row, at));
      texts = lines.map(textOf);
    }
  }
  if (panels.below !== undefined) {
    kept = belowDivider(texts, panels.below);
    if (kept !== null) lines = lines.slice(0, kept);
  }
  return column === null && kept === null ? null : { lines, column, rows: kept };
}

/**
 * `rows` cut to the agent's region when `panels` names a divider on the screen, else `rows` itself.
 * The one call a caller with a profile makes before it looks for an editor.
 */
export function agentRegion<R extends CuttableRow>(rows: R[], panels: SplitPanels | undefined): R[];
export function agentRegion<R extends CuttableRow>(rows: readonly R[], panels: SplitPanels | undefined): readonly R[];
export function agentRegion<R extends CuttableRow>(rows: readonly R[], panels: SplitPanels | undefined): readonly R[] {
  return splitPanelView(rows, panels)?.lines ?? rows;
}
