import { describe, expect, test } from "bun:test";
import { readFrameDeclarations, type FramesFileIo } from "./operator-frames.ts";

function io(text: string | null | Error): FramesFileIo {
  return {
    read: () => {
      if (text instanceof Error) throw text;
      return text;
    },
  };
}

function read(text: string | null | Error) {
  const warnings: string[] = [];
  return { value: readFrameDeclarations("/cfg/frames.toml", io(text), (w) => warnings.push(w)), warnings };
}

describe("frames.toml", () => {
  test("no file is nothing declared, and no warning", () => {
    expect(read(null)).toEqual({ value: undefined, warnings: [] });
  });

  test("reads the pi table in the file's spelling", () => {
    const { value, warnings } = read(
      ['[pi]', 'rule_glyphs = "━"', 'rule_labels = "ends"', "status_rows = 12", "status_indent = 1", "status_blank_rows = 1"].join("\n"),
    );
    expect(warnings).toEqual([]);
    expect(value).toEqual({
      pi: { ruleGlyphs: "━", ruleLabels: "ends", statusRows: 12, statusIndent: 1, statusBlankRows: 1 },
    });
  });

  test("a file that does not parse, or cannot be read, is nothing declared, with one warning naming it", () => {
    for (const broken of ["[pi\nstatus_rows = ", new Error("EACCES")]) {
      const { value, warnings } = read(broken);
      expect(value).toBeUndefined();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("/cfg/frames.toml");
    }
  });

  test("a value out of bounds costs that key alone, with the file named in the warning", () => {
    const { value, warnings } = read('[pi]\nstatus_rows = 99\nstatus_indent = 1\n');
    expect(value).toEqual({ pi: { statusIndent: 1 } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\/cfg\/frames\.toml: frames\.pi\.status_rows/);
  });
});
