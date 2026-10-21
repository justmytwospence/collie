import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAnsi } from "../../ansi";
import { splitLines, type StyledLine } from "../../blocks";
import type { PiFrameDeclaration } from "../../frame-declarations";
import { describeAdapterConformance } from "../conformance";
import { adapterFor } from "../registry";
import { DEFAULT_PI_FRAMES, piFrames } from "./frames";
import { piAdapter, piAdapterFor } from "./index";

const PANES = new URL("../../../fixtures/panes/", import.meta.url);

function fixture(name: string): StyledLine[] {
  return splitLines(parseAnsi(readFileSync(new URL(name, PANES), "utf8")));
}

// The declaration the `pi--v130-frames-*` captures were drawn under (fixtures README): a context gauge
// in `━` painted into both rules, a vim-style mode label at the bottom rule's end, and a footer of six
// rows one column in, with an extension's widget and a blank row over it.
const DECLARED: PiFrameDeclaration = {
  ruleGlyphs: "━",
  ruleLabels: "ends",
  statusRows: 12,
  statusIndent: 1,
  statusBlankRows: 1,
};

const STOCK = readdirSync(PANES).filter((name) => name.startsWith("pi--") && !name.startsWith("pi--v130-frames-"));
const DECLARED_CAPTURES = readdirSync(PANES).filter((name) => name.startsWith("pi--v130-frames-"));

// The declared adapter under the same contract as pi's own (pi.test.ts): what it lifts from the
// declared captures passes every dialog-model and composer check, and it lifts nothing from any other
// capture, pi's included.
const DECLARED_LIFTED = DECLARED_CAPTURES.filter((name) => piAdapterFor(DECLARED).buildBlocks(fixture(name)).some((b) => b.kind !== "raw"));
describeAdapterConformance(piAdapterFor(DECLARED), {
  ownFixtures: DECLARED_LIFTED,
  neutralFixtures: DECLARED_CAPTURES.filter((name) => !DECLARED_LIFTED.includes(name)),
  foreignFixtures: readdirSync(PANES).filter((name) => name.endsWith(".txt") && !name.startsWith("pi--")),
  // A declared footer this tall puts the editor's rules past the bridge's six-row tail window, so no
  // region binds: a send there goes out unbound and the read-back still guards Enter.
  unboundComposerFixtures: [
    "pi--v130-frames-idle.txt",
    "pi--v130-frames-draft.txt",
    "pi--v130-frames-widget.txt",
    "pi--v130-frames-sandbox-idle.txt",
    "pi--v130-frames-sandbox-draft.txt",
  ],
  // pi-plugins' ask_user_question under the declaration: its titled top rule over a widget row and a
  // blank row, the second capture after a real Down.
  extraWalkPairs: [["pi", "pi--v130-frames-question.txt", "pi--v130-frames-question-moved.txt"]],
});

function reading(adapter: typeof piAdapter, lines: StyledLine[]) {
  return {
    ready: adapter.composerReady?.(lines),
    modal: adapter.modalOnScreen?.(lines),
    draft: adapter.extractInputDraft(lines),
    status: adapter.extractStatusLines(lines).length,
    blocks: adapter.buildBlocks(lines),
  };
}

describe("pi frames: nothing declared", () => {
  it("is pi's own frame: the same adapter, and the original limits", () => {
    expect(piAdapterFor(undefined)).toBe(piAdapter);
    expect(adapterFor("pi", {})).toBe(piAdapter);
    expect(adapterFor("pi", undefined)).toBe(piAdapter);
    expect(piFrames(undefined)).toBe(DEFAULT_PI_FRAMES);
    expect(DEFAULT_PI_FRAMES.statusRows).toBe(4);
    expect(DEFAULT_PI_FRAMES.edge("━".repeat(20))).toBe(false);
    expect(DEFAULT_PI_FRAMES.edge(`${"─".repeat(20)} INSERT`)).toBe(false);
  });

  it("reads none of the declared captures: no editor, so no draft, and no card", () => {
    for (const name of ["idle", "draft", "widget", "question", "sandbox-idle", "sandbox-draft"]) {
      const r = reading(piAdapter, fixture(`pi--v130-frames-${name}.txt`));
      expect(r.ready, name).toBe(false);
      expect(r.draft, name).toBeNull();
      expect(r.blocks.map((b) => b.kind), name).toEqual(["raw"]);
    }
  });
});

