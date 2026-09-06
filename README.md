# Cricket ScoreCard

An offline Expo SDK 57 cricket scoring app with delivery-derived scorecards and player analytics.

## Development

Use Node.js 22.13 or newer and install dependencies with `npm ci`.

```bash
npm run android
npm start
```

MMKV and Nitro Modules require a native development build; use `npm run android` to build one before starting Metro. Expo Go cannot load these native modules. Local iOS builds require macOS. For a browser preview, run `npm run web`.

## Features

- Match formats, overs, toss, venue, saved teams, configurable squad size, and guest players added during scoring.
- Opening batters and bowler selection, deliveries, extras, dismissal details, injury bowler changes, bowler quotas, and strike rotation.
- Undo within the current over, wicket confirmation, automatic innings completion, chase targets, and match results.
- Separate innings batting and bowling tables, extras, dismissal descriptions, and fantasy player of the match.
- Nine statistics boards, batting/bowling/fantasy rankings, filters and qualifying thresholds, profiles with compressed photos, weighted comparisons, and direct batter-versus-bowler records.
- Android Back returns to the previous app screen; exiting from Home requires confirmation.

Cloud synchronization, Google sign-in, server databases, and advertising remain integration work, as assigned to the owner in the supplied voice notes. The app currently saves locally. Performance at 10,000 full matches and physical-device behavior still require device testing.

## Persistence and migration

Native builds use MMKV. The browser uses localStorage. A write-ahead journal allows interrupted saves to recover; individual matches are stored separately so a delivery does not rewrite every match or player photo.

Existing AsyncStorage records are imported once. The original legacy key is retained as a backup. Old snapshot-only matches remain readable, but are excluded from new delivery-derived analytics because their missing event history cannot be reconstructed reliably.

## Formatting and validation

```bash
npm run format
npm run format:check
npm run lint
npm test
npm run check
```

Prettier uses single quotes, semicolons, two-space indentation, LF line endings, and a 100-character print width. ESLint uses the Expo flat configuration and Prettier compatibility rules. VS Code workspace settings enable formatting on save and explicit ESLint fixes; install the recommended editor extensions.

The test suite covers scoring, strike changes, extras, dismissal validation, undo boundaries, bowling restrictions, direct head-to-head data, fantasy calculations, guest identity, legacy migration, and interrupted storage writes.

## Source layout

- `src/domain.js`: pure scoring and analytics calculations.
- `src/repository.js`, `src/storage.js`, `src/kv.*.js`: persistence and migration.
- `src/AppRoot.js`: navigation, Android Back, and saved app state.
- `src/Setup.js`, `src/Live.js`, `src/Scorecard.js`, `src/Analytics.js`: application screens.
- `src/ui.js`: shared controls and layout.

## Android APK

Run the **Build Android APK** GitHub Actions workflow. It checks formatting, lint, and tests before generating and building the Android project. The resulting `cricket-scorecard-android` artifact contains a standalone release APK. Files matching `builds/*.apk` are ignored by Git.
