import { afterEach, describe, expect, it } from "vitest";
import type { FrameDeclarations } from "../frame-declarations";
import { findInputFrame } from "./frame";
import { withFrameDeclaration } from "./frame-declarations";
import { declareFrames, declaredFrames, loadProfiles, requireProfile } from "./profile";
import { askOf } from "./surface";
import { fixtureRows, readScreen } from "../../test/surface-corpus";

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
