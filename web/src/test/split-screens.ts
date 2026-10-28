// A pi pane that shares its screen with a second panel an extension draws (a side chat), built in the
// shapes and the colours of the real captures: the editor's rules in pi's grey, its status rows in the
// footer grey, the divider and its pointer in the extension's violet, and every cell of the region that
// does not have the keys dimmed (SGR 2). Used by the split-panel tests (lib/split-panel.test.ts, the
// surface and pi readers' ones): a screen is a layout, which panel has the keys, and a width.
//
//   below    the panel is under the editor: its divider is a row of `─` with `▴` (agent has the keys) or
//            `▾` (panel has them) in the middle, and the panel's own empty composer is the last rows
//   beside   the panel is to the right: the divider is column `BESIDE_COLUMN`, `│` down every row and
//            `◂` or `▸` on one, and the panel's own composer is its last rows
//   none     no panel: the same agent rows alone
import { parseAnsi } from "../lib/ansi";
import { splitLines, type StyledLine } from "../lib/blocks";
import type { PiFrameDeclaration } from "../lib/frame-declarations";

export type Layout = "none" | "below" | "beside";
export type Focus = "agent" | "panel";

/** The column of a beside divider: the agent's region is the first 89 columns. */
export const BESIDE_COLUMN = 89;
/** The widest pane the `beside` layout is built for. */
export const BESIDE_WIDTH = 180;
/** pi-sidebar's two dividers, and nothing else declared. */
export const PANELS_ONLY: PiFrameDeclaration = {
  panelBelow: { rule: "─", pointers: "▴▾" },
  panelBeside: { rule: "│", pointers: "◂▸" },
};
/** What the screens are read with: the dividers, and the footer one column in as the captures draw it. */
export const PANELS: PiFrameDeclaration = { statusIndent: 1, ...PANELS_ONLY };

const ESC = "\u001b[";
const RULE = `${ESC}38;2;118;129;134m`;
const FOOT = `${ESC}38;2;126;136;142m`;
const VIOLET = `${ESC}38;2;160;142;213m`;
const POINTER = `${ESC}38;2;167;152;215m`;
const PANEL_BG = `${ESC}48;2;33;59;73m`;
const DIM = `${ESC}2m`;
const RESET = `${ESC}0m`;

/** `text` in a colour, or as it is, and dimmed when the region does not have the keys. */
function paint(text: string, colour: string | null, dim: boolean): string {
  const ink = colour === null ? text : `${colour}${text}${ESC}39m`;
  return dim ? `${DIM}${ink}${ESC}22m` : ink;
}

/** The agent's rows, `width` columns wide: transcript, the editor holding `next step`, two footer rows. */
export function agentRows(width: number, dim: boolean, draft = "next step"): string[] {
  const rule = "─".repeat(width);
  return [
    paint(" Earlier transcript in main.", null, dim),
    paint("", null, dim),
    paint("", null, dim),
    paint(rule, RULE, dim),
    paint(draft.padEnd(width), null, dim),
    paint(rule, RULE, dim),
    paint(" pi-plugins · main · opus", FOOT, dim),
    paint(" Context 12% used · idle", FOOT, dim),
  ];
}

/** The panel's rows, `width` columns wide: a header, a question, and its own empty composer at the bottom. */
function panelRows(width: number, height: number, dim: boolean): string[] {
  const body = (text: string): string => `${PANEL_BG}${paint(text.padEnd(width), null, dim)}${ESC}49m`;
  const rule = "─".repeat(width);
  const rows = [body(" ◧ Sidebar · main: working"), body(""), body(" What is main doing?")];
  while (rows.length < height - 3) rows.push(body(""));
  rows.push(paint(rule, RULE, dim), paint("".padEnd(width), null, dim), paint(rule, RULE, dim));
  return rows;
}

/** The agent's rows with the panel under them: a divider `width` columns wide, then the panel's own rows. */
export function belowScreen(agent: string[], width: number, focus: Focus): string {
  const mid = Math.floor(width / 2) - 1;
  const divider = `${VIOLET}${"─".repeat(mid)}${ESC}39m${POINTER}${focus === "agent" ? "▴" : "▾"}${ESC}39m${VIOLET}${"─".repeat(width - mid - 1)}${ESC}39m`;
  return [...agent, divider, ...panelRows(width, 9, focus === "agent")].join("\n");
}

/** The agent's rows with the panel to their right: each row padded to `column`, then the divider column, then the panel's row. */
export function besideScreen(agent: string[], column: number, width: number, focus: Focus): string {
  const right = panelRows(width - column - 1, agent.length, focus === "agent");
  const pointer = Math.min(5, agent.length - 1);
  return agent
    .map((cell, i) => {
      const pad = " ".repeat(Math.max(0, column - [...stripAnsi(cell)].length));
      const edge = i === pointer ? `${POINTER}${focus === "agent" ? "◂" : "▸"}${ESC}39m` : `${VIOLET}│${ESC}39m`;
      return `${RESET}${cell}${pad}${RESET}${edge}${RESET}${right[i]!}`;
    })
    .join("\n");
}

/** Rows of ANSI for one screen. `none` and `below` are as wide as `width`; `beside` is BESIDE_WIDTH wide. */
export function splitScreen(layout: Layout, focus: Focus, width = layout === "beside" ? BESIDE_WIDTH : 46): string {
  const dim = layout !== "none" && focus === "panel";
  if (layout === "none") return agentRows(width, false).join("\n");
  if (layout === "below") return belowScreen(agentRows(width, dim), width, focus);
  // Beside: the agent's editor stands at the bottom of its columns, the panel's composer at the bottom of its own.
  const agent = agentRows(BESIDE_COLUMN, dim);
  const rows = [agent[0]!, ...Array.from({ length: 6 }, () => paint("", null, dim)), ...agent.slice(3)];
  return besideScreen(rows, BESIDE_COLUMN, width, focus);
}

const SGR = new RegExp(`${String.fromCodePoint(0x1b)}\\[[0-9;]*m`, "g");

function stripAnsi(text: string): string {
  return text.replace(SGR, "");
}

/** `splitScreen` parsed into rows, as the readers take a pane. */
export function splitRows(layout: Layout, focus: Focus, width?: number): StyledLine[] {
  return splitLines(parseAnsi(splitScreen(layout, focus, width)));
}
