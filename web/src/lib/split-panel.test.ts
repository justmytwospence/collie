import { describe, expect, it } from "vitest";
import { agentRegion, cutRowColumns, splitPanelsOf, splitPanelView, type SplitPanels } from "./split-panel";

const row = (text: string) => ({ segments: [{ text }] });
const rows = (texts: string[]) => texts.map((text) => row(text));
const texts = (lines: readonly { segments: readonly { text: string }[] }[]) => lines.map((l) => l.segments.map((s) => s.text).join(""));

const BELOW: SplitPanels = { below: { rule: "─", pointers: "▴▾" } };
const BESIDE: SplitPanels = { beside: { rule: "│", pointers: "◂▸" } };
const BOTH: SplitPanels = { ...BELOW, ...BESIDE };

const RULE = "─".repeat(12);
const DIVIDER = `${"─".repeat(6)}▴${"─".repeat(5)}`;

describe("a panel drawn below", () => {
  const screen = ["transcript", RULE, "next step", RULE, " footer", DIVIDER, " panel header", RULE, "", RULE];

  it("keeps only the rows above the divider, at the screen's own indices", () => {
    const view = splitPanelView(rows(screen), BELOW);
    expect(view?.rows).toBe(5);
    expect(view?.column).toBeNull();
    expect(texts(view!.lines)).toEqual(["transcript", RULE, "next step", RULE, " footer"]);
  });

  it("takes either pointer, and cells of the screen around the divider's row as they are", () => {
    for (const pointer of ["▴", "▾"]) {
      const divider = `${"─".repeat(6)}${pointer}${"─".repeat(5)}   `;
      expect(splitPanelView(rows(["a", "b", divider, "c"]), BELOW)?.rows).toBe(2);
    }
  });

  it("takes the lowest divider, so one the transcript quotes is passed over", () => {
    const quoted = ["transcript", DIVIDER, "a quote", RULE, "next step", RULE, DIVIDER, " panel"];
    expect(splitPanelView(rows(quoted), BELOW)?.rows).toBe(6);
  });

  it("finds no divider in a row without exactly one pointer, with another glyph, or too short", () => {
    for (const not of [RULE, `${"─".repeat(4)}▴${"─".repeat(3)}▾${"─".repeat(3)}`, `${"─".repeat(6)}x${"─".repeat(5)}`, "──▴──", `${DIVIDER} text`]) {
      expect(splitPanelView(rows(["a", "b", not, "c"]), BELOW), not).toBeNull();
    }
  });

  it("is no split when the divider is the first row: nothing is left above it", () => {
    expect(splitPanelView(rows([DIVIDER, "a", "b"]), BELOW)).toBeNull();
  });
});

describe("a panel drawn beside", () => {
  const edge = (cell: string, mark = "│") => `${cell.padEnd(10)}${mark} panel`;
  const screen = [edge("transcript"), edge("", "◂"), edge("next step"), edge(" footer")];

  it("keeps only the columns left of the divider's column, every row", () => {
    const view = splitPanelView(rows(screen), BESIDE);
    expect(view?.column).toBe(10);
    expect(view?.rows).toBeNull();
    expect(texts(view!.lines)).toEqual(["transcript", "".padEnd(10), "next step ", " footer   "]);
  });

  it("counts a wide glyph as two columns", () => {
    // Each row is 8 display columns before its divider, though the first holds 6 characters.
    const wide = ["中文ab  │ x", "        ◂ x", "中      │ x"];
    expect(splitPanelView(rows(wide), BESIDE)?.column).toBe(8);
  });

  it("ignores the blank rows after the last row with text", () => {
    expect(splitPanelView(rows([...screen, "", ""]), BESIDE)?.column).toBe(10);
  });

  it("needs the glyph or a pointer at that column in every row, and exactly one pointer", () => {
    const torn = [...screen];
    torn[3] = " footer";
    expect(splitPanelView(rows(torn), BESIDE)).toBeNull();
    expect(splitPanelView(rows([edge("a"), edge("b"), edge("c")]), BESIDE)).toBeNull();
    expect(splitPanelView(rows([edge("a", "◂"), edge("b", "▸"), edge("c")]), BESIDE)).toBeNull();
    expect(splitPanelView(rows([edge("a"), edge("b", "◂")]), BESIDE)).toBeNull();
  });

  it("is no split when the divider is the first column", () => {
    expect(splitPanelView(rows(["│a", "◂b", "│c"]), BESIDE)).toBeNull();
  });

  it("keeps the styles of the cells it keeps, and splits a run at the cut", () => {
    const styled = [
      { segments: [{ text: "ab", fg: "red" }, { text: "cd│xy", fg: "blue" }] },
      { segments: [{ text: "abcd◂xy" }] },
      { segments: [{ text: "abcd│xy" }] },
    ];
    const view = splitPanelView(styled, BESIDE)!;
    expect(view.column).toBe(4);
    expect(view.lines[0]).toEqual({ segments: [{ text: "ab", fg: "red" }, { text: "cd", fg: "blue" }] });
  });
});

describe("both declared", () => {
  it("cuts the beside divider first, then looks for the below one in what is left", () => {
    const screen = ["transcript  │ x", "next step   ◂ y", `${DIVIDER}│ z`, " panel      │ w"];
    const view = splitPanelView(rows(screen), BOTH);
    expect(view?.column).toBe(12);
    expect(view?.rows).toBe(2);
    expect(texts(view!.lines)).toEqual(["transcript  ", "next step   "]);
  });
});

describe("a screen with no divider", () => {
  const screen = rows(["transcript", RULE, "next step", RULE, " footer"]);

  it("is returned as the same rows, whatever is declared", () => {
    for (const panels of [undefined, {}, BELOW, BESIDE, BOTH]) {
      expect(splitPanelView(screen, panels)).toBeNull();
      expect(agentRegion(screen, panels)).toBe(screen);
    }
  });

  it("is untouched by a divider's glyphs where they are no divider: a table, a rule with no pointer", () => {
    const table = rows(["┌──┬──┐", "│a │b │", "├──┼──┤", "│c │d │", "└──┴──┘"]);
    expect(agentRegion(table, BOTH)).toBe(table);
  });
});

describe("cutting a row", () => {
  it("drops a wide glyph that would cross the cut, and keeps the row's other fields", () => {
    const line = { noWrap: true, segments: [{ text: "ab中d", bold: true }] };
    expect(cutRowColumns(line, 3)).toEqual({ noWrap: true, segments: [{ text: "ab", bold: true }] });
    expect(cutRowColumns(line, 4)).toEqual({ noWrap: true, segments: [{ text: "ab中", bold: true }] });
    expect(cutRowColumns(line, 0)).toEqual({ noWrap: true, segments: [] });
  });

  it("keeps a row that fits whole, as the same segments", () => {
    const line = row("abc");
    expect(cutRowColumns(line, 9).segments[0]).toBe(line.segments[0]);
  });
});

describe("the dividers a declaration names", () => {
  it("are its two panels, or nothing", () => {
    expect(splitPanelsOf({})).toBeUndefined();
    expect(splitPanelsOf({ panelBelow: BELOW.below! })).toEqual(BELOW);
    expect(splitPanelsOf({ panelBelow: BELOW.below!, panelBeside: BESIDE.beside! })).toEqual(BOTH);
  });
});
