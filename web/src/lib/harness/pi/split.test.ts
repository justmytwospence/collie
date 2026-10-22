import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAnsi } from "../../ansi";
import { lineText, splitLines, type StyledLine } from "../../blocks";
import { adapterFor } from "../registry";
import { besideScreen, belowScreen, BESIDE_COLUMN, PANELS, PANELS_ONLY, splitRows, type Focus, type Layout } from "../../../test/split-screens";
import { DEFAULT_PI_FRAMES, piFrames } from "./frames";
import { piAdapter, piAdapterFor } from "./index";
import { piView } from "./panel";

// A second panel an extension draws in the same pane (pi-sidebar, below the editor on a narrow pane and
// beside it on a wide one), declared in frames.toml (`panel_below`, `panel_beside`). The screens are
// built in the shapes of the real captures (test/split-screens.ts).
const PANES = new URL("../../../fixtures/panes/", import.meta.url);
const fixture = (name: string): StyledLine[] => splitLines(parseAnsi(readFileSync(new URL(name, PANES), "utf8")));
const text = (line: StyledLine) => lineText(line).trimEnd();

const declared = piAdapterFor(PANELS);
const CASES: [Layout, Focus, number | undefined][] = [
  ["none", "agent", undefined],
  ["below", "agent", 46],
  ["below", "panel", 46],
  ["below", "agent", 120],
  ["below", "panel", 120],
  ["beside", "agent", undefined],
  ["beside", "panel", undefined],
];

function reading(adapter: typeof piAdapter, lines: StyledLine[]) {
  return {
    ready: adapter.composerReady?.(lines),
    modal: adapter.modalOnScreen?.(lines),
    draft: adapter.extractInputDraft(lines),
    status: adapter.extractStatusLines(lines).map(text),
    prompt: adapter.composerPrompt?.(lines) ?? null,
    blocks: adapter.buildBlocks(lines).map((b) => [b.kind, b.lines.map(text)]),
  };
}

describe("pi: a second panel the operator declared", () => {
  it("reads the editor of the screen without the panel, whichever layout and whichever panel has the keys", () => {
    for (const [layout, focus, width] of CASES) {
      const r = reading(declared, splitRows(layout, focus, width));
      expect(r, `${layout} ${focus} ${String(width)}`).toMatchObject({
        ready: true,
        modal: false,
        draft: "next step",
        status: [" pi-plugins · main · opus", " Context 12% used · idle"],
      });
    }
  });

  it("draws only the agent's region in the mirror, the editor and the panel left out", () => {
    const alone = reading(declared, splitRows("none", "agent", 46)).blocks;
    expect(alone).toEqual([["raw", [" Earlier transcript in main."]]]);
    for (const focus of ["agent", "panel"] as const) {
      expect(reading(declared, splitRows("below", focus, 46)).blocks).toEqual(alone);
      expect(reading(declared, splitRows("beside", focus)).blocks).toEqual(alone);
    }
  });

  it("binds nothing to a screen it cut: the write goes out unbound, and the read-back guards Enter", () => {
    expect(reading(declared, splitRows("none", "agent", 46)).prompt).not.toBeNull();
    for (const [layout, focus, width] of CASES.slice(1)) expect(reading(declared, splitRows(layout, focus, width)).prompt, layout).toBeNull();
  });

  it("without the dividers declared reads the panel's own editor below, and no editor beside", () => {
    const footerOnly = piAdapterFor({ statusIndent: PANELS.statusIndent! });
    expect(reading(footerOnly, splitRows("below", "agent", 46))).toMatchObject({ ready: true, draft: null });
    expect(reading(footerOnly, splitRows("beside", "agent"))).toMatchObject({ ready: false, draft: null });
  });

  it("is a view of the region: the rows keep the screen's indices, the cut is named", () => {
    const below = piView(splitRows("below", "agent", 46), piFrames(PANELS));
    expect(below).toMatchObject({ cropped: true, column: null, rows: 8, split: true });
    expect(below.lines).toHaveLength(8);
    const beside = piView(splitRows("beside", "agent"), piFrames(PANELS));
    expect(beside).toMatchObject({ cropped: true, column: BESIDE_COLUMN, rows: null, split: true });
    expect(beside.lines).toHaveLength(12);
    expect(beside.lines.every((line) => [...lineText(line)].length <= BESIDE_COLUMN)).toBe(true);
  });

  it("is the same view as pi's own for a screen with no divider", () => {
    const lines = splitRows("none", "agent", 46);
    expect(piView(lines, piFrames(PANELS))).toEqual(piView(lines, DEFAULT_PI_FRAMES));
    expect(piView(lines, piFrames(PANELS)).lines).toBe(lines);
  });

  it("leaves pi's own frame as it is when only a second panel is declared", () => {
    const frames = piFrames(PANELS_ONLY);
    expect(frames.declared).toBe(false);
    expect(frames.edge).toBe(DEFAULT_PI_FRAMES.edge);
    expect(frames.statusRows).toBe(4);
    expect(frames.panels).toEqual({ below: PANELS_ONLY.panelBelow, beside: PANELS_ONLY.panelBeside });
    expect(piFrames(PANELS).declared).toBe(true);
    expect(adapterFor("pi", { pi: PANELS })).toBe(declared);
  });

  it("changes the reading of no capture of the corpus: none of them shows a divider", () => {
    const only = piAdapterFor(PANELS_ONLY);
    const all = readdirSync(PANES).filter((name) => name.endsWith(".txt"));
    expect(all.length).toBeGreaterThan(500);
    for (const name of all.filter((n) => n.startsWith("pi--"))) {
      const lines = fixture(name);
      expect(reading(only, lines), name).toEqual(reading(piAdapter, lines));
    }
  });
});

describe("pi: a question beside or above a declared panel", () => {
  const raw = readFileSync(new URL("pi--v0871-question-single.txt", PANES), "utf8")
    .replace(/\r/g, "")
    .replace(/\n+$/, "")
    .split("\n");
  const kinds = (lines: StyledLine[], adapter = declared) => adapter.buildBlocks(lines).map((b) => b.kind);

  it("is lifted without a panel, as the capture reads", () => {
    expect(kinds(fixture("pi--v0871-question-single.txt"), piAdapter)).toContain("prompt-select");
  });

  it("stays raw above a panel below: the bridge binds a tapped region to the screen's last rows", () => {
    const screen = splitLines(parseAnsi(belowScreen(raw, 120, "agent")));
    expect(kinds(screen)).toEqual(["raw"]);
    expect(piView(screen, piFrames(PANELS)).rows).toBe(raw.length);
  });

  it("is lifted beside a panel and bound to the columns it was read from, as beside OmO's side panel", () => {
    const column = 125;
    const screen = splitLines(parseAnsi(besideScreen(raw, column, 180, "agent")));
    const blocks = declared.buildBlocks(screen);
    const card = blocks.find((b) => b.kind === "prompt-select");
    expect(card?.kind).toBe("prompt-select");
    if (card?.kind !== "prompt-select") return;
    expect(card.prompt.bindColumns).toEqual({ start: 0, end: column });
    expect(card.prompt.options.map((o) => o.label)).toEqual(expect.arrayContaining(["Cancel"]));
    expect(card.lines.every((line) => [...lineText(line)].length <= column)).toBe(true);
  });
});
