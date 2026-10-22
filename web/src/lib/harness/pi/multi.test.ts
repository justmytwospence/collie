import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAnsi } from "../../ansi";
import { splitLines, type StyledLine } from "../../blocks";
import type { PiFrameDeclaration } from "../../frame-declarations";
import { piFrames } from "./frames";
import { piAdapter, piAdapterFor } from "./index";
import { detectPiMultiSelect } from "./multi";

const DECLARED: PiFrameDeclaration = {
  ruleGlyphs: "━", ruleLabels: "ends", statusRows: 12, statusIndent: 1, statusBlankRows: 1,
  checkboxTicks: "✓", typedAnswer: "Other",
};
const frames = piFrames(DECLARED);

function raw(name: string): string {
  return readFileSync(new URL(`../../../fixtures/panes/${name}`, import.meta.url), "utf8");
}
function lines(text: string): StyledLine[] {
  return splitLines(parseAnsi(text));
}

describe("pi multi-select", () => {
  it("lifts the lone checkbox question: digits toggle, Tab submits, the typed-answer row is no button", () => {
    const found = detectPiMultiSelect(lines(raw("pi--v130-frames-multi.txt")), frames);
    expect(found?.startLine).toBe(0);
    const model = found!.model;
    if (model.phase !== "checkbox") throw new Error("not a checkbox screen");
    expect(model.question).toBe("Pick the colors for the Collie probe.");
    expect(model.options).toEqual([
      { n: 1, label: "Red · The first color.", checked: false },
      { n: 2, label: "Green · The second color.", checked: false },
      { n: 3, label: "Blue · The third color.", checked: false },
    ]);
    expect(model).toMatchObject({ toggle: "digit", advanceKeys: ["Tab"], advanceLabel: "Submit", pointer: "option", pointerRow: 1, steps: null, escape: null });
  });

  it("reads the ticks the terminal drew, and keeps one identity while digits move the pointer", () => {
    const none = detectPiMultiSelect(lines(raw("pi--v130-frames-multi.txt")), frames)!.model;
    const one = detectPiMultiSelect(lines(raw("pi--v130-frames-multi-checked.txt")), frames)!.model;
    const two = detectPiMultiSelect(lines(raw("pi--v130-frames-multi-two.txt")), frames)!.model;
    if (one.phase !== "checkbox" || two.phase !== "checkbox") throw new Error("not a checkbox screen");
    expect(one.options.map((o) => o.checked)).toEqual([false, true, false]);
    expect(two.options.map((o) => o.checked)).toEqual([false, true, true]);
    expect(one.pointerRow).toBe(2);
    expect(two.pointerRow).toBe(3);
    expect(one.signature).toBe(none.signature);
    expect(two.signature).toBe(none.signature);
    expect(one.regionSignature).not.toBe(none.regionSignature);
  });

  it("stays raw when the typed-answer row is ticked: Tab then asks for its text", () => {
    const ticked = raw("pi--v130-frames-multi.txt").replace("4.\x1b[0m   ", "4.\x1b[0m ✓ ");
    expect(ticked).not.toBe(raw("pi--v130-frames-multi.txt"));
    expect(detectPiMultiSelect(lines(ticked), frames)).toBeNull();
  });

  it("stays raw without the footer's keys: no Tab that commits, or no digits", () => {
    const text = raw("pi--v130-frames-multi.txt");
    expect(text).toContain(" done\x1b");
    expect(detectPiMultiSelect(lines(text.replace(" done\x1b", " next\x1b")), frames)).toBeNull();
    expect(detectPiMultiSelect(lines(text.replace("1-9\x1b[0m\x1b[38;2;103;113;118m select", "1-9\x1b[0m\x1b[38;2;103;113;118m jump")), frames)).toBeNull();
  });

  it("stays raw beside a second question: a strip of two questions has no lone Submit", () => {
    const text = raw("pi--v130-frames-multi.txt").replace("choose any\x1b[0m   ", "choose any\x1b[0m   Sizes   ");
    expect(detectPiMultiSelect(lines(text), frames)).toBeNull();
  });

  it("stays raw without declared ticks, whatever else the frame declares: pi's own has no checkbox question", () => {
    const screen = lines(raw("pi--v130-frames-multi.txt"));
    const { checkboxTicks: _ticks, ...frameOnly } = DECLARED;
    expect(detectPiMultiSelect(screen, piFrames(frameOnly))).toBeNull();
    expect(piAdapterFor(frameOnly).buildBlocks(screen).some((b) => b.kind === "multi-select")).toBe(false);
  });

  it("makes every row a button when no typed-answer label is declared", () => {
    const { typedAnswer: _typed, ...noTyped } = DECLARED;
    const model = detectPiMultiSelect(lines(raw("pi--v130-frames-multi.txt")), piFrames(noTyped))!.model;
    expect(model.phase === "checkbox" && model.options.map((o) => o.label).at(-1)).toBe("Other · type your own answer");
  });

  it("goes through the declared adapter, and pi's own frame reads none of it", () => {
    const screen = lines(raw("pi--v130-frames-multi.txt"));
    expect(piAdapterFor(DECLARED).buildBlocks(screen).map((b) => b.kind)).toEqual(["multi-select"]);
    expect(piAdapter.buildBlocks(screen).map((b) => b.kind)).toEqual(["raw"]);
  });
});
