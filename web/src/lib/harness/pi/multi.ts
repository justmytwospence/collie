// A pi-family checkbox question, lifted as a `multi-select` block (ASK_NOTES.md, "Multi-select").
//
// .adr/0098 left every pi multi-select raw until a published extension's captures proved its keys.
// pi-plugins' `ask_user_question` (justmytwospence/pi-plugins, pi-ask-user-question) draws OmO's form
// for a multiple choice, and its source and captures give the recipe this reads:
//
//    Ask user · ──────────────────────────────
//    → Probe · choose any   Submit                 a strip: one question, then Submit
//    Capture probe: wait about 6 seconds, …      the question
//    → 1.   A · First.                           numbered rows, a tick column after the number
//      2. ✓ B · Second.
//      3.   Other · type your own answer         the typed-answer row: never a button
//      Type your own answer: check 3, then enter.
//    ↑↓ move  1-9 select  space toggle  enter next  tab done  n note  esc cancel
//   ──────────────────────────────────────────
//
// The footer is the contract, as for every pi question: `1-9 select` and `space toggle` make it a
// checkbox question, and a bare `tab` that is `done` or `submit` is the key that commits the ticks of
// a lone question. A digit toggles its own row whatever the pointer (it also moves the pointer there,
// which the signature normalises out), so the recipe is `digit`, and the advance is the declared
// `Tab`: the form has no advance row. Everything else stays raw, with the Escape card: a strip with
// more than one question, a footer without those keys, a ticked typed-answer row (Tab then opens its
// editor rather than committing), a row outside the shape. The phone never types into the dialog.
import type { StyledLine } from "../../blocks";
import type { MultiPointer, MultiSelectModel, MultiSelectOption } from "../multi-select-model";
import { readPiFrame } from "./ask";
import { DEFAULT_PI_FRAMES, type PiFrames } from "./frames";

/** A numbered checkbox row: the pointer column, the digit, the tick column, the label. */
const ROW = /^ ([→ ]) ([1-9])\. ([✓✔x ]) (\S.*)$/;
/** A wrapped rest of a row: five columns in or more, the row's own label column. */
const REST = /^ {5,}(\S.*)$/;
/** A lone question's strip: the current question's chip (single spaces only: two or more part chips),
 *  then Submit. */
const STRIP = /^ *→ (\S(?:\S| (?! ))*)\s{2,}(Submit)$/;
/** The typed-answer row's label: never a button, since its text is asked for in the terminal. */
const TYPED = /^Other\b/;
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
  const typed = TYPED.test(last.label) ? last : null;
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
