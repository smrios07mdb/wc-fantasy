# DESIGN QA — Club Identity System, turns 1–10 vs Handoff Spec v4

**Date:** 2026-07-07 · **Inputs (read-only):** `Club Identity System.dc.html` (turns 1–10, template + logic + seed registry), `Handoff Spec.dc.html` (v4, synced to canvas t10).
**Rule:** report only — no canvas or spec edits made by this audit.
**Severity key:** **drift** = mock deviates from a spec clause · **inconsistency** = mocks contradict each other (or a mock contradicts its own annotation) · **spec-gap** = mock shows behavior no spec clause governs.

> **Chapter-11 status banner:** Chapter 11 (11a–11c) has since been received; its status is **PROPOSAL, unratified**. Where it already proposes a resolution to a finding below, that proposal is recorded on a separate **PROPOSED:** line and is **not** an audit verdict — adjudication belongs to the gated ratification pass (Sergio's DEC-0 calls). All such items remain **OPEN**; see CHAPTER-11 STATUS at the end.

Method note: sizes/colors were read from the source (inline styles + the `Component` logic), not from screenshots. The registry ships crests for MER · NOR · AVA · PVO · ATN · KRY · FER · OST; **CAD · LUM · COR · HEL** (+ all 24 stubs) are `crestUrl:null` and monogram at every size. Findings distinguish default state vs `crestOutage` tweak state. Audit scope is turns 1–10 as read at audit time; chapter 11 content was not audited.

---

## 1 · Crest/kit sizes vs §8 responsive table + §1 tokens

**Verified clean** against §8, size-by-size: draft picks 16 / feed 20 (2a·4b) · pool row 24, fixture 14 (5b) · waivers 24, opp 12 mobile / 14 desktop (2b) · lineup kit 40, opp 12 (1c) · box-score kits 22 + ribbon 14 (1c) · quiniela 24/20 + slip 14 (6a) · module 18 (6b) · full box score header 40+plinth (53px = 1.33×40 ✓), events exactly 16, kits 22 (6c) · card hero 24/20, badge 18, log 18, NEXT 14 (9a) · players page 24/20, opp 14, 48px mobile rows (9b/10d) · composer 24, queue 20, sheet header 18, 44px touch targets (10a) · compare 24 both sides (10c) · filter chips 16 / sheet rows 24 in 44px rows (1e/3a/4c) · avatar badges 16@32-class, 18@40 (1g/2a) · manager knockout: discs only (8a–8c).

| ID | Surface | Turn | Spec clause | Severity | Finding |
|----|---------|------|-------------|----------|---------|
| SZ-1 | Draft squad-rail avatar | 2a | §7 `PlayerAvatar size={32\|40}`; §8 "16 @ 32 disc" | drift (minor) | Rail avatars are **30px** discs (badge 16 ✓). 30 is not a §7 size; 1g's own ramp uses 32/40. |
| SZ-2 | Two-legged tie header | 2c | §8 match header "44 mobile / 48 desktop"; §1 "40 rides the plinth (6c)" | drift (minor) | KO game header crests at **40px bare**. 40 is inside §1's 40–48 range but the token note ties 40 to the 6c plinth case; §8's generic match-header row says 44/48. (6c at 40+plinth is explicitly sanctioned — clean.) |
| SZ-3 | Kit-clash strip | 3c vs 6c | §1 kit.size scale (16/22/32/44/56/96) | inconsistency + spec-gap | The same clash visualization renders kits at **48px in 3c** and **44px in 6c**. 48 is not on the token scale at all; 44 is "pitch mobile" used on a desktop surface. No §8 row governs the clash strip. |

---

## 2 · Floor behavior (§2/§4) — sub-16 monograms, ≥16 may render asset

**PASS on rendered output — no violations found.** Every sub-16 slot monograms: lineup opp 12 (1c), waiver opp 12/14 (2b), ribbon chips 14 (1c), slip chips 14 (6a — monogram even though MER/NOR/OST have crests, per the "ALWAYS" rule), pool/players fixture slots 14 (5b/9b/9c/10d), NEXT chip 14 (9a), ramp 12/14 (3b). Every ≥16 slot legally renders assets where licensed; 6c events sit at exactly 16 (floor edge, legal); nothing renders below 12 (dev-assert floor).

| ID | Surface | Turn | Spec clause | Severity | Finding |
|----|---------|------|-------------|----------|---------|
| FL-1 | Turns 1–5 logic | 1d–5b | §2 "sizePx is REQUIRED — the crest floor lives in the resolver, not call sites" | drift (code-shape, low) | The t1–t5 surfaces resolve through a **size-blind `resolve(clubId)`**; the floor holds only because opp slots hand-null the crest (`oppCrestSrc:null`) in data. t6+ use the size-aware `ident/idAt/clubAt(id, sizePx)` chain. Rendered output complies, but the older mocks model the pre-v2 contract; 2b's templates still carry sub-16 `<img>` branches that never fire. |

---

## 3 · Chrome discipline — cobalt, amber→slate, --live/--success/--slate shapes

**Verified clean:** AS-OF tag re-toned slate (1g, 9a) ✓ · zone dividers cobalt top-8 / slate 9–24, `rgba(255,255,255,.25)` exact, "NOT amber" held (1f, 2c, 8c) ✓ · LIVE red pills on 6b/8a/8b ✓ · SYNCED green 2a ✓ · picks/selection/Apply cobalt-only (6a, 1e/3a/4c) ✓ · result chips WON green / LOST slate / INVALID red, never club-tinted (10b, §9.1) ✓ · club color never paints chrome anywhere (the §10 structural rule holds for **club** identity).

| ID | Surface | Turn | Spec clause | Severity | Finding |
|----|---------|------|-------------|----------|---------|
| CH-1 | Draft mobile header | 4b | §1 `--live #E5484D live · loss`; `--success … synced` | **drift** | The mid-draft state chip is **"LIVE" in --success green** (green dot + green pill). Live-state chrome is pinned red; 2a's equivalent uses SYNCED green correctly, and 6b/8a/8b use red LIVE. One surface paints a live state with the success token. |
| CH-2 | "You" manager disc | 2a, 4b, 8a, 8b, 8c, 10b | §6.2 "initials disc (slate #2A3140 / #B9C0D0)"; §1 --interactive reserved for interactive · selection · links | **drift** | Your own manager disc is painted **cobalt #4D8DFF/#FFF** on six surfaces (draft rail + strip, both knockout formats, seeding table, blind-bid panel). §6.2 as written pins the disc slate with no "you" exception; cobalt fill on an identity disc is outside the reserved-chrome shape list (ring/pill/bar/divider). §7.1 sanctions cobalt *chips* for the you-relationship, not the disc fill. **PROPOSED (ch.11, unratified):** treat the self disc as a **selection state** — cobalt sanctioned via a §6.2 amendment. OPEN. |
| CH-3 | Fantasy-value accents | 1c, 6c, 8a, 9a, 10a, 10b | §1 --interactive = "interactive · selection · links" | spec-gap | Cobalt is used pervasively as a **non-interactive data accent**: `+12 fpts`, AGG totals, queue priority numbers, "3 OF 6 PICKED", draft timer, "VISIBLE TO YOU". A de facto fifth chrome role ("fantasy value") that no clause defines. |
| CH-4 | Composer warnings | 10a | §9.1 "the bar warns (amber), never blocks"; §1 has no warning token | spec-gap | Two amber in-app warnings: the soft-hold budget warning (sanctioned by §9.1) and the **drop double-name warning** ("J. PRIEM IS ALSO NAMED IN QUEUE #1") — the latter has no covering clause. Amber is otherwise banned as app chrome by the rail re-pin; §1 defines no warning token. All other ambers on-canvas are DEC-0/HOLD annotations (allowed). |
| CH-5 | Position pill palette | all player surfaces; sharpest on 10b | §1 chrome.reserved; §10 "chrome colors appear only on ring/pill/bar/divider" | spec-gap | Position colors **share exact hexes with reserved chrome**: MID pill `#2EC27E` ≡ --success, GK pill `#8B93A7` ≡ --locked (FWD `#F5647E` is near --live). §7 sanctions "position color" on avatar discs but nothing governs the collision. Visible worst case: **10b WON card renders a green WON·CLEARED pill directly beside a green MID pill** — identical shape class, identical hue, different semantics. Same pairing wherever SYNCED/LIVE-green chrome meets MID pills (2a, 4b). Flagged for the §10/§11 token-land review. |
| CH-6 | Cut ladder block rows | 8b | §10 ring/pill/bar/divider only | drift (minor) | ON-THE-BLOCK rows use a **--live red row-fill tint** (`rgba(229,72,77,.06)`) plus the red headline banner background — row/banner fills are not on the allowed shape list. (The blade **line** is a divider ✓; 4b's cobalt row tint is selection, allowed.) |

---

## 4 · The two near-blacks — #0A0D12 pin vs #0A0D14 mock floor

| ID | Surface | Turn | Spec clause | Severity | Finding |
|----|---------|------|-------------|----------|---------|
| NB-1 | Every plinth/sink mock | 3c, 6c (+ all mock cards) | §1 `surface.base: #0A0D12` pin — "sink check runs against THIS token, NOT the #0A0D14 radial floor the canvas mocks happen to sit on" | drift (documented) | All mock surfaces — including both plinth demos (3c bare/plinth/20-row; 6c 53px header roundel + 26px lineup head) — sit on **#0A0D14** cards. **No mock anywhere renders on the pinned #0A0D12**; the pin exists only as spec text, the 5a token readout, and the Tweaks default. Canvas 3c/5a annotate the discrepancy correctly — known, documented drift — but the plinth threshold (edge-luminance < .16) has not been *visually* validated against the actual token. |
| NB-2 | Canvas page floor | all | — | note | The canvas body is a third near-black, `#07090D` (and the 4c phone frame uses it as an app background). Canvas chrome only — but the mocks' perceived contrast is computed against three different blacks, none of them the pin. |
| NB-3 | 6c event chips | 6c | §4 plinth = base-surface rule | pass | The 16px event crests sit on `#12161F` chip backgrounds; 6c's annotation correctly exempts them from the sink check. Consistent with spec. |

---

## 5 · Monogram-disc residual — red/green disc beside red/green state pill (§10 known residual)

The registry makes this concrete: red monogram = **MER #D22730** (crest exists → disc only under the 14px floor or outage); green monogram = **ATN #0E7C4A** (same). Stub reds/greens (ROV, JUN, TAR, AVL…) appear only inside the 36-club filter, where no state pills exist — clear.

**Live adjacencies found (default state):**

| ID | Surface | Turn | Adjacency | State |
|----|---------|------|-----------|-------|
| MD-1 | /players desktop row — P. Villanueva | 9b | Red **OUT pill** (player cell) directly beside the **14px red MER monogram disc** (NEXT-fixture cell, floor-forced even though MER owns a crest) | **default, always visible** |
| MD-2 | 9c state demo, row 4 (UNAVAILABLE) | 9c | Same pairing: OUT·INJURED red pill + 14px red MER disc, one row | **default, always visible** |
| MD-3 | /players hardening list | 10d | Same Villanueva row (surfaces on page 3 of the pagination) | default |
| MD-4 | Waivers rows + 5b pool — Villanueva | 2b, 5b | 12–14px red MER opp disc beside the **FWD pill `#F5647E`** (near-live pink-red, not a state pill — the CH-5 palette collision compounding the residual) | default |

**Outage-state adjacencies (`crestOutage` on):**

| ID | Surface | Turn | Adjacency |
|----|---------|------|-----------|
| MD-5 | Player card hero | 9a | 24/20px green ATN monogram beside the green MID pill (`#2EC27E` ≡ --success), desktop + mobile |
| MD-6 | /players Reinholt row | 9b | Green MID pill (POS column) immediately beside 24px green ATN disc (crest column) |
| MD-7 | Compare A-side | 10c | Same pill+disc pairing in the header line |

**Intentional demo (not a violation):** 4a's near-miss audit deliberately stages MER-crest+LIVE and ATN-crest+SYNCED pairs (annotation surface; hardcoded `<img>`, stays a crest even under outage).
**Checked and clear:** 6b live row (NOR/COR are near-black monograms), 8b block rows (manager slate discs), 6a slip chips (red ME disc beside cobalt values only), 10b result cards (AV disc is purple).

Spec's §10 residual note names the risk only in the abstract; MD-1/-2 are the **shipping** examples. **PROPOSED (ch.11, unratified):** a new standing rule — **non-color signal on every color state** — which would change how these adjacencies are disambiguated. OPEN.

---

## 6 · Manager fence (§6.2) — no crest/kit/parrot on any manager avatar

**PASS everywhere.** Audited every manager render: draft rail + column headers (2a), mobile strip + feed byline (4b), bracket nodes, drill-in tabs + panel header (8a), cut ladder + the fallen (8b), seeding table (8c), owned-by-another blocks and cells (9a, 9b, 9c, 10d), composer/queue (10a — no bidder identity beyond you), blind-bid panel + result cards incl. the winner reveal "Gunners FC" (10b). All are initials discs; zero club artwork on managers; the only crests on knockout/waiver surfaces belong to players' clubs in the 8a drill-in (18px, correctly through the chain) and claimed players (24/20).

| ID | Surface | Turn | Spec clause | Severity | Finding |
|----|---------|------|-------------|----------|---------|
| MF-1 | (cross-ref) | — | §6.2 disc colors | — | The one fence-adjacent deviation is CH-2: "You" discs painted cobalt instead of slate. Identity type is correct (initials disc); the fill drifts. See CH-2 PROPOSED line. |
| MF-2 | Seed tags | 8c, 8a panel | §6.2 seed tag example "S3" | nitpick | Canvas renders "SEED 1"…"SEED 8" / "SEED 3"; spec's stated format is compressed "S3". Formats differ; unadjudicated. |

---

## 7 · Monogram-fallback consistency — COR/HEL/CAD + registry stubs across surfaces

The resolver logic (bg = `colors.primary`, computed fg, ring at ≥16, registry-driven) is shared and mostly consistent. Four systematic breaks:

| ID | Surface | Turn | Spec clause | Severity | Finding |
|----|---------|------|-------------|----------|---------|
| MG-1 | Character-count rule | many | §4 "text short (**3 chars ≥20px, 2 chars <20px**)" | **drift + inconsistency** | The 20px boundary is inverted and the 24px tier is split: **at 20px every slot renders 2 chars** (4b feed, 1d mobile, 6a mobile, 9a mobile hero, 9b mobile + sheet, 10a queue, 6c lineup head "CO") — spec says 3. **At 24px** rows render 3 chars (1d/2b/5b/9b/10d) but the **4c sheet rows, 10a composer, and 10c compare render 2** — so S. Marchetti's club is "HEL" at 24px on /players and **"HE" at 24px in the waiver composer**, same size, same club, adjacent chapters. **At 18px** badges split: 1g + 9a hero badges render 3 chars ("HEL", "ATN" — spec says 2 below 20), while the 9a match-log, 10a sheet badge, and AS-OF badge correctly render 2. One rule, three behaviors — the resolver exposes `short` and a fixed 2-char `mono2` and call sites choose freely. **PROPOSED (ch.11, unratified):** settle via a spec-vs-canvas erratum. OPEN. |
| MG-2 | mono.ring on sub-16 discs | 1c, 2b, 3b, 5b, 6a, 9a–10d | §4 monogram roundel includes `mono.ring`; the ring is the stated reason monograms skip the plinth | drift | **Sub-16 monograms consistently omit the inset ring** (opp slots, slip chips, NEXT chip, ramps); ≥16 monograms have it. §4 does not state a size cutoff for the ring — the plinth-exemption rationale currently assumes the ring exists at all sizes. |
| MG-3 | 10b WON card AV disc | 10b | §2 monogram = `colors.primary`; registry `avt` = `#6D28D9` | inconsistency | The WON result card hardcodes the Avanti disc as **#6C3FD8** (≠ registry #6D28D9) and omits mono.ring — the only monogram on the canvas that bypasses the registry. (1d's hardcoded AV ramp uses the correct hex.) Also: result-card anatomy is inconsistent about the claimed player's club identity — WON shows it, LOST and INVALID don't, while 10b's own footnote says club identity on a result card is "the player's crest/monogram only." |
| MG-4 | Auto-contrast metric | all monograms | §2/§4 "auto-contrast text (**relative luminance** > .55 → #10141C, else #FFFFFF)" | **drift (build-affecting)** | The canvas computes text color from **non-linearized luma** (`0.2126r+0.7152g+0.0722b` on raw sRGB), not relative luminance. Verdicts flip for mid-bright saturated primaries: at least **KRY #29B6D8, LUM #6CACE4, HEL #F2B705, SOL #D08C1D** render dark text in the mocks where the spec formula yields white. Spec formula and mock implementation disagree; a to-spec build silently changes shipped monograms. **PROPOSED (ch.11, unratified):** settle metric/threshold via a spec-vs-canvas erratum. OPEN. |
| MG-5 | 40px monogram type ratio | 6c | §4 "font 700, ~size×0.34" | nitpick | COR at 40px uses 11px type (0.275×) — every other size tracks ~0.33–0.37. |
| MG-6 | 6a caption vs render | 6a | canvas self-consistency (§9 row 6) | inconsistency (annotation) | Caption claims "**ATN–SOL and CAD–LUM ship as monograms** mid-licensing" — but ATN has `crest:true` and renders a crest at 24/20px; only SOL monograms in that fixture. CAD–LUM is correct. |

---

## 8 · §7.1 statline separation — provider facts vs scoring breakdown (9a)

**PASS on the breakdown layer:** groups keyed §1–§8, dashed **engine-label slots** (no category names in UI copy — P52 dependency honored), signed values verbatim, zero → em-dash slate ✓, negative → functional red ✓, line-item anatomy engine-sourced, MD totals reconcile to the 5b season 74 with MD4 = +24 ceiling-band sample ✓. The two layers never share a container.

| ID | Surface | Turn | Spec clause | Severity | Finding |
|----|---------|------|-------------|----------|---------|
| ST-1 | "FULL SEASON LINE" strip | 9a (desktop + mobile) | §7.1 Rule 1: provider facts = "minutes · starts · goals · assists · cards"; derived values "COMPUTE at render … **never asserted as facts**" | **drift** | The strip is headed **"PROVIDER FACTS — DISPLAY-ONLY, NEVER POINTS MATH"** yet its last two tiles are **PTS/90** and **FORM·L5 (AVG FPTS)** — engine-points-derived values computed from `mdTotals`. Computation-at-render is honored (never stored ✓, tile subs say COMPUTED/AVG FPTS ✓), but the layer header asserts them as provider facts — the presentation Rule 1 bans. (GOALS/90 + ASSISTS/90 subs are provider-derived and unaffected.) |
| ST-2 | Compare grid | 10c | §7.1 (by extension); 10c's own "facts + totals only" rule | spec-gap (low) | The compare interleaves computed rows (AVG/MD, PTS/90) with provider rows (MINUTES, GOALS…) in one undifferentiated grid. No breakdown mixing (✓ deliberately deferred), but nothing marks which rows are vendor facts vs computed — Rule 1's layer-separation scope beyond the player card is undefined. |

---

## Summary

- **28 findings**: 10 drift · 6 inconsistency · 6 spec-gap · 3 nitpick/note · plus explicit PASS confirmations on the §8 size table, floor behavior, the manager fence, and the breakdown layer.
- **Findings most likely to affect a to-spec build:** MG-4 (contrast metric — silently changes shipped monograms), MG-1 (char-count rule — one resolver output, three behaviors), CH-2 ("you" disc vs §6.2 as written), ST-1 (provider-facts header), CH-1 (green LIVE pill).
- **Token-land review inputs (§10/§11 HOLD):** CH-3 (cobalt-as-value accent), CH-4 (warning amber), CH-5 (position palette ≡ chrome hexes), MD-1/-2 (shipping monogram-disc adjacencies), NB-1 (no render exists on the real #0A0D12).
- Adjudication of every item above is deferred to the gated pass; PROPOSED lines record chapter-11 proposals only.

---

## CHAPTER-11 STATUS — decisions chapter 11 presumes, all unratified

- /playoffs retirement + /vsfield hosting (R1 IA): **OPEN**
- Football-backdrop surfaces (competition-model gate, incl. F-P3-B2 matchday presence): **OPEN**
- Football aggregate on bracket nodes (§11 currently bans it): **OPEN**
- Non-color-signal standing rule (new; touches MD-1…MD-7 / CH-5 disambiguation): **OPEN**
- Self-disc cobalt exception (§6.2 amendment; adjudicates CH-2/MF-1): **OPEN**
- MG-4 / MG-1 spec-vs-canvas errata (contrast metric · monogram char-count): **OPEN**

No verdicts recorded. Ratification and the v5 settle are a separate gated pass after Sergio's DEC-0 calls.

---

## SESSION RECORD

`Club Identity System.dc.html` **was rewritten this session**: the artifact on disk now contains turn 11 (11a–11c, incl. turn-11 Tweaks props and logic) **and a turn 12** ("Club badges — the sheet, the construction system, and the registry flip"); 11a–11c are not in-thread-only renders. This audit's findings reflect the turns-1–10 state as read at audit time; the QA file itself made no canvas edits.
