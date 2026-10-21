import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAnsi } from "../../ansi";
import { splitLines } from "../../blocks";
import { detectPiQuestion } from "./ask";

// A pane narrower than a dialog's key hint or one of its option rows wraps them. Built from a real
// narrow capture of pi's own `question` example (pi--v0871-question-narrow.txt): only the rows a
// narrower pane would wrap are changed, in the styles the capture prints them in.
const RAW = readFileSync(new URL("../../../fixtures/panes/pi--v0871-question-narrow.txt", import.meta.url), "utf8");
const HINT = " \x1b[0m\x1b[38;2;102;102;102m↑↓ navigate • Enter to select • Esc to cancel\x1b[0m";
const dim = (text: string) => ` \x1b[0m\x1b[38;2;102;102;102m${text}\x1b[0m`;

function question(text: string) {
  const found = detectPiQuestion(splitLines(parseAnsi(text)));
  return found?.kind === "prompt-select" ? found.model : null;
}

describe("a pi question in a narrow pane", () => {
  it("reads a two-space footer wrapped between two hints, Escape included", () => {
    expect(RAW).toContain(HINT);
    const wrapped = RAW.replace(HINT, `${dim("↑↓ navigate  enter select")}\n${dim("escape/ctrl+c cancel")}`);
    const model = question(wrapped);
    expect(model?.options.at(-1)).toMatchObject({ label: "Cancel", keys: ["Escape"] });
    expect(model?.options.map((o) => o.label).slice(0, 3)).toEqual(["Red", "Green", "Blue"]);
  });

  it("still reads a footer wrapped inside one hint, as before", () => {
    const wrapped = RAW.replace(HINT, `${dim("↑↓ navigate • Enter to")}\n${dim("select • Esc to cancel")}`);
    expect(question(wrapped)?.options.at(-1)).toMatchObject({ label: "Cancel", keys: ["Escape"] });
  });

  it("joins an option's wrapped rest behind a one-column gutter to the option", () => {
    const rows = RAW.split(/\r?\n/);
    const red = rows.indexOf("\x1b[0m\x1b[38;2;138;190;183m> 1. Red\x1b[0m");
    expect(rows[red + 1]).toContain("Warm and loud.");
    rows.splice(red, 2, "\x1b[0m\x1b[38;2;138;190;183m> 1. Red · Warm and\x1b[0m", ` \x1b[0m\x1b[38;2;102;102;102m│\x1b[0m    loud.`);
    expect(question(rows.join("\n"))?.options[0]?.label).toBe("Red · Warm and loud.");
  });

  it("does not join a gutter row to the free-text row", () => {
    const rows = RAW.split(/\r?\n/);
    const free = rows.indexOf("  \x1b[0m\x1b[38;2;212;212;212m4. Type something.\x1b[0m");
    expect(free).toBeGreaterThan(0);
    rows.splice(free + 1, 0, ` \x1b[0m\x1b[38;2;102;102;102m│\x1b[0m    more`);
    const model = question(rows.join("\n"));
    expect(model?.options.map((o) => o.label)).toEqual(question(RAW)?.options.map((o) => o.label));
    expect(JSON.stringify(model)).not.toContain("Type something. more");
  });
});
