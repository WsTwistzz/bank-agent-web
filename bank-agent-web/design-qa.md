# BankSense welcome and login QA

Date: 2026-10-29

## Evidence and scope

- Source welcome image: `C:/Users/Asus/AppData/Local/Temp/codex-clipboard-1e8ddc5a-8801-4f1d-acec-69f8b3ee9b58.png`.
- Source home image: `C:/Users/Asus/AppData/Local/Temp/codex-clipboard-9f101794-c21b-4e97-b88b-cc9f664b1b73.png`.
- Evidence directory: `C:/Users/Asus/.codex/visualizations/2026/10/28/01a18332-c06b-7e61-92c7-fd8f20de0ab1/`.
- Full-view source / implementation comparison: `banksense-welcome-comparison.png`; earlier comparison: `banksense-welcome-comparison-before.png`.
- Focused typography comparison: `banksense-type-comparison.png`.
- Browser captures: `banksense-welcome-mobile.png`, `banksense-login-mobile.png`, `banksense-home-mobile.png`, `banksense-welcome-desktop.png`.
- Presentation artifact: `banksense-preview.png`.
- Reference phone crop: (315, 136)–(917, 1436), 602 × 1300 source pixels, normalized to 390 × 844. Browser mobile capture: 390 × 844 output pixels / CSS viewport. Desktop viewport: 1182 × 1004, phone measured 390 × 844 CSS px. Normalization compares app content and allows existing device chrome differences.
- Additional responsive check: 360 × 740. No horizontal overflow; login submit visible; secondary footer reachable by scrolling. Temporary browser viewport override reset after verification.
- Login has no separate reference: evaluated against the welcome page palette, typography and glass treatments as requested.

## Comparison history

1. Initial comparison: [P2] illustration started too low; headline and investment badge were too small / tightly tracked.
2. Fix: moved illustration upward, aligned the badge position, enlarged badge type, adjusted heading size and letter spacing. New browser capture compared side by side with normalized reference.
3. Final comparison: major content hierarchy, two-line headline, side-by-side bottom buttons, pastel backdrop, investment cards, and brand placement present. SafeBank was intentionally replaced with the new BankSense mark. Existing device status bar / frame retained on desktop, mobile fills the viewport.

## Required fidelity surfaces

- Typography: two-line English headline and Chinese CTAs preserved. Arial / local sans fallback; minor glyph and weight differences from reference remain.
- Spacing: brand, hero, badge, headline and bottom CTA regions checked at matched mobile size; desktop frame remains 390 × 844 when viewport permits.
- Color: pale lavender / cream, black text, thin white glass borders and soft shadows follow the reference. Login uses the same treatment.
- Images: generated transparent financial-card artwork and original B/S monogram installed as real PNG assets. All page images loaded. Illustration is a generative redraw, not a pixel-identical extraction; fine card shapes, logos, curves and tilt differ from the supplied screenshot.
- Copy: welcome headline / badge / Chinese buttons retained; BankSense replaces old visible Aurora branding throughout main and legacy screens. Login labels, validation feedback and demo status are readable.

## Interaction verification

- Welcome → login; welcome → register; register → login; login → welcome.
- Empty / invalid phone rejected; password under six characters rejected.
- Password visibility toggles input type.
- Valid dummy form input enters existing home screen; home shows BankSense.
- Login is explicitly frontend demo behavior. Credentials are neither sent nor saved by application code; no real account is created or authenticated.
- Browser error logs checked: none in tested flow. Existing home still displays backend-unavailable state when backend is absent.

## Follow-up polish / limits

- [P3] Fine illustration geometry, glyph shapes and device chrome differ from source. This is a close recreation, not a pixel-identical duplicate.
- Real authentication and registration require the project's BFF and are outside this visual request.
- Existing project-wide lint warnings were present before changes; no new warnings from the new entry components.

## Implementation checklist

- [x] Welcome / login / registration entry navigation and frontend validation.
- [x] New app icon, favicon, Apple touch icon and manifest icon sizes.
- [x] BankSense brand replacement and preserved original home functionality.
- [x] Browser screenshots, side-by-side visual comparison, responsive check and console inspection.

