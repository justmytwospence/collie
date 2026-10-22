# 0098: pi questions are read by shape and footer

- **Status:** Accepted
- **Date:** 2026-10-12
- **Shipped in:** pending (1.20.1)
- **Trail:** [PR 397](https://github.com/AltanS/collie/pull/397) (a `pi` adapter with recipes for one
  question extension) · [issue 412](https://github.com/AltanS/collie/issues/412) (a `pi` adapter for
  OmO's built-in ask) · `web/src/lib/harness/pi/ask.ts`, `footer.ts`, `ASK_NOTES.md` ·
  `web/src/fixtures/panes/pi--*.txt` · [ADR 0009](./0009-a-generic-menu-is-driven-by-the-keys-it-names.md) ·
  [ADR 0053](./0053-an-unread-dialog-still-has-a-way-out.md) ·
  [ADR 0055](./0055-a-pointed-list-is-walked-then-confirmed.md) ·
  [ADR 0077](./0077-the-omp-ask-single-select-is-lifted-and-its-multi-select-is-not.md) ·
  [ADR 0080](./0080-a-pointed-list-is-walked-verified-then-confirmed.md)

## Context

Herdr reports stock pi and OmO (the Senpi engine) alike as `pi`. pi has no question tool of its
own. Questions come from extensions: pi's own `question` and `questionnaire` examples, OmO's
built-in ask, the unpublished one behind PR 397, and many more on npm. PR 397 and issue 412 each
brought a `pi` adapter with recipes for one of them, and the two cannot both be registered.

The screens share a shape: a dialog between two rules at the tail, numbered options with one
pointer, often a free-text row, and a footer that names the keys. They differ in what the keys do.
On stock pi Enter selects and digits do nothing. On OmO a digit answers one question and Enter
means "next". On OmO's multi-select Enter toggles. A recipe copied from one screen to another
answers the wrong thing.

## Decision

One reader serves every pi-family question screen, and it names no extension and no tool.

- It reads the dialog by its shape and fails closed. Anything it does not expect stays raw, with the
  Escape card when the footer names Escape.
- It takes the plan from the footer alone. Arrows that move and Enter that selects or confirms give
  walk, verify, commit (ADR 0080). `1-9 select`, with Enter not select and one question, gives the
  digit alone, a key the screen printed (ADR 0009). Digits named only as typed text give nothing.
  Escape is the Cancel row, in the footer's words.
- A tab page lifts only by the walk. A Submit page lifts as a review only when it names Enter as
  submit and every question has an answer.
- Multi-select stays raw. So does a pointer on the free-text row, and every inline answer editor.
  The phone never types into a dialog.

## Consequences

This closes off one grammar per extension, a digit the footer did not name, and typing into a
dialog. A new extension gets buttons when its screen has this shape and its footer uses these
words, with no code change. One with other words stays raw until its footer is read.

Multi-select waits for a published extension whose capture proves Space ticks and Enter confirms.

The screen is a fallback, not the goal. A Collie-owned stock pi extension can see every tool call
as data through pi's `tool_call` event (`toolName`, `input`), but no pi API lets it answer another
extension's `ctx.ui.custom` dialog, so answers to those stay keys. OmO's built-in ask also publishes
the open question on an authenticated local control endpoint (`<agentDir>/rpc/tui/*.sock`, a 0600
secret, `get_state` and `subscribe` to read, `extension_ui_response` to answer, per senpi's
`docs/rpc.md`). That is a structured path for OmO, read from the source and not yet verified; taking
it is a separate decision, because an answer through it is an action from an emitter
([ADR 0024](./0024-a-beacon-is-a-hint-never-a-control-channel.md)).
Every pi screen without such a path keeps this reader.

## Amendment — 2026-10-12: pickers are dialogs by their hint row, and OmO's side panel is cropped

Status: **Accepted** (2026-10-12). Amends the Decision above for two screens it did not cover.
Trail: [issue 416](https://github.com/AltanS/collie/issues/416) · the side-panel comment on
[issue 412](https://github.com/AltanS/collie/issues/412) · `web/src/lib/harness/pi/panel.ts`,
`ask.ts` (`pickerOnScreen`), `footer.ts` (`keyHintPairs`). Tested live and on captures against
OmO 5.1.30 (Senpi 2026.10.11) and stock pi 0.87.1 and 1.1.0, on Linux under Herdr 0.9.3.

### Pickers

pi's own `/model`, `/tree` and `/resume`, OmO's, and any selector an extension draws in the
editor's place, are dialogs: Chat shows the unread-dialog card with Escape, and the phone does not
type. A picker is told by its key-hint row alone, never by its title, its name or the extension
behind it. The row is painted and is nothing but two or more key/action pairs, joined by the
footers' separators or, as OmO's `/model` prints it, by single spaces with at least one chord or
arrow. In the single-space form a chord or an arrow always starts a pair, so a named key right after
a key is that key's action (`ctrl+d delete`). It stands in the frame at the tail, never in an OmO `❯` editor. A stock editor's rows are
typed text, which pi never paints, so a draft that happens to read like key hints is still a draft.

### The side panel

OmO's fullscreen side panel can run beside the editor and the dialogs, starting at the column where
the editor's rules end. The reader crops every row at that column when a rule runs straight into
text, or when a row of the frame at the tail is padded to that column and then carries text. The
column counts only when it is the run of the tail frame's own bottom rule and the sign is a row of
that frame, so a rule run into text in the agent's output, or a short one in a draft, crops nothing.
A pane without either sign is read as before. Whether Windows ConPTY pads the panel's rows the way
these signs expect is not verified. Nothing read from a cropped screen is bound, because the
bridge matches whole screen rows: a reply goes out as an unbound write and still waits for the
read-back before Enter, and a question there stays raw with the Escape card. Lifting it would need
the bridge to bind to cropped rows, which is a separate decision.

## Amendment, 2026-10-12: a question beside the side panel binds to its columns

Status: **Accepted** (2026-10-12). Amends the side panel paragraph above for questions only.
Trail: `web/src/lib/column-range.ts`, `harness/prompt-model.ts`
(`bindColumns`), `harness/pi/index.ts`, `bridge/prompt-binding.ts`, `bridge/server.ts`
(`expected_columns`). Tested on captures and live against OmO 5.1.30 in the tap rig.

The separate decision is taken, as a field of the shared prompt model and not as a pi case in the
bridge. `PromptModel.bindColumns` names the display columns of each row a grammar read its dialog
from. The phone sends it as the optional body field `expected_columns` beside `expected_prompt`, and
the bridge cuts every row of its fresh read to those columns, escapes kept, before both the text and
the style check. The bridge still holds no grammar: it cuts at two numbers the phone sent. A change
outside the range, such as the panel's clock, does not refuse the tap; a change inside it does.
Without the field nothing changes, and an older bridge that ignores it compares whole rows and
refuses the tap. The pi reader sets it only on a question card read from a cropped view, 0 to the
panel's column. A Submit page beside the panel stays raw, and the editor's bound prompt beside the
panel is still whole rows, so a reply there stays an unbound write.

## Amendment, 2026-10-16: unnumbered rows, and a dialog with nothing under it

Status: **Accepted** (2026-10-16). Amends the shape the Decision reads for two screens it did not
cover. Trail: [issue 455](https://github.com/AltanS/collie/issues/455) · `web/src/lib/harness/pi/ask.ts`
(`statusTailBottom`, `readUnnumbered`), `ASK_NOTES.md` · `pi--v130-gentle-choice*.txt`. Tested on
captures of gentle-pi 4.2.0 on pi 1.3.0 under Herdr 0.9.5, and against pi 1.3.0's selector source.

**Unnumbered rows.** pi's own selector behind `ctx.ui.confirm` and `ctx.ui.select`, and gentle-pi's
`ask_user_choice`, print ` → Label` and `   Label` with no number. The reader takes them at pointer
column 1 only, with one pointer, descriptions one column further in, and gentle-pi's `Other…` as the
free-text row, which stays a field. They lift by the walk alone, since there is no digit to send, so
ADR 0009 holds. Column 0 (`→ name`) is pi's slash palette and its pickers, and stays unread. A tab
strip beside unnumbered rows has no capture and stays raw.

**Nothing under the bottom rule.** An extension can replace pi's footer with an empty one, as Gentle
Shell does, so a live dialog's bottom rule is the last row. The reader now takes a bare bottom rule
under a top rule of the same width and colour. That is byte for byte a dialog quoted in agent prose
that ends the buffer, which the screen cannot tell apart; a shell prompt or any plain row under it
still refuses it. A walked tap on such a quoted block sends arrows and never Enter, because the
pointer never moves and the read-back fails (ADR 0080).

## Amendment, 2026-10-17: a selector title of several rows

Status: **Accepted** (2026-10-17). Amends the unnumbered rows of the 2026-10-16 amendment. Trail:
`web/src/lib/harness/pi/ask.ts` (`unnumberedStart`), `ASK_NOTES.md` · `pi--v0871-permission-gate*.txt`.
Tested on live captures of pi 0.87.1's stock `permission-gate` example under Herdr 0.9.4, and with live
taps through `POST /api/ask/<id>`.

pi's selector draws a title of several rows, and the stock permission gate quotes the command in it
two columns in, the shape of an unpointed option. The list is now the run of option rows that holds
the one pointer, read up from it. A header row indented deeper than one space counts only when the
selector's blank row stands over the list and a row one space in stands between the two. Every other
header row is still blank or one space in, so an option cut off by a blank row, or a label wrapped
back to column 1, still declines. The card's question holds the quoted command.

## Amendment, 2026-10-21: an operator declares the frame their extensions draw

Status: **Proposed** (2026-10-21). Amends the shape the reader takes, for screens whose frame an
extension redraws. Trail: `frames.toml` (docs/configure.md, "Your own editor frame") ·
`web/src/lib/frame-declarations.ts` · `web/src/lib/harness/pi/frames.ts` ·
`web/src/lib/surface/frame-declarations.ts` · `web/src/lib/split-panel.ts` · `pi--v130-frames-*.txt`.
Tested on captures of pi 1.3.0 under Herdr 0.9.5, and live on a two-machine crew.

### Context

pi extensions redraw the editor's frame, and each shape has come in as its own issue: no footer
(445), no status row under a dialog (455), an extension's footer (485), an inset editor (544). A
further common one is the frame of a pi-vim and status-footer setup: a context gauge painted into both
rules in `━`, a mode label at the bottom rule's end (`──── INSERT`), and six indented footer rows with a
widget row and a blank row over them. The reader finds no editor there, so every send needs Type here
and every question shows only the Escape card. A reader that guessed such shapes would also take
them from screens that only look like them, and a constant raised for one setup is raised for all.

A second kind of extension draws no frame of its own but a whole second panel in the same pane: a side
chat (pi-sidebar) below the editor on a narrow pane and beside it on a wide one. Below, its own empty
composer is the lowest box on the screen, so the reader takes it for the agent's: the draft reads empty
and a send is checked against the wrong box. Beside, the panel's rows share every row of the screen, no
row is a full-width rule, and the reader finds no editor. The pane was captured at 46, 120 and 180
columns, with either panel holding the keys (`pi/ASK_NOTES.md`, "A second panel in the pane").

### Decision

The operator declares the shape, and the reader takes it only from that declaration.

- `frames.toml` names, per harness, the limits the reader may move: extra rule glyphs, a label at a
  rule's ends, and the rows under the editor (how many,
  how far in, how many blank). Nothing else moves: the rules keep one width and one colour, the frame
  sits at the tail, and the rows under it are painted.
- With no declaration every limit is the original constant, so the reader is byte for byte the
  reader before this amendment. With the captured declaration every one of the 140 pi and OmO
  captures before this amendment reads as it did (`pi/frames.test.ts`).
- Two more declarations widen what a question may look like, each off by default:
  - `optionGutter`: an option's wrapped rest may stand behind a one-column gutter (` │    rest`).
  - `checkboxTicks` (and `typedAnswer`): a lone checkbox question lifts as a `multi-select` block. Its
    recipe still comes from the footer alone: `1-9 select`, `space toggle`, and a bare `tab` that is
    `done` or `submit` give the `digit` toggle and the declared advance `Tab`, the shape opencode's
    lone question already has. The typed-answer row is never a button, and a ticked one stays raw.
    Without a declaration, "Multi-select stays raw" above holds as it is: pi has no checkbox
    question of its own.
- A declared second panel's divider cuts the screen before any reader looks for the editor
  (`split-panel.ts`). `panelBelow` and `panelBeside` each name the divider's `rule` glyph and its
  `pointers`: a row (a column) of the rule with exactly one pointer in it. The pointer is what makes a
  divider one, since a row of `─` is also the editor's own rule. The reader then reads the rows above
  a `panelBelow` divider, and the columns left of a `panelBeside` one. A screen with no such divider
  is returned as the same rows, so it is read as before.
  - A divider beside the editor is the OmO side panel's case, and takes its handling: the readers
    read the cropped columns, a question binds to them (`bindColumns`), and the editor binds nothing.
  - A divider below it binds nothing either, and a question above it is not lifted: the bridge binds a
    tapped region to the screen's last rows, where the panel stands, so a button could only be refused.
  - The mirror draws the agent's region only. A box dimmed as a whole, which is how an extension marks
    the panel that does not have the keys, is not read as showing a placeholder (a faint draft under a
    faint rule). That reading applies only where a divider is declared.
  - The pointer says which panel has the keys, and the reader does not take it. A send made while the
    other panel has them types there, and the read-back of the agent's box refuses to press Enter.
- The bridge reads the file once at startup and applies it to its own reads: the `pi` surface
  profile (`declareFrames`) and the readers its ask book runs. One bridge mirrors one machine, whose
  extensions draw every box it reads.
- The phone gets it on `/api/config`, and a crew member sends its own in `hello` (`frames`), which the
  lead republishes on `?host=` and never replaces with its own. Absent is "nothing declared". It
  rides `hello` for the reason the mux block does: it changes only when that bridge restarts.

### Consequences

A new extension shape needs a line of config, not a release, as long as it is one of these limits.
A shape outside them (the inset editor of 544) still needs a reader. The surface code still names no
harness: a declaration applies to the profile whose id is its key. A declaration that is wrong for
its screens costs that machine what it cost before, a send that needs Type here, because every check
it does not name still holds. A divider declared for a panel that is not on screen costs nothing: the
screen has none, and is read as it was.
