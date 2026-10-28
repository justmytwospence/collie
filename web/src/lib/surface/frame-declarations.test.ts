import { readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { FrameDeclarations } from "../frame-declarations";
import { findInputFrame } from "./frame";
import { withFrameDeclaration } from "./frame-declarations";
import { declareFrames, declaredFrames, loadProfiles, requireProfile } from "./profile";
import { askOf } from "./surface";
import { fixtureRows, PANES_DIR, readScreen, rowsOf } from "../../test/surface-corpus";
import { agentRows, PANELS, PANELS_ONLY, splitRows, type Focus, type Layout } from "../../test/split-screens";

const DECLARED: FrameDeclarations = {
  pi: { ruleGlyphs: "━", ruleLabels: "ends", statusRows: 12, statusIndent: 1, statusBlankRows: 1 },
};

afterEach(() => declareFrames(undefined));

describe("frame declarations over the surface profiles", () => {
  it("returns every profile itself when nothing is declared, or nothing for it", () => {
    for (const profile of loadProfiles().values()) {
      expect(withFrameDeclaration(profile, undefined)).toBe(profile);
      if (profile.id !== "pi") expect(withFrameDeclaration(profile, DECLARED)).toBe(profile);
    }
  });

  it("widens the pi edges, the rows under the box and the running sign, and nothing else", () => {
    const shipped = requireProfile("pi");
    const declared = withFrameDeclaration(shipped, DECLARED);
    expect(declared.idle.frame.bottom.pattern).toBe("^(?:\\S.*?\\s+)?[─━]+(?:\\s+\\S.*?)?$");
    expect(declared.idle.frame.top.pattern).toContain("[─━]+");
    expect(declared.idle.volatile.below).toMatchObject({ maxRows: 12, footerMaxRows: 12 });
    expect(declared.idle.frame.underBlankRows).toBe(1);
    expect(declared.idle.frame.under?.startsWith("^ {0,1}")).toBe(true);
    expect(declared.idle.runningRows?.some((row) => row.includes("[─━]+"))).toBe(true);
    expect(declared.keys).toBe(shipped.keys);
    expect(declared.idle.frame.prompt).toBe(shipped.idle.frame.prompt);
  });

  it("finds the box the declared captures draw only with the declaration", () => {
    const pi = requireProfile("pi");
    const declared = withFrameDeclaration(pi, DECLARED).idle;
    for (const name of ["idle", "draft", "widget"]) {
      const rows = fixtureRows(`pi--v130-frames-${name}.txt`);
      expect(findInputFrame(rows, pi.idle), name).toBeNull();
      expect(findInputFrame(rows, declared), name).not.toBeNull();
    }
  });

  it("reads the declared idle capture free, and lifts the question's ask, when the bridge declares it", () => {
    declareFrames(DECLARED);
    expect(declaredFrames()).toBe(DECLARED);
    const idle = requireProfile("pi").idle;
    const free = readScreen(fixtureRows("pi--v130-frames-idle.txt"), "pi", idle).surface;
    expect(free).toMatchObject({ turn: "idle", modal: "none", composer: "empty" });
    const question = readScreen(fixtureRows("pi--v130-frames-question.txt"), "pi", idle).surface;
    expect(askOf(question.modal)?.options.map((o) => o.label)).toEqual([
      "Red · The first color.",
      "Green · The second color.",
      "Blue · The third color.",
      "Cancel",
    ]);
  });

  it("restores the shipped profiles when the declaration is withdrawn", () => {
    declareFrames(DECLARED);
    expect(requireProfile("pi").idle.volatile.below.maxRows).toBe(12);
    declareFrames(undefined);
    expect(requireProfile("pi").idle.volatile.below.maxRows).toBe(4);
  });
});

describe("a second panel's dividers over the surface profile", () => {
  const pi = requireProfile("pi");
  const idle = withFrameDeclaration(pi, { pi: PANELS }).idle;
  // The same declaration with no dividers: what the operator's file said before the panel was declared.
  const footerOnly = withFrameDeclaration(pi, { pi: { statusIndent: 1 } }).idle;
  const CASES: [Layout, Focus, number | undefined][] = [
    ["none", "agent", undefined],
    ["below", "agent", 46],
    ["below", "panel", 46],
    ["below", "agent", 120],
    ["below", "panel", 120],
    ["beside", "agent", undefined],
    ["beside", "panel", undefined],
  ];

  it("sets the profile's panels from the declaration, and for no profile or declaration without them", () => {
    expect(idle.splitPanels).toEqual({ below: PANELS.panelBelow, beside: PANELS.panelBeside });
    expect(footerOnly.splitPanels).toBeUndefined();
    expect(pi.idle.splitPanels).toBeUndefined();
    expect(withFrameDeclaration(pi, { pi: { panelBelow: PANELS.panelBelow! } }).idle.splitPanels).toEqual({ below: PANELS.panelBelow });
    for (const profile of loadProfiles().values()) if (profile.id !== "pi") expect(withFrameDeclaration(profile, { pi: PANELS })).toBe(profile);
  });

  it("reads the agent's own box whichever layout and whichever panel has the keys: a draft, `next step`", () => {
    for (const [layout, focus, width] of CASES) {
      const read = readScreen(splitRows(layout, focus, width), "pi", idle, { frames: { pi: PANELS } });
      expect(read.surface, `${layout} ${focus} ${String(width)}`).toMatchObject({ turn: "idle", modal: "none", composer: "draft" });
      expect(read.frame?.interior.text).toBe("next step");
    }
  });

  it("finds the panel's box, or none, without the dividers declared: the two reads it exists to fix", () => {
    const below = readScreen(splitRows("below", "agent", 46), "pi", footerOnly);
    expect(below.surface.composer).toBe("empty");
    const beside = readScreen(splitRows("beside", "agent"), "pi", footerOnly);
    expect(beside.surface.composer).toBe("unknown");
    expect(beside.frame).toBeNull();
  });

  it("reads a screen with no divider exactly as without the dividers", () => {
    const rows = splitRows("none", "agent", 46);
    expect(readScreen(rows, "pi", idle, { frames: { pi: PANELS } })).toEqual(readScreen(rows, "pi", footerOnly, { frames: { pi: { statusIndent: 1 } } }));
    const only = withFrameDeclaration(pi, { pi: PANELS_ONLY }).idle;
    const shipped = pi.idle;
    for (const name of readdirSync(PANES_DIR).filter((n) => n.startsWith("pi--"))) {
      const screen = fixtureRows(name);
      expect(readScreen(screen, "pi", only).surface, name).toEqual(readScreen(screen, "pi", shipped).surface);
    }
  });

  it("is a cut of the screen's rows, at the screen's own indices: the frame sits where the screen draws it", () => {
    const read = readScreen(splitRows("below", "agent", 46), "pi", idle, { frames: { pi: PANELS } });
    expect(read.frame).toMatchObject({ top: 3, bottom: 5 });
    expect(read.frame?.interior).toMatchObject({ prompt: 4, text: "next step" });
  });

  it("does not read a dimmed box as showing a placeholder: the panel that has the keys dims the box beside it", () => {
    const dimmed = rowsOf(agentRows(46, true).join("\n"));
    expect(readScreen(dimmed, "pi", idle).surface.composer).toBe("draft");
    // The box's own attribute is not a placeholder only where a panel is declared: nothing else is read differently.
    expect(readScreen(dimmed, "pi", footerOnly).surface.composer).toBe("empty");
  });
});
