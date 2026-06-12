# Changelog

## v2 (2026-06-12)

### Board
- Outer ring reduced from 54 to 36 spaces (6 arcs × 6 spaces each)
- Each arc: `[HQ] — t — t — [ROLL AGAIN] — t — t` (one centered roll-again per segment)
- Roll-again tiles now display a brass loop glyph + "ROLL AGAIN" text decal
- Each team's pawn starts on its matching HQ tile (not the hub)

### Question display
- Question card redesigned as a **large centered modal** (not a bottom sheet)
- Category header tinted with the category's locked color
- Reveal is now **press-and-hold** to peek at the answer; a quick tap (< 200ms) advances to Correct / Missed scoring
- "hold to peek · tap to continue" hint shown below the button

### Timer
- 60-second cosmetic countdown displayed top-right (JetBrains Mono) while a question is active
- Turns red when ≤ 10 seconds remain; stops at 0:00 and resets on the next question

### Setup screen
- Each team row now includes a **color swatch / picker** to customize pawn color
- Default colors match the six category hues; picker opens the native color wheel

### Scoreboard
- Mini filling-pie icons now show **greyed category colors** for unearned wedges (visible placeholders instead of transparent)
- Active team row has a colored left-bar accent using the team's pawn color
- Small line under the active team shows the current space / category name

### Legend
- Collapsible **category legend** added bottom-left (6 rows: color swatch + name)
- Styled with panel/line/ink tokens; toggled with a "Legend ▲/▼" button

### Wedge-earned celebration
- Animated shockwave rings expand from screen center in the category color
- Brief screen shake on the canvas
- Bloom pass strength spikes momentarily for a flash effect
- Skipped entirely when Motion: Off (reduce-motion) is active

### Dice (Option B — constraint)
- Die now confined to the **outer rim tray** (between ring track outer edge r=8.1 and brass rim r=9.0)
- 12-sided inner + outer wall polygon keeps the die out of the tile zone
- Die launches tangentially around the tray instead of across the board — no more clipping through tiles
- Chosen over Option A because it requires zero collision mesh changes to the board geometry

### Quality of life
- **Space bar** rolls the die (when the Roll button is enabled)
- "v2" badge bottom-left in JetBrains Mono

---

## v1 (initial)

- Initial release: 3D board with 54-ring layout, hop-by-hop token animation, dice physics, post-processing (bloom, GTAO, SMAA, vignette), 6-team pass-and-play, question pool from questions.xlsx.
