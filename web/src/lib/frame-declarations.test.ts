import { describe, expect, it } from "vitest";
import { frameDeclarationsFrom } from "./frame-declarations";

function read(doc: Parameters<typeof frameDeclarationsFrom>[0], spelling: "toml" | "wire" = "toml") {
  const warnings: string[] = [];
  return { value: frameDeclarationsFrom(doc, spelling, (w) => warnings.push(w)), warnings };
}

describe("frame declarations", () => {
  it("reads the file's spelling and the wire's into the same declaration", () => {
    const toml = read({
      pi: { rule_glyphs: "━", rule_labels: "ends", status_rows: 12, status_indent: 1, status_blank_rows: 1 },
    });
    const wire = read(
      { pi: { ruleGlyphs: "━", ruleLabels: "ends", statusRows: 12, statusIndent: 1, statusBlankRows: 1 } },
      "wire",
    );
    expect(toml.warnings).toEqual([]);
    expect(toml.value).toEqual({
      pi: { ruleGlyphs: "━", ruleLabels: "ends", statusRows: 12, statusIndent: 1, statusBlankRows: 1 },
    });
    expect(wire).toEqual(toml);
  });

  it("is nothing for no file, an empty file and an empty table", () => {
    expect(read(undefined)).toEqual({ value: undefined, warnings: [] });
    expect(read(null)).toEqual({ value: undefined, warnings: [] });
    expect(read({})).toEqual({ value: undefined, warnings: [] });
    expect(read({ pi: {} })).toEqual({ value: undefined, warnings: [] });
  });

  it("drops a value out of bounds and keeps the rest, with one warning each", () => {
    const { value, warnings } = read({
      pi: {
        rule_glyphs: "━x",
        rule_labels: "left",
        status_rows: 40,
        status_indent: 1,
        status_blank_rows: -1,
      },
    });
    expect(value).toEqual({ pi: { statusIndent: 1 } });
    expect(warnings).toHaveLength(4);
    expect(warnings.join("\n")).toMatch(/rule_glyphs.*rule_labels.*status_rows.*status_blank_rows/s);
  });

  it("takes only box-drawing and block glyphs for a rule, so a letter never reads prose as a border", () => {
    expect(read({ pi: { rule_glyphs: "━═▀" } }).value).toEqual({ pi: { ruleGlyphs: "━═▀" } });
    expect(read({ pi: { rule_glyphs: "-" } }).value).toBeUndefined();
    expect(read({ pi: { rule_glyphs: "" } }).value).toBeUndefined();
  });

  it("warns about a key it does not know, and a harness no reader takes, and reads the rest", () => {
    const { value, warnings } = read({ pi: { status_rows: 6, colour: "red" }, claude: { status_rows: 6 } });
    expect(value).toEqual({ pi: { statusRows: 6 } });
    expect(warnings).toHaveLength(2);
    expect(warnings.join("\n")).toMatch(/frames\.pi\.colour/);
    expect(warnings.join("\n")).toMatch(/frames\.claude/);
  });

  it("does not take the other spelling's keys", () => {
    expect(read({ pi: { statusRows: 6 } }).value).toBeUndefined();
    expect(read({ pi: { status_rows: 6 } }, "wire").value).toBeUndefined();
  });

  it("is nothing for a document that is not a table of tables", () => {
    expect(read("pi").value).toBeUndefined();
    expect(read({ pi: ["status_rows"] }).value).toBeUndefined();
  });
});
