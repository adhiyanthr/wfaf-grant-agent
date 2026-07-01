# GrantEquity — frontend notes

Free weekly AI grant-discovery email digest for small NJ nonprofits. No login, no
dashboard, no paid tier — all value is delivered via a Monday email.

## Structure
- **`index.html`** — the entire frontend. Single static page, no framework, no build
  step. Hand-written CSS design tokens (`:root` custom properties), Inter (body) +
  Fraunces (display). **1080px shell** (`--maxw`) with asymmetric two-column layouts;
  text measure kept readable via `--measure` and the narrower grid columns. Sections:
  header bar → hero (copy left / email mockup right) → problem → how it works →
  why it's free → pre-CTA band → intake form (intro left / form right) → footer.
  Layout primitives: `.split` (heading-left `.split__head` + content-right
  `.split__body`; head is `position: sticky` ≥860px), `.hero__grid`, `.footer__grid`.
  Two-column layouts collapse to single column below the 860px breakpoint.
- **`migration.sql`** — columns the intake insert writes to the `organizations` table.
- **`organizations_rls.sql`** — anon INSERT-only RLS policy + unique(email) constraint.
- `index.html.bak.*` — timestamped backups created before edits.

## Do NOT touch
- The Supabase submission logic (anon key, `insert([payload])`, 23505 duplicate
  handling, RLS). UI/copy only. The payload maps all 9 form fields → `organizations`.
- Existing routes (single page) / Vercel config (lives in the dashboard, not the repo).
- No new npm dependencies without flagging first. Only external dep is the Supabase
  JS client via CDN.

## Copy constraints (non-negotiable)
- "Free forever, no login, no paywall" must stay reinforced.
- Scope is **nationwide (all 50 US states)** as of 2026-06-29 (was NJ-only before).
  Do not reintroduce NJ-specific copy, county lists, or geography. The intake form
  collects `state` (50-state dropdown) + `county` (free-text).
- Owner's name/age/school never appears. "student"/"student-built" must not appear
  (triggers longevity doubt).
- **No funding claims.** No Hack Club Bank / HCB, no Anthropic API credits, no
  donations, no fiscal sponsorship — none exist yet (redesign is pre-HCB-submission).
  "Why it's free" is framed via mission + low automated-search cost instead.
- Project email is **grants@grantequity.org** (used in footer, form error, and both
  success states). `hello@` was removed.
- If a donate/support section is ever added, link to the Hack Club Bank page, never
  a Stripe form. (None present today.)

