import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAnsi } from "../../ansi";
import { splitLines } from "../../blocks";
import { detectPiQuestion } from "./ask";

// A pane narrower than a dialog's key hint wraps it. Built from real narrow captures of pi's own
// `question` example and its selector (pi--v0871-question-narrow.txt, pi--v0871-permission-gate-narrow.txt):
// only the rows a narrower pane would wrap are changed, in the styles the captures print them in.
const RAW = readFileSync(new URL("../../../fixtures/panes/pi--v0871-question-narrow.txt", import.meta.url), "utf8");
const HINT = " \x1b[0m\x1b[38;2;102;102;102m↑↓ navigate • Enter to select • Esc to cancel\x1b[0m";
const dim = (text: string) => ` \x1b[0m\x1b[38;2;102;102;102m${text}\x1b[0m`;

const GATE = readFileSync(new URL("../../../fixtures/panes/pi--v0871-permission-gate-narrow.txt", import.meta.url), "utf8");

function question(text: string) {
  const found = detectPiQuestion(splitLines(parseAnsi(text)));
  return found?.kind === "prompt-select" ? found.model : null;
}

describe("a pi question whose key hint a narrow pane wrapped", () => {
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

  it("reads pi's own selector with its hint wrapped below 47 columns, as the permission gate draws it", () => {
    const rows = GATE.split(/\r?\n/);
    const hint = rows.findIndex((r) => r.includes("escape/ctrl+c"));
    const cut = rows[hint]!.indexOf("  \x1b[0m\x1b[38;2;102;102;102mescape");
    expect(cut).toBeGreaterThan(0);
    rows.splice(hint, 1, rows[hint]!.slice(0, cut), ` ${rows[hint]!.slice(cut + 2)}`);
    const model = question(rows.join("\n"));
    expect(model?.options.map((o) => [o.label, o.keys])).toEqual([
      ["Yes", ["Enter"]],
      ["No", ["Down", "Enter"]],
      ["Cancel", ["Escape"]],
    ]);
  });
});