describe("pi frames: a declared frame", () => {
  const declared = piAdapterFor(DECLARED);

  it("is one adapter per declaration, and only for pi", () => {
    expect(piAdapterFor(DECLARED)).toBe(declared);
    expect(adapterFor("pi", { pi: DECLARED })).toBe(declared);
    expect(adapterFor("omp", { pi: DECLARED })).toBe(adapterFor("omp"));
  });

  it("changes the reading of no stock pi or OmO capture", () => {
    expect(STOCK.length).toBeGreaterThan(100);
    for (const name of STOCK) {
      const lines = fixture(name);
      expect(reading(declared, lines), name).toEqual(reading(piAdapter, lines));
    }
  });

  it("finds the empty editor under a gauge, a mode label and six indented footer rows", () => {
    const r = reading(declared, fixture("pi--v130-frames-idle.txt"));
    expect(r).toMatchObject({ ready: true, modal: false, draft: null, status: 6 });
    // The editor comes off the mirror: nothing is left above its top rule in a cut capture.
    expect(r.blocks).toEqual([{ kind: "raw", lines: [] }]);
  });

  it("reads a sandbox capture byte for byte: the label and the footer, before the gauge has context", () => {
    expect(reading(declared, fixture("pi--v130-frames-sandbox-idle.txt"))).toMatchObject({ ready: true, draft: null, status: 6 });
    expect(declared.extractInputDraft(fixture("pi--v130-frames-sandbox-draft.txt"))).toBe(
      "collie frames probe: a draft typed into an editor with a gauge and a label",
    );
  });

  it("reads the draft back", () => {
    expect(declared.extractInputDraft(fixture("pi--v130-frames-draft.txt"))).toBe(
      "collie frames probe: a draft typed into an editor with a gauge and a label",
    );
  });

  it("takes a widget row and one blank row between the editor and the footer", () => {
    expect(reading(declared, fixture("pi--v130-frames-widget.txt"))).toMatchObject({ ready: true, status: 8 });
    // Two blank rows are more than declared.
    const lines = fixture("pi--v130-frames-widget.txt");
    const blank = lines[4]!;
    expect(declared.composerReady?.([...lines.slice(0, 4), blank, ...lines.slice(4)])).toBe(false);
  });

  it("lifts a question whose top rule carries a title, over the widget row and a blank row", () => {
    const r = reading(declared, fixture("pi--v130-frames-question.txt"));
    expect(r.ready).toBe(false);
    expect(r.modal).toBe(true);
    const card = r.blocks.find((b) => b.kind === "prompt-select");
    expect(card?.kind).toBe("prompt-select");
    if (card?.kind !== "prompt-select") return;
    expect(card.prompt.question).toBe("Pick a color for the Collie probe.");
    expect(card.prompt.options.map((o) => [o.label, o.keys])).toEqual([
      ["Red · The first color.", ["Enter"]],
      ["Green · The second color.", ["Down", "Enter"]],
      ["Blue · The third color.", ["Down", "Down", "Enter"]],
      ["Cancel", ["Escape"]],
    ]);
    expect(card.prompt.feedback?.purpose).toBe("free-text");
  });

  it("measures a rule to its last drawn cell, so a padded end label is the rule's full width", () => {
    const frames = piFrames(DECLARED);
    const label = [{ text: "─".repeat(12) }, { text: " INSERT ", bg: "rgb(1,2,3)" }];
    expect(frames.width(label)).toBe(20);
    expect(DEFAULT_PI_FRAMES.width(label)).toBe(19);
  });
});
