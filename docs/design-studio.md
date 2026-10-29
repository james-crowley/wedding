# Table styling and visual validation

## Choosing rentals

Use **Style a table → China & plates / Chargers / Flatware / Glassware**. Component buttons filter to previewable supplier products. Applying a card updates the dining tables and the attributed rental palette; saving alone adds a quote alternative. Existing custom options remain under the advanced custom sections. Product illustrations and geometry are schematic, not supplier photographs. Physical samples and vendor listings remain the reference.

**Show complete place settings** fills only missing plates, cutlery, glasses and napkins; it does not replace selected supplier products. Existing saved designs retain their intentional hidden settings.

## Public photo references

The model adds photo-inspired concepts from public venue Instagram carousels. Each card links its source, states what is visible, and labels unphotographed details and proposed table layouts as suggestions. Borrow table styling, ceremony decor or a proposed layout independently. No Instagram images, account information or private photo links are bundled.

- Blue-glass garden: `DaDmZZuDDGm` — blue runners/goblets, white florals, farmhouse tables and folding chairs.
- Samantha & Ryan: `DX5Ex2xHPo4` — cream draping and mauve/ivory flowers on the timber ceremony arbor; reception table settings are a coordinated suggestion.
- Cassidy & Austin: `DW2F0vlEsh9` — white flower pedestals at the aisle entrance and a greenery backdrop with ivory runner at the couple's table. Guest-table counts/layout are not established by these photographs.

House refinements follow the public room-tour series (`DSx495EE95Q`, `DbLynH7kxcT`, `DbvpJCujfpx`, `DaYpz5dE3HS`, `Da3jC30Phll`) and patio/exterior images (`DdpLfMuDaPF`, `DXaMQuegFNM`, `DW7RJYKlOt-`, `DV9iZ3FEqjG`). These show a long stone fire island, gray porch planks, wood ceiling/fans, black cushioned rockers, dark kitchen counters, shuffleboard and driveway-side chimney. These details do not establish surveyed dimensions. Existing paths, gardens, level transitions and 90×40-foot pavilion orientation are preserved.

## Phone graphics

Automatic quality caps phone rendering at 1× pixel density, disables shadows and reduces forest/stone detail. Desktop caps at 1.5×; Detailed and Light modes are available under View & lighting. Repeated box/cylinder parts and charger plates/rims are instanced. Color changes reuse geometry; structural/style changes rebuild affected decoration. Context-loss recovery preserves the saved design and restores a lighter preview. Browser emulation is not proof of stability on every physical phone.

## CI evidence and speed

- Build, unit tests and browser inventory run concurrently after one cached dependency install.
- Eight browser shards retain exhaustive control and rental-recipe coverage. Validated historical timings rebalance later runs; timing history never skips tests.
- Geometry permutations use supported Light mode. Full-resolution studio tests cover Chromium, mobile-sized Firefox and iPhone-sized WebKit with actual WebGL rendering and repeated style changes.
- Studio tests keep successful videos, screenshots and animated GIF comparisons. Other tests record video/trace on retry and screenshots on failure, keeping routine matrix overhead lower.
- Each browser job publishes `test-results/visual-gallery.html`, raw media, JUnit and a Playwright report. The merge job verifies exact test/project coverage before deployment. No failed, skipped or flaky results authorize publication.

Local focused run: `npm run build && npm run test:browser -- tests/browser/studio.spec.mjs tests/browser/recovery.spec.mjs`. Install the pinned Firefox/WebKit engines with `npx playwright install firefox webkit` if needed.
