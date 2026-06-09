# § IV Dependency Map — Redesign Notes & Session Handoff (2026-06-09)

**Read this first to resume.** The Dependency Map module v1 was built (PR #12) and then
**user-tested by Alex**, who found it unintuitive. We started a **redesign brainstorm**
(paradigm + interaction + connectors) that is **partly done**. This doc captures the
state so a new session can continue without re-deriving anything.

## Where the code is
- Branch **`feat/dependency-map`** → **PR #12** (https://github.com/alexnelja/decision-forge/pull/12).
- Worktree: `/Users/alexnelja/projects/decision-forge/.worktrees/dependency-map`.
- Spec: `docs/superpowers/specs/2026-06-09-dependency-map-design.md`; plan:
  `docs/superpowers/plans/2026-06-09-dependency-map.md`.
- All tests green at handoff: core 58, desktop 73 unit, e2e 7/7, `tsc` zero-new (4 pre-existing).

## What v1 already does (built + on PR #12)
Layered DAG (react-flow + dagre) + 3D constellation (react-force-graph-3d, lazy) + pure
graph analysis in `@decision-forge/core` (cycles, roots/leaves, topo layers, reachability,
hubs, communities, MICMAC) + JSON-per-map persistence + capture panel + structure panel.

## Fixes already shipped after the FIRST testing round (committed on PR #12)
`e017166` schema node `position`; `0667b0b` react-flow state model (drag/multi-connect/load
fixed); `75452ce` 3D links visible; `bbaf64f` NodeInspector (edit label/note + delete);
`6a603db` taller canvas + collapsible **capture** sidebar + 3D sized-to-container + direction hint.

## SECOND testing round — Alex's feedback (NOT yet addressed)
Bugs / gaps still open:
1. **Tidy button does nothing** — must actually re-run dagre and snap nodes into ranks (write positions back).
2. **Connectors not editable** — click an edge to select → delete / drag endpoint to re-point / flip.
3. **Add a node directly on the canvas** — double-click empty canvas → new node in edit mode (Miro/Obsidian pattern). Missing today.
4. **All block actions (move/duplicate/delete) should be ON the map**, not only the side inspector — hover toolbar + right-click context menu.
5. **Replace button text with icons** (save/open/new/tidy/layered/3D…), with tooltips.
6. **Show node labels as text in the 3D view** (currently hover-only).
7. **Collapsible CONTENTS nav** — Alex meant the GLOBAL left § I–IV nav sidebar (not the capture panel I collapsed). Auto-hide, reveal on hover, for a bigger canvas.
8. **"I don't understand the outcome / not intuitive"** — the recurring, most important signal. The structural panel isn't a satisfying *decision* outcome.

## Redesign brainstorm — decisions so far
- **Paradigm = A+ (CONFIRMED):** keep the freeform canvas (no wizard), but make the gestures obvious. Research showed the canvas paradigm is fine — react-flow's *tiny connection handles* were the culprit (react-flow's own "Easy Connect" example addresses exactly this).
- **Gesture model to adopt (from Kumu/Miro/FigJam/Obsidian Canvas research):**
  - Double-click empty canvas → new node, instantly in label edit.
  - **Whole node is the connection source** (Easy Connect), not a tiny handle. Body = move, border = connect.
  - **Drag from a node's edge onto empty space → creates a NEW connected node, named on the spot** (the killer gesture; FigJam/Obsidian).
  - Direction = drag direction (source→target = drives→).
  - Double-click node → inline rename; notes stay in the side inspector.
  - Click an edge → re-point endpoint / flip / delete; edge mini-toolbar.
  - Hover mini-toolbar + right-click context menu on nodes/edges: ⧉ duplicate · 🗑 delete; Delete key; marquee multi-select; ⌘D duplicate; Tidy = directed auto-layout.
  - Empty-state hint.
  - Pitfalls to avoid: tiny handles, move-vs-connect ambiguity (reserve body=move/border=connect + cursor change), silent edge unbind (strong snap+highlight), gating gestures behind modifier keys (Kumu's mistake), burying analysis off-canvas.
- **Connectors = ★ RECOMMENDED but NOT yet confirmed by Alex** (the screen was up when localhost dropped): directed base + **optional polarity (+/−) encoded by COLOUR** (+ amplifies / − dampens) + **optional confidence (solid = known / dashed = assumption-uncertain)**. **Defer** thickness=strength and the `‖` delay mark (only when a calc reads them). **Skip** a rich edge-type enum (blocks/enables/…) — it decomposes into polarity + node-type + a label; #1 clutter trap. *RESUME HERE: get Alex to confirm the connector set.*
  - **Polarity unlock:** signs turn existing cycle detection into virtuous/vicious/balancing loop classification (even # of "−" edges → Reinforcing; odd → Balancing). This is the natural core of the Decision Readout.

## Still to design (brainstorm not finished)
- **The OUTCOME** — this is the crux of Alex's confusion. Design the **Decision Readout**:
  the deferred v1.1 (node typing objective/controllable/uncertain + "Act first / Resolve
  next / Plan around" plain-English output) is what makes the module's purpose obvious.
  Alex chose "redesign together first," so this needs a design pass (likely: light node
  typing + on-canvas loop labels (virtuous/vicious) + a readout panel). Earlier Alex chose
  "usability now, readout next" — but the persistent "what's the output?" means the readout
  is probably the missing piece. Confirm with Alex.
- Icon set + tooltips; collapsible global Contents nav; 3D node labels.

## Next-session resume checklist
1. Reopen brainstorm (companion server is stopped; restart with
   `skills/brainstorming/scripts/start-server.sh --project-dir <repo>` if desired).
2. Confirm the **connector set** (★ recommended) with Alex.
3. Design the **OUTCOME / Decision Readout** (the real fix for "what's the output").
4. Pin down icons / collapsible Contents nav / 3D labels / on-canvas add / editable connectors / Tidy fix.
5. Write the **redesign spec** (extend the existing design spec), review, plan, implement on `feat/dependency-map` (PR #12).

## Research artifacts (in this session's transcript / brainstorm screens under .superpowers/)
- 3D-vs-2D operability; comparable tools (Kumu/Obsidian/etc.); dependency-mapping-for-decisions
  (MICMAC/DEMATEL/ISM/SODA/influence-diagrams/Meadows/scenario-planning); Kumu/Miro/FigJam/Obsidian
  **canvas-gesture** patterns; **connector/edge-type** systems (CLD polarity, confidence dashed,
  loop classification). All with source URLs in the transcript.
