import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAnsi } from "../../ansi";
import { splitLines } from "../../blocks";
import { detectPiQuestion } from "./ask";
import { piFrames } from "./frames";

// An option's wrapped rest behind a one-column gutter, read only under a frame declaration that names
// the gutter (`optionGutter`). Built from a real capture of pi's own `question` example: only the rows
// such an extension would draw differently are changed.
const RAW = readFileSync(new URL("../../../fixtures/panes/pi--v0871-question-narrow.txt", import.meta.url), "utf8");
const GUTTER = piFrames({ optionGutter: "│" });

function question(text: string, frames = piFrames(undefined)) {
  const found = detectPiQuestion(splitLines(parseAnsi(text)), frames);
  return found?.kind === "prompt-select" ? found.model : null;
}

describe("a declared option gutter", () => {
  it("joins an option's wrapped rest behind a declared gutter to the option, and only when declared", () => {
    const rows = RAW.split(/\r?\n/);
    const red = rows.indexOf("\x1b[0m\x1b[38;2;138;190;183m> 1. Red\x1b[0m");
    expect(rows[red + 1]).toContain("Warm and loud.");
    rows.splice(red, 2, "\x1b[0m\x1b[38;2;138;190;183m> 1. Red · Warm and\x1b[0m", ` \x1b[0m\x1b[38;2;102;102;102m│\x1b[0m    loud.`);
    expect(question(rows.join("\n"), GUTTER)?.options[0]?.label).toBe("Red · Warm and loud.");
    expect(question(rows.join("\n"))).toBeNull();
  });

  it("does not join a gutter row to the free-text row", () => {
    const rows = RAW.split(/\r?\n/);
    const free = rows.indexOf("  \x1b[0m\x1b[38;2;212;212;212m4. Type something.\x1b[0m");
    expect(free).toBeGreaterThan(0);
    rows.splice(free + 1, 0, ` \x1b[0m\x1b[38;2;102;102;102m│\x1b[0m    more`);
    const model = question(rows.join("\n"), GUTTER);
    expect(model?.options.map((o) => o.label)).toEqual(question(RAW)?.options.map((o) => o.label));
    expect(JSON.stringify(model)).not.toContain("Type something. more");
  });
});
