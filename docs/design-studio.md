# Venue planning studio

## A home for each decision

- **Floor plan:** guest count, dining rows and offsets, furniture movement, dessert location/presentation, power and doorway guides. The rehearsal section contains porch seating and indoor service arrangements.
- **Tables & rentals:** supplier plates, chargers, cutlery, glasses, chairs and fabrics, with custom table flowers, napkins and linens alongside. Applying a product updates the actual scene; saving it only keeps a quote alternative.
- **Lounge & dance:** sofa styles, dance-floor dimensions/materials, their supplier options and bars. Furniture positions are adjusted in Floor plan. The catalog is one shared component, not duplicated selectors.
- **Cocktail patio:** cocktail tables, linen/cover styles, table arrangements, grazing, guest book, welcome drinks and a staffed bar. Entry mirror/card displays also live here.
- **Ceremony:** benches, aisle flowers, pedestals, outdoor arbor and couple’s backdrop.
- **Wedding looks:** coordinated palettes and public-photo inspiration. These are deliberate multi-setting actions; individual changes belong in their area above.
- **View settings:** walls, roof, measurements, graphics quality, lighting and terrain estimates.
- **Saved designs:** six browser-local versions, comparison summaries, JSON interchange, PNG views and a printable planning brief with selected suppliers.

The weekend strip changes the event camera and opens its controls. Camera/movement controls remain beside the render. The former three styling shortcuts are removed. On desktop, drag the divider to resize the inspector, or focus it and use Left/Right (20 px), Shift+Left/Right (40 px), Home/End, and Enter to reset to 440 px. Double-click also resets. Tablet/phone layouts stack vertically. Inspector height is bounded by the outer browser viewport, not the auto-sized embedded document, preventing resize feedback. Tabs support arrows, Home and End following the [WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Consistent locations, visible save status and reversible edits follow [usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/); this is not a formal accessibility certification.

## Supplier colors

Swatches on one rental card are **preview components**, such as plate body and plate rim. They are not buttons or selectable variants. Choose a separately listed product for another supplier color. Custom colors remain available. All supplier illustrations and meshes are schematic; actual samples and the vendor listing are the reference. **Show complete place settings** fills missing plates/cutlery/glasses/napkins without replacing selected products.

## Save, compare and share

Changes autosave locally when browser storage is available. Release query strings do not create a new storage namespace. If no canonical save exists, the current old query-specific save is read first; otherwise the last-created valid legacy entry on the exact same site path is recovered. Legacy entries are retained. Six named snapshots retain model and camera/event state; compare two summaries, load either, or restore the last removed version. A seventh is refused rather than silently overwriting. Undo/redo retains 30 model changes in this session, with Ctrl/Cmd+Z and Shift+Z/Y outside text fields. Camera movement alone does not fill history.

Versions are not cloud accounts and do not synchronize across devices. Download layout JSON for transfer or backup. PNG captures the current view with an estimate label; the planning brief lists counts, selected suppliers and limitations. Sandbox downloads use a private message channel and a fixed filename/MIME allowlist with a 16 MiB limit, avoiding opaque-origin blob navigation failures in Firefox/WebKit. State remains bounded at 128 KiB and contains no image data.

## Photo evidence and accuracy

The public [research report](../src/research.html), generated from `data/venue-research.json` with `node scripts/research-report.mjs`, distinguishes visible evidence, implemented concepts and missing measurements. No Instagram media, account information, private albums or guest details are bundled.

This refinement rechecked both fire-table photos (`DdpLfMuDaPF`), a patio reel frame (`DXaMQuegFNM`), all three banquet/entry-display images (`DYIm0Rvmaw3`) and a central-catwalk photograph (`Dbgazs8E8dJ`). The full ledger retains earlier selected-post research; it does not claim an exhaustive account review.

- The fire island now runs toward the pavilion, off the central route, with a gray counter and recessed lava-rock detail. Its 3.6 × 8.4 ft footprint and exact coordinates remain estimates.
- Cocktail stations reserve a 10 ft center approach and avoid each other/the fire island. Counts report actual placed tables. This algorithm does not certify occupancy, accessibility or service approval.
- A narrow central loft catwalk replaces broad side strips in the house. Black vertical rails, kitchen stools/pendants, cabinet details and a stone hearth reflect public photos. Stair/room connections remain unmeasured.
- **Greenery banquet reception** reconstructs the visible joined rows, overhead greenery and mirror/photo-card displays. Exact table count and unseen entertainment areas remain the current proposal. Absence from a photo crop does not prove there was no dance floor or DJ.
- **Blue-glass garden** (`DaDmZZuDDGm`) borrows visible blue runners/goblets, white florals, farmhouse tables and folding chairs.
- **Samantha & Ryan** (`DX5Ex2xHPo4`) borrows cream arbor draping and mauve/ivory flowers; unphotographed reception settings are coordinated suggestions.
- **Cassidy & Austin** (`DW2F0vlEsh9`) borrows aisle pedestals and couple’s greenery backdrop; unphotographed guest-table counts are suggestions.

Each look retains independent table-only/ceremony actions. Only the look with visible spatial evidence has a **Reconstruct visible setup** action. Others label layout proposals explicitly. The photo ledger identifies the wide photos and measurements needed to reconstruct a complete wedding accurately.

## Rehearsal dinner

Use **Rehearsal dinner** above the viewer. Three illustrative layouts share a geometry planner used by scene, summaries, comparisons and exports: six banquet tables in two 18 ft rows (up to 36 seats), four farmhouse tables (32) or four round café tables (24). The requested 12–40 count is separate from actual seats; shortfalls are shown. Linens, small centerpieces, 2–5 trays and bar/buffet side are configurable. The default remains 35 seats with a center route, buffet and staffed bar inside. Rockers are removed during rehearsal.

Porch overview opens the ceiling; seated and walking views retain it. Furniture, porch dimensions, occupancy and service routes require venue confirmation. Existing house dining seats are not included in rehearsal counts.

## Browser stability and CI evidence

Auto quality caps phones at 1× density without shadows; desktop at 1.5×. Light/Detailed modes remain in View settings. Repeated primitives are instanced; color edits reuse geometry; structural edits rebuild affected decor. Context-loss recovery retains the design. Emulated Firefox/WebKit tests do not prove stability on every physical Android phone.

Build, unit checks and test inventory run concurrently after a cached dependency install. Eight four-CPU shards, two workers each, retain exhaustive control and rental-recipe coverage. Historical timings rebalance runs without skipping tests. Geometry permutations use Light mode; full-resolution studio flows cover real WebGL pixels in Chromium, phone-sized Firefox and WebKit. Tests cover supplier meshes, repeated colors/looks, rehearsal capacity/sightlines, patio equipment, divider keyboard/drag behavior, canonical controls, versions, undo, exports and release-URL persistence.

Studio tests require the real srcdoc canvas to attach before waiting for initialization, avoiding a WebKit about:blank navigation race. This readiness check does not retry or suppress renderer failures. Studio tests retain videos, screenshots and GIF comparisons. Other tests record retry traces/video and failure screenshots. Browser jobs publish a visual gallery, JUnit and Playwright report. The merge gate verifies exact test/project coverage and rejects failures, skips and flaky results before publication. Linux Firefox receives a software-WebGL preflight under Xvfb.

Focused local run: `npm run build && npm run test:browser -- tests/browser/studio.spec.mjs tests/browser/venue.spec.mjs tests/browser/actions.spec.mjs`. Install the pinned browsers with `npx playwright install firefox webkit` if needed.