## Changes made (2026-06-28)
**Tier 1 — Trust & Conversion**
- Removed all "student-built" longevity signals (meta, funding section, footer).
- Reframed "Why it's free" with no funding-source claims (mission + low cost).
- Consolidated all contact to grants@grantequity.org; surfaced it in success states.
- Form kept at 9 fields (owner's call) — submission logic untouched.

**Tier 2 — Product Demo** — deferred: no real stats yet (no counters/placeholders
added per owner). Email mockup date already correct.

**Tier 3 — Visual Identity** — already aligns with refs (Buttondown/Ghost): single
teal accent, no hero gradient, one display + one body font. No churn needed.

**Tier 4 — Perf / A11y / Polish**
- Contrast: `--ink-3` darkened `#8a96a3` → `#626d79` (WCAG AA on white & bg-soft).
- Added visible `:focus-visible` rings to all interactive elements + a skip link.
- Removed `novalidate` so required fields are natively validated.
- Focus-areas group → semantic `<fieldset>/<legend>`.
- Wired the previously-dead `#focus-error` element (inline error + scroll-into-view).
- Added self-contained SVG favicon (data URI), `og:url`, `twitter:card`.

## Layout refactor (2026-06-29)
Fixed "everything centered in a narrow middle ribbon" — the whole page used one 680px
centered `.wrap`, leaving big dead margins on desktop.
- Widened shell to 1080px; introduced asymmetric two-column layouts that anchor content
  left and use the horizontal axis (see Structure above for the primitives).
- Added a header bar (brand left / sign-up right).
- Hero is now copy-left / email-mockup-right (product demo moved into the hero).
- Prose sections use the editorial `.split` (heading left / body right).
- Pre-CTA is a single soft-gray band (text left / button right); "Why it's free" set
  back to white so two gray bands don't sit adjacent.
- Form is intro-left (sticky) / form-right. Footer is brand-left / contact-right.
- All collapse to single column < 860px (verified on mobile). Submission logic, copy,
  and the Tier-1–4 work above all preserved.

**Deferred (owner, beta phase):** testimonials/social proof (need real
quotes — do not fabricate for named beta testers), CAN-SPAM physical postal address.

## HCB-readiness pass (2026-06-29)
Page is being prepped for Hack Club Bank fiscal-sponsorship review (mission +
credibility + honest traction + scalable vision). Page copy still makes NO funding/HCB
claims — HCB is the audience, not a claim on the page.
- **Hero:** headline → "NJ nonprofits miss grants they qualify for. We fix that.";
  body rewritten to "search foundation pages, county programs, and state portals…".
  h1 `letter-spacing:-0.02em`, `max-width:18ch`.
- **Mission section** (new, `.mission`): narrow centered serif statement, hairline
  rules above/below, ~80–120px vertical padding. Inserted after hero, before stat.
- **Honest stat band** (new, `.statband`/`.stat`): "5,700+ nonprofits in NJ under
  $50K budget" — teal serif number (`clamp`), 13px uppercase label, 12px sub. Warm
  gray (#f7f5f2). Replaces the deferred fake-counter idea with a real, sourced figure.
  **No testimonial:** brief's two-column pilot block intentionally omitted (no real
  quote yet) — used the documented fallback of the stat block at full width.
- **How it works** → three bordered step cards (`.stepcards`/`.stepcard`), large
  light teal serif numeral (aria-hidden), 1px border, 24px pad, rounded; 3-col ≥768px.
  Section uses `.section-head` (heading on top) instead of `.split`.
- **Why it's free** → single centered `.centerblock` (max 640px), rules above/below.
- **Pre-CTA** copy → "Built to run at scale. Free for every NJ nonprofit, permanently."
- **Form submit button** → "Get my weekly grants →" (logic untouched).
- **Footer:** added full-width identity line "GrantEquity is an independent nonprofit
  infrastructure project based in New Jersey." (`.footer__identity`, hairline above).
- **Email mockup animation** (`.email__sec`/`.grant`): card fades+slides in (400ms,
  100ms delay), then section labels + grant rows stagger in via per-child
  `transition-delay` on `.email__body > :nth-child(n)`; `prefers-reduced-motion`
  forces all visible. No libraries added.
- **Lora note:** brief asked for Lora (mission/testimonial) but also "no CDN imports";
  resolved by using the existing Fraunces serif for those serif moments.
- Verified desktop in Chrome (hero, mission, stat, problem, cards, why-free, pre-CTA,
  form, footer all correct + animation plays). Live phone-width capture blocked by a
  ~1500px window minimum this session; responsive verified by CSS inspection — all
  multi-col layouts are mobile-first (single col by default, columns only at min-width
  768/720/860px). Backup: `index.html.bak.hcb.*`.

## Spacing + content pass (2026-06-29, follow-up)
- **Whitespace fix:** vertical rhythm moved from `vh` to `vw`-driven
  (`--section-y: clamp(44px,5.5vw,76px)`) so spacing doesn't balloon on tall windows;
  hero copy now `align-items:start` at ≥860px (+ small `.hero__copy` top pad) so the
  headline no longer floats in a top void against the tall email mockup; mission pad
  trimmed to clamp(56,6.5vw,88); footer to clamp(40,5.5vw,68).
- **Demo recipient → food org (coherence):** email mockup now addressed to
  "Bellhaven Community Kitchen · Passaic County, NJ" (fictional town, no real org can
  claim it). Sample grants reworked from environmental → food-security funders so the
  demo matches a food kitchen (illustrative only — swap for real matched grants).
  Form placeholders updated to food-org examples (Clearwater Neighbors Fund, etc.).
- **Stat + pre-CTA bands redesigned** (were flagged as disruptive voids): stat is now a
  compact horizontal figure (`.stat` flex: big number + `.stat__text` block, centered
  as one unit, stacks <680px); pre-CTA is a tight centered text+button group
  (`.precta__inner` flex column, max 600px) instead of text/button flung to opposite
  edges. Both now match the centered "moment" language of mission / why-it's-free.

## Design critique pass — Tier 1 + 2 (2026-06-29)
From a frontend-design read-through. Plan: `~/.claude/plans/do-a-full-read-deep-lecun.md`.
Verdict was "well-executed but category-safe"; fixes tighten consistency and lean into the
deadline/urgency mechanic as the signature. Backup: `index.html.bak.designpass.*`.
- **One tint token:** unified the two clashing grays (`#f6f7f9` cool + `#f7f5f2` warm) into
  a single warm `--bg-soft: #f5f5f2`, used by `.statband` + `.precta`.
- **One separator system:** only centered "moment" sections carry a divider (mission/
  why-free = hairline borders; stat/pre-CTA = tint bg). Removed the orphan `<hr>` that was
  the page's lone hairline (was between problem → how-it-works).
- **Email mockup = authentic email, not an app window:** removed the `.email__chrome`
  traffic-light dots + "INBOX" bar. Added `role="img"` + aria-label so screen readers
  announce it as one example instead of reading the sample grant data as real content.
- **Deadline = signature motif:** inline teal clock SVG (`.sec-icon`) on the email's
  "Closing soon" label and reused once in the hero `.cta-note`; `.grant__pill` got a
  1px border for crispness. Single-accent (teal) preserved — no new colors.
- **Fraunces optical-size axis:** `font-variation-settings:'opsz' 144` on `.hero h1` and
  `.stat__num` for a high-contrast display cut (more character; section h2s stay default).
- **Stat text px → rem** (`.stat__label/__sub/__source`) for user-font-size scaling.
- **Copy:** pre-CTA reworded off VC register → "Free for every NJ nonprofit — and built to
  keep running, every Monday." `<title>`/`og:*` synced to the "miss grants they qualify
  for" positioning.
- Deferred (Tier 3): differentiate the two editorial splits; "how it works" as a connected
  weekly timeline. Contrast of `--ink-3` on `#f5f5f2` verified ≈4.82:1 (passes AA).

## Stat fold-in + pre-CTA removal (2026-06-29)
- **Deleted the standalone pre-CTA section** ("Free for every NJ nonprofit…" + button) and
  its CSS. Page flow is now hero → mission → problem → how it works → why-free → form →
  footer (6 `<section>`s). No mid-page CTA band; header + hero + form carry the CTA.
- **Folded the 5,700+ stat into The Problem section** as a lead figure (`.figure-stat`,
  scoped under `.prose`): big teal Fraunces `opsz 144` number, descriptive sentence,
  "Source: Rutgers, 2025", then the existing explanatory paragraphs. Removed the
  standalone `.statband`/`.stat` section + CSS. The stat now reads as part of the problem
  narrative instead of a floating band. (`--bg-soft` token now unused by sections — left
  in place; no tinted bands remain, only mission/why-free hairline-bordered moments.)