## Quick actions and four feature pages

- User source: `C:/Users/Asus/AppData/Local/Temp/codex-clipboard-533acf10-8ea6-4ed6-a894-44f9908583ea.png`.
- Home keeps the existing visual system; Quick actions now has four circular links in a 2 × 2 arrangement: wealth, subscriptions, bill analysis and bank cards.
- Added shared glass page, sheet, tabs, focus handling and demo-data provider. Unavailable backend data is explicitly presented as examples; unsupported real writes remain drafts.
- Wealth verified in browser: risk filtering, product details, two-product comparison, six-question assessment (all first choices → R1 / 6 points), and a local ¥100 demonstration order. Holdings/orders and risk results are explicitly local examples; redemption drafts use four-decimal shares.
- Subscriptions verified: service detail, cancellation confirmation, cancelled filter, local reminder controls. Cancelling the gym example changes monthly estimate from ¥256 to ¥57 and yearly estimate from ¥3072 to ¥684.
- Bills verified: October consumption ¥2425, September ¥1959, category filtering, transaction detail and monthly report. Consumption excludes transfers; reports state loaded-data scope.
- Cards verified: invalid daily limit rejected, valid limits saved in example state, temporary freeze changes status, channels toggle, card selection and detail. Backend writes are not attempted by these pages.
- Reviewer found and fixes addressed: independent tab state could break returning home; UTC subscription dates crossed the wrong Shanghai day; legacy lowercase transfers were misclassified. Reviewer recheck: no outstanding P0–P2.
- Earlier feature screenshots: `banksense-wealth.png`, `banksense-subscriptions.png`, `banksense-bills.png`; card screenshot `banksense-cards.png` includes the new capsule navigation. Earlier captures predate final nav restyling; use final home / Agent captures for nav appearance.

## Capsule navigation and Agent identity

- Source: `C:/Users/Asus/AppData/Local/Temp/codex-clipboard-a812052b-d0b4-43a3-8b56-49e96ed0550d.png`.
- Final implementation: `banksense-home-capsule.png`, `banksense-agent-capsule.png`; presentation `banksense-capsule-preview.png`; focused detail `banksense-capsule-detail.png`.
- Side-by-side normalized source/implementation comparison: `banksense-capsule-comparison.png` (reference device footer normalized to 390px wide; implementation footer from 390 × 844 viewport).
- Layout: floating white glass capsule, pale blue selected sub-pill, horizontal icon + name for the active page, icon-only inactive destinations, spring selection animation, bottom home indicator. Existing home / Agent / profile destinations intentionally replace the reference's travel / bell / menu destinations.
- Typography/spacing: compact label with consistent small icons, rounded hit areas, internal 6px inset; all three destinations work via URL hash, browser Back and return-home tested.
- Colors: white/gray frosted surface, muted inactive icons and navy/teal selected state match the app palette and reference direction.
- Assets: original transparent Agent head PNG generated and inspected, 96px display asset installed; used in navigation and Agent header. Main BankSense app icon retained.
- Responsive checks: 390 × 844 and 360 × 640; no horizontal overflow. At 360 × 640 nav stays between y555–614, input above y514, so both remain reachable. Temporary viewport override reset.
- Development module graph needed a restart after several file moves / HMR updates. Vite restored on the original port 5173. After restart, bill detail and navigation retested; no new runtime console errors in recovered flow. Bank/Agent dependency-unavailable states remain expected because those services are not running.

## Final verification

- TypeScript project check: passed.
- Vite production build: passed; existing large-bundle warning remains (881kB JS before gzip).
- Six Node regression tests: passed, covering legacy/canonical transfers, consumption scope, integer cents, Shanghai date boundaries and weekly subscription rounding.
- Scoped lint for new feature/navigation components and integration files: clean. Existing legacy warnings outside this scope were not changed.
- `git diff --check`: clean.
- Read-only review of capsule navigation: no actionable P0–P2.

final result: passed
