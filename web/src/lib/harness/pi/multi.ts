// A pi-family checkbox question, lifted as a `multi-select` block, when the operator declared its
// row shape (`frames.toml`: `checkbox_ticks`, and `typed_answer` for its typed-answer row).
//
// .adr/0098 keeps every pi multi-select raw: pi has no checkbox question of its own, and each
// extension draws one differently. An operator whose extension draws OmO's form declares its tick
// glyphs, and the reader takes the rest from the screen as it does for every pi question:
//
//    Ask user · ──────────────────────────────
//    → Colors · choose any   Submit             a strip: one question, then Submit
//    Pick the colors for the Collie probe.      the question
//    → 1.   Red · The first color.              numbered rows, a tick column after the number
//      2. ✓ Green · The second color.
//      3.   Other · type your own answer        the declared typed-answer row: never a button
//      Type your own answer: check 3, then enter.
//    ↑↓ move  1-9 select  space toggle  enter next  tab done  n note  esc cancel
//   ──────────────────────────────────────────
//
// The footer is the contract: `1-9 select` and `space toggle` make it a checkbox question, and a bare
// `tab` that is `done` or `submit` is the key that commits a lone question. A digit toggles its own row
// whatever the pointer (it may also move the pointer there, which the signature normalises out), so the
// recipe is `digit`, and the advance is the declared `Tab`: the form has no advance row. Everything else
// stays raw, with the Escape card: no declaration, a strip with more than one question, a footer
// without those keys, a ticked typed-answer row (Tab then asks for its text rather than committing), a
// row outside the shape. The phone never types into the dialog.
import type { StyledLine } from "../../blocks";
import type { MultiPointer, MultiSelectModel, MultiSelectOption } from "../multi-select-model";
import { readPiFrame } from "./ask";
import { DEFAULT_PI_FRAMES, type PiFrames } from "./frames";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeClass(glyphs: string): string {
  return [...glyphs].map((g) => g.replace(/[\\\]^-]/g, "\\$&")).join("");
}

/** A wrapped rest of a row: five columns in or more, the row's own label column. */
const REST = /^ {5,}(\S.*)$/;
/** A lone question's strip: the current question's chip (single spaces only: two or more part chips),
 *  then Submit. */
const STRIP = /^ *→ (\S(?:\S| (?! ))*)\s{2,}(Submit)$/;
/** One unnumbered note under the rows (`Type your own answer: check 3, then enter.`). */
const NOTE = /^ {3,}\S/;
const ADVANCE_KEYS = ["Tab"];

interface Row {
  n: number;
  label: string;
  checked: boolean;
  pointed: boolean;
  row: number;
}

export interface PiMultiSelect {
  model: MultiSelectModel;
  startLine: number;
}

export function detectPiMultiSelect(lines: StyledLine[], frames: PiFrames = DEFAULT_PI_FRAMES): PiMultiSelect | null {
  // Only a frame whose operator declared its tick glyphs (frames.ts `checkboxTicks`): pi's own frame
  // has no checkbox question, and a pi multi-select stays raw by default (.adr/0098).
  if (frames.checkboxTicks === null) return null;
  // A numbered checkbox row: the pointer column, the digit, the one-cell tick column, the label.
  const ROW = new RegExp(`^ ([→ ]) ([1-9])\\. ([${escapeClass(frames.checkboxTicks)} ]) (\\S.*)$`, "u");
  const typedAnswer = frames.typedAnswer;
  const frame = readPiFrame(lines, frames);
  if (frame === null || frame.open) return null;
  const { texts, top, footer, footerStart } = frame;
  if (!footer.digitsSelect || !footer.spaceToggles || footer.escapeVerb === null) return null;
  if (footer.tabVerb !== "done" && footer.tabVerb !== "submit") return null;

  // The strip, the question, then the rows: each run after at most one blank row.
  let at = top + 1;
  while (at < footerStart && texts[at] === "") at++;
  const strip = STRIP.exec(texts[at] ?? "");
  if (strip === null) return null;
  at++;
  while (at < footerStart && texts[at] === "") at++;
  const question: string[] = [];
  while (at < footerStart && /^ \S/.test(texts[at]!) && !ROW.test(texts[at]!)) question.push(texts[at++]!.trim());
  if (question.length === 0) return null;
  while (at < footerStart && texts[at] === "") at++;

  const rows: Row[] = [];
  for (; at < footerStart; at++) {
    const t = texts[at]!;
    const m = ROW.exec(t);
    if (m !== null) {
      if (Number(m[2]) !== rows.length + 1) return null;
      rows.push({ n: Number(m[2]), label: m[4]!.trim(), checked: m[3] !== " ", pointed: m[1] === "→", row: at });
      continue;
    }
    const rest = REST.exec(t);
    if (rest !== null && rows.length > 0) {
      rows.at(-1)!.label += ` ${rest[1]!}`;
      continue;
    }
    break;
  }
  if (rows.length < 2 || rows.filter((r) => r.pointed).length !== 1) return null;
  const last = rows.at(-1)!;
  // `Other · type your own answer`, or `Other: what was typed` once the operator typed into it.
  const typed = typedAnswer !== null && new RegExp(`^${escapeRegExp(typedAnswer)}(?![\\p{L}\\p{N}])`, "u").test(last.label) ? last : null;
  // A ticked typed-answer row: Tab asks for its text instead of committing, so the card stays away.
  if (typed?.checked === true) return null;
  const choices = typed === null ? rows : rows.slice(0, -1);
  if (choices.length < 1) return null;

  // Under the rows: at most one note, then only blank rows to the footer.
  let notes = 0;
  for (; at < footerStart; at++) {
    if (texts[at] === "") continue;
    if (!NOTE.test(texts[at]!) || ++notes > 1) return null;
  }

  const pointedRow = rows.find((r) => r.pointed)!;
  const pointer: MultiPointer = pointedRow === typed ? "other" : "option";
  const options: MultiSelectOption[] = choices.map((r) => ({ n: r.n, label: r.label, checked: r.checked }));
  const end = last.row;
  const model: MultiSelectModel = {
    phase: "checkbox",
    question: question.join(" "),
    options,
    escape: null,
    pointer,
    pointerRow: pointer === "option" ? pointedRow.n : null,
    steps: null,
    advanceLabel: strip[2]!,
    advanceKeys: ADVANCE_KEYS,
    toggle: "digit",
    // The comparators compare `checked` and the pointer separately, so neither enters the identity.
    signature: texts
      .slice(top, end + 1)
      .map((t) => {
        const m = ROW.exec(t);
        return m === null ? t : `   ${m[2]}.   ${m[4]}`;
      })
      .join("\n"),
    // From the frame's top rule through the last row: the note, the footer and the status rows under
    // it stay inside the bridge's tail window, and none of them changes while the ticks do.
    regionSignature: texts.slice(top, end + 1).join("\n"),
  };
  return { model, startLine: top };
}
