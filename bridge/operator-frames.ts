import { readFileSync } from "node:fs";

import { frameDeclarationsFrom, type FrameDeclarations } from "../web/src/lib/frame-declarations.ts";
import type { JsonValue } from "./json.ts";

// `frames.toml`: the operator's declaration of how their extensions draw a harness's input box
// (web/src/lib/frame-declarations.ts holds the grammar, docs/configure.md the reference). Read ONCE at
// startup, unlike the request-time operator files beside it: it reshapes the surface profiles every
// read compiles once (web/src/lib/surface/profile.ts `declareFrames`), and a crew member publishes it
// in its `hello`, which the lead holds until the next one.
//
// The failure posture is the operator files': a missing file is nothing declared, and a file that does
// not parse is warned about and read as nothing declared, so a typo can never stop the bridge or reach
// a reader. A key out of bounds costs that key alone (`frameDeclarationsFrom`).

/** Kept behind an interface so the reader is testable without fs. */
export interface FramesFileIo {
  /** The file's text, or null when it is absent. May throw: read as a file that does not parse. */
  read(path: string): string | null;
}

const diskIo: FramesFileIo = {
  read(path) {
    try {
      return readFileSync(path, "utf8");
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") return null;
      throw err;
    }
  },
};

/** The declarations in `path`, or undefined when there is no file or nothing in it holds. */
export function readFrameDeclarations(
  path: string,
  io: FramesFileIo = diskIo,
  warn: (message: string) => void = (message) => console.warn(`[frames] ${message}`),
): FrameDeclarations | undefined {
  let text: string | null;
  try {
    text = io.read(path);
  } catch (err) {
    warn(`${path} could not be read (${String(err)}), so no frame is declared`);
    return undefined;
  }
  if (text === null) return undefined;
  let doc: JsonValue;
  try {
    // SAFETY: `Bun.TOML.parse` answers with a parsed document, which holds only strings, numbers,
    // booleans, arrays and tables, every one a JsonValue (TOML's dates are not read by any key here,
    // and `frameDeclarationsFrom` checks every field before it believes it).
    doc = Bun.TOML.parse(text) as JsonValue;
  } catch (err) {
    warn(`${path} could not be parsed (${String(err)}), so no frame is declared`);
    return undefined;
  }
  return frameDeclarationsFrom(doc, "toml", (message) => warn(`${path}: ${message}`));
}
