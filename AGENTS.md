# Venue website

- `src/model.html` is the editable website model. Build `dist/index.html` with `npm run build`; do not depend on a local Codex installation or edit generated output.
- Keep this repository limited to the static venue planner. Do not add chat histories, guest lists, vendor contracts, insurance documents, credentials or other wedding files.
- Keep all runtime assets bundled. Development dependencies are for building/testing only.
- Preserve existing design choices and model schema migrations. Mark unconfirmed furniture, terrain, power and clearance dimensions as estimates.
- Use `npm test` for source/build checks and browser tests. Keep the pinned Playwright package and CircleCI Docker image versions aligned.
- CircleCI builds/tests and publishes artifacts. Only tested `main` builds may publish to the dedicated `gh-pages` branch. Preserve deployment guards and fast-forward history.
- Never commit deployment credentials. The publisher uses a repository-scoped SSH deploy key stored only in CircleCI project settings; its public fingerprint is pinned in the publish job. Preserve the restricted `wedding-pages` context and main-only publication.
