# Rental catalog snapshot

Reviewed October 28, 2026, from the public category and product pages linked from:

- [Classic Party Rentals of Virginia inventory](https://classicpartyrentalsva.com/rental-inventory/)
- [Party Perfect rental catalog](https://www.partyperfect.com/party-rentals)

`data/rental-catalog.json` contains 1,485 unique listing URLs (746 Classic and 739 Party Perfect) and 3,508 named product/size options. It stores factual names, source URLs, published unit prices, concise specifications, review status and independently authored schematic preview recipes. Product photos and marketing descriptions are not copied or loaded by the planner. All catalog facts and preview code are bundled in the standalone HTML, including offline downloads.

1,484 detail pages yielded product records. The old Classic Black & Wooden Checkered Dance Floor link did not yield a detail record; its catalog title/link is retained as a reference with no price or 3D preview. There are 1,418 previewable options. Some category pages overlap; listings are deduplicated by vendor/product identity and variants remain separate choices.

## User workflow

Open **Rental catalogs**, filter by company/category, and search by color, fabric, product name or catalog reference ID. Eight cards are shown per page. **Try in the model** applies a schematic recipe and focuses the relevant view. **Save for quote** only stores a reference. Both suppliers can be mixed in one design.

The applied palette identifies the supplier for each current match. Editing a recipe field removes an incorrect match while retaining its quote-list reference. **Keep appearance as custom** removes attribution without changing the appearance. The original generic controls and coordinated looks remain available. Looks retain independently selected chairs, plates, flatware, chargers, table construction and bar finishes; linens and flowers follow the chosen look.

Applied matches and up to 60 quote alternatives persist with existing v9 layouts, local storage, reset/undo and JSON import/export. Older layouts receive an empty rental palette. CSV export includes company, product/option, source URL, unit price, price basis, use in the model, review date and notes. It does not invent quantities or calculate a booking total.

## What the previews mean

- Linens/napkins/runners: approximate fabric appearance and colors; patterns are schematic. Only compatible rectangular linen concepts are previewable on the current rectangular tables. Listed size does not certify the drop/fit. Round/square cloths and skirts can be saved for quotes.
- China: representative dinner plate, simplified shape/rim. Other serving pieces remain catalog references.
- Flatware: representative fork, knife and spoon using the selected pattern/finish. The displayed vendor price is **per piece**, not a whole setting. Pack/rack requirements remain in product notes where stated.
- Glassware: a representative wine glass, colored/ribbed goblet, flute, coupe or tumbler per place. This is not a complete drinks-service order.
- Chargers: schematic metal, glass, wood, rattan or pearl-edged finish. No exact pattern/color guarantee.
- Chairs: pavilion dining chairs only; dimensions are estimated. House furniture and backless ceremony benches remain unchanged.
- Tables: supported rectangular guest tables only. Published title dimensions are used; unlisted widths default to an explicit estimate. Eight seats per table is still a schematic assumption, especially for smaller rental tables.
- Sofas: five Classic models, with published overall width/depth/height. Upholstery/channel details are simplified. The product is applied to all four modeled lounge sofas; the price is per sofa. White-glove delivery is separately quoted.
- Bars: supported straight-bar approximations. Modular curves and other bar pieces can be saved for quotes.
- Dance floors: Classic panel listings retain the chosen overall floor size and label prices per panel. Party Perfect size-specific floor choices within the model's 8–30 ft limits apply those dimensions and label prices per listed floor. Bigger floors remain references. Finish, installation, edging and panel counts still require a vendor quote.
- Tents: supported 10–30 ft catering-tent concepts. Larger tents are retained as references. Models do not establish anchoring, site fit, safety, kitchen suitability or availability.
- Accessories: published mercury-glass votive choices and the Party Perfect wedding arbor have schematic previews. The catalogs did not identify a rentable bud-vase product; existing custom vases and flower controls remain available without invented vendor attribution. Other accessories are saved references.

Prices are the public snapshot, not a quote, and can change. Confirm current inventory, dimensions, samples, rental duration, quantities/packs, taxes, handling, delivery, setup and pickup with the supplier. Source links are available on every card and exported row.

## Maintenance and checks

Update facts and recipes together, retain stable IDs for unchanged options, and preserve each source URL/review status. `src/rentals.mjs` manages filtering, provenance and CSV serialization; `scripts/build.mjs` embeds it and the JSON into the model and checksum manifest.

Unit checks validate every catalog record, recipe, source domain, price basis and production normalization path. Browser tests exercise every previewable option through the actual catalog controls with real WebGL, plus filters, source-link behavior, responsive layout, persistence, custom edits, CSV/JSON export/import and reset/undo. The interior catalog matrix hides exterior context for rasterization; real scene geometry remains available to the finite-geometry audit. Exterior items retain context. Existing general controls, rapid-theme tests and the normal-quality interaction suite also run. Scope remains Chromium/software WebGL, not every browser/GPU or the full Cartesian product of rental combinations.
