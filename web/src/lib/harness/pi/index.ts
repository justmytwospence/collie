// The pi adapter. Herdr reports stock pi and OmO (the Senpi engine) alike as exactly `pi`, so this one
// adapter reads both, and every pi question extension through one reader (ask.ts, .adr/0098).
//
// Registering it moves every pi pane off the one-step send onto the guarded one (lib/reply-action.ts),
// which types only when `composerReady` says yes and submits only when the draft reads back. So the
// editor of every layout must be read (composer.ts), or a pi send is refused.
//
// Every reader below reads `piView(lines)`: the screen, or the screen cropped at OmO's side panel
// (panel.ts). Rows keep their indices. A question read from a cropped view binds to the columns it
// was read from (`bindColumns`); the editor beside the panel binds nothing.
//
// The readers take the operator's frame declaration (frames.ts) when there is one: `piAdapterFor`
// builds the adapter for it. `piAdapter` is pi's own frame, the one every pane gets by default.
import { trimTrailingBlank, type Block, type StyledLine } from "../../blocks";
import type { HarnessAdapter } from "../types";
import { detectPiQuestion, piModalOnScreen, piQuestionBanner, type PiQuestion } from "./ask";
import { composerDraft, composerPrompt, composerStatusLines, locateComposer } from "./composer";
import { DEFAULT_PI_FRAMES, piFrames, type PiFrameDeclaration, type PiFrames } from "./frames";
import { piView, type PiView } from "./panel";
import { detectPiTrust } from "./trust";
import { detectPiMultiSelect } from "./multi";

export function piBuildBlocks(lines: StyledLine[], frames: PiFrames = DEFAULT_PI_FRAMES): Block[] {
  const view = piView(lines, frames);
  const question = boundQuestion(view, frames);
  if (question !== null) {
    const before = trimTrailingBlank(lines.slice(0, question.startLine));
    const blocks: Block[] = before.length > 0 ? [{ kind: "raw", lines: before }] : [];
    // The card's own rows are the view's: beside the side panel they end at the panel's column.
    const region = view.lines.slice(question.startLine);
    blocks.push(
      question.kind === "prompt-select"
        ? { kind: "prompt-select", prompt: question.model, lines: region }
        : { kind: "wizard", wizard: question.model, lines: region },
    );
    return blocks;
  }
  // A checkbox question (multi.ts). Beside OmO's side panel it stays raw: nothing there binds whole rows.
  const multi = view.column === null ? detectPiMultiSelect(view.lines, frames) : null;
  if (multi !== null) {
    const before = trimTrailingBlank(lines.slice(0, multi.startLine));
    const blocks: Block[] = before.length > 0 ? [{ kind: "raw", lines: before }] : [];
    blocks.push({ kind: "multi-select", multi: multi.model, lines: view.lines.slice(multi.startLine) });
    return blocks;
  }
  // The trust prompt fills the screen before any editor or side panel exists, so it is read whole.
  const trust = view.column === null ? detectPiTrust(lines) : null;
  if (trust !== null) {
    const before = trimTrailingBlank(lines.slice(0, trust.startLine));
    const blocks: Block[] = before.length > 0 ? [{ kind: "raw", lines: before }] : [];
    blocks.push({ kind: "prompt-select", prompt: trust.model, lines: lines.slice(trust.startLine) });
    return blocks;
  }
  // The editor comes off the mirror only when it is the editor: a modal can fill the same rules with
  // rows the stock layout would accept (pi's `/model` picker opens with its `>` search row,
  // pi--v110-core-selector.txt), and the mirror must keep it.
  const composer = ready(view.lines, frames) ? locateComposer(view.lines, frames) : null;
  return [{ kind: "raw", lines: composer === null ? lines : trimTrailingBlank(lines.slice(0, composer.top)) }];
}

/**
 * The question on the view, bound to the columns it was read from. Beside OmO's side panel the rows
 * are the screen's first W columns, so a question there carries `bindColumns` 0 to W and the bridge
 * compares only those columns; the panel ticks beside it and must not refuse the tap. Only a
 * question card takes the range: a Submit page beside the panel has no capture and stays raw with
 * the Escape card.
 */
function boundQuestion(view: PiView, frames: PiFrames): PiQuestion | null {
  const question = detectPiQuestion(view.lines, frames);
  if (question === null || view.column === null) return question;
  if (question.kind !== "prompt-select") return null;
  return { ...question, model: { ...question.model, bindColumns: { start: 0, end: view.column } } };
}

/** The editor is on screen and no pi modal is: the only screen a reply may be typed into. A question's inline answer editor is not a place
 *  the phone types (.adr/0098), so it answers false. */
function ready(view: StyledLine[], frames: PiFrames): boolean {
  return locateComposer(view, frames) !== null && !piModalOnScreen(view, frames);
}

/** The pi adapter for one frame: pi's own, or the shape an operator declared (frames.ts). */
function makePiAdapter(frames: PiFrames): HarnessAdapter {
  const view = (lines: StyledLine[]) => piView(lines, frames);
  return {
    agent: "pi",
    buildBlocks: (lines) => piBuildBlocks(lines, frames),
    extractStatusLines: (lines) => composerStatusLines(view(lines).lines, frames),
    extractInputDraft: (lines) => {
      const shown = view(lines).lines;
      return ready(shown, frames) ? composerDraft(shown, frames) : null;
    },
    composerReady: (lines) => ready(view(lines).lines, frames),
    // The editor frame to bind a write to. None on a cropped view: the bridge matches whole screen
    // rows, so the write goes out unbound, and the read-back still guards Enter.
    composerPrompt: (lines) => {
      const shown = view(lines);
      return !shown.cropped && ready(shown.lines, frames) ? composerPrompt(shown.lines, frames) : null;
    },
    // The way out every pi question screen prints: `Esc to cancel` (stock question, pi--v0871-*),
    // `Esc cancel` (stock questionnaire), `esc cancel` (OmO, pi--omo-v5130-*), `Esc to go back` and
    // `esc discard` in the inline answer editors, and `Escape/Ctrl+C to cancel` on pi's own pickers
    // (pi--v110-core-selector.txt). Offered by name: on an answer editor it steps back, it does not end
    // the question.
    cancelKey: "Escape",
    // OmO's `? Question pending` banner over a ready editor: a cue in Chat, never a card (ask.ts).
    questionPending: (lines) => piQuestionBanner(view(lines).lines, frames),
    // The trust prompt ends at its bottom rule with no status rows under it, so it is not a pi frame.
    modalOnScreen: (lines) => piModalOnScreen(view(lines).lines, frames) || detectPiTrust(lines) !== null,
  };
}

/** Herdr reports stock pi and OmO as exactly `pi`; no prefix or executable-name inference. */
export const piAdapter: HarnessAdapter = makePiAdapter(DEFAULT_PI_FRAMES);

const declared = new WeakMap<PiFrameDeclaration, HarnessAdapter>();

/** The pi adapter for an operator's frame declaration, or `piAdapter` when there is none. One adapter
 *  per declaration object, so a caller that holds the declaration gets the same adapter each time. */
export function piAdapterFor(declaration: PiFrameDeclaration | undefined): HarnessAdapter {
  if (declaration === undefined) return piAdapter;
  let adapter = declared.get(declaration);
  if (adapter === undefined) {
    adapter = makePiAdapter(piFrames(declaration));
    declared.set(declaration, adapter);
  }
  return adapter;
}
