"use client";
/**
 * The interactive /pool pick'em surface (Prompt 42). Net-new screen (no design reference): two tabs —
 * "Picks" (default) + "Leaderboard". Boring + reliable, by design: NO Realtime, NO polling (the Realtime
 * subscription + live pick-reveal-at-kickoff are Prompt 43). Reads arrive as the `view` prop from the
 * server component (`loadPool`); every pick is a `POST /api/pool/pick` round-trip followed by
 * `router.refresh()` (re-runs the server component → fresh props — no optimistic-only state). The only
 * live thing is the `now` clock, seeded from `view.nowIso` and ticked client-side so a fixture's control
 * disables the instant its kickoff passes (the lock-on-play language reused from setlineup/vsfield).
 *
 * Reveal is server-enforced: the loader returns others' picks ONLY for matches past kickoff (Prompt 40
 * §3); the UI just renders `fixture.others`. The route's 409s (pick-locked, knockout-DRAW) surface as
 * inline per-fixture errors.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PoolPrediction } from "@app/shared";
import { isFixtureLocked } from "./poolView";
import { FixtureCard, LeaderboardTable } from "./components";
import type { PoolFixture, PoolView } from "./types";
import "./pool.css";

/** Clean, user-facing copy for the rejections the route returns (the raw engine messages are terse). */
const ERROR_MESSAGES: Record<string, string> = {
  "pick-locked": "This match is locked — picks closed at kickoff.",
  "draw-not-allowed-knockout": "Pick the team that advances — a draw isn’t valid for a knockout.",
  unknown_match: "That match couldn’t be found.",
  no_manager: "Your manager profile isn’t set up yet.",
  not_your_manager: "You can only make your own picks.",
  not_allowlisted: "Your account isn’t on the league allowlist.",
  no_session: "Your session expired — please sign in again.",
  bad_request: "Something was off with that pick — try again.",
};

function friendly(data: { error?: string; message?: string } | null): string {
  if (!data) return "Something went wrong — please try again.";
  const mapped = data.error ? ERROR_MESSAGES[data.error] : undefined;
  return mapped ?? data.message ?? "Your pick was rejected — please review and try again.";
}

export function PoolClient({ view }: { view: PoolView }) {
  const router = useRouter();
  const [tab, setTab] = useState<"picks" | "leaderboard">("picks");
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Live clock — seeded from server time (no hydration mismatch), ticked every 30s so a fixture's
  // control disables the moment kickoff passes even without a refresh.
  const [now, setNow] = useState(() => new Date(view.nowIso));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Deterministic kickoff formatter (explicit locale + UTC ⇒ identical SSR + client output, no mismatch).
  const fmtKickoff = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
    return (iso: string) => `${fmt.format(new Date(iso))} UTC`;
  }, []);

  async function handlePick(matchId: string, prediction: PoolPrediction) {
    setBusyMatchId(matchId);
    setErrors((e) => {
      const next = { ...e };
      delete next[matchId];
      return next;
    });
    const res = await fetch("/api/pool/pick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ managerId: view.managerId, matchId, prediction }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    setBusyMatchId(null);
    if (res.ok) {
      router.refresh();
    } else {
      setErrors((e) => ({ ...e, [matchId]: friendly(data) }));
    }
  }

  const renderFixture = (fixture: PoolFixture, knockout: boolean) => (
    <FixtureCard
      key={fixture.matchId}
      fixture={fixture}
      knockout={knockout}
      locked={isFixtureLocked(fixture, now)}
      busy={busyMatchId === fixture.matchId}
      error={errors[fixture.matchId] ?? null}
      kickoffText={fmtKickoff(fixture.kickoffAt)}
      onPick={(prediction) => handlePick(fixture.matchId, prediction)}
    />
  );

  const { matchdays, bracket, unscheduled } = view.picks;
  const hasAnyFixture =
    matchdays.length > 0 || bracket.some((r) => r.fixtures.length > 0) || unscheduled.length > 0;

  return (
    <div className="pl-app">
      <div className="pl-tabs" role="tablist" aria-label="Pool">
        <button
          role="tab"
          aria-selected={tab === "picks"}
          className={"pl-tab" + (tab === "picks" ? " is-active" : "")}
          onClick={() => setTab("picks")}
        >
          Picks
        </button>
        <button
          role="tab"
          aria-selected={tab === "leaderboard"}
          className={"pl-tab" + (tab === "leaderboard" ? " is-active" : "")}
          onClick={() => setTab("leaderboard")}
        >
          Leaderboard
        </button>
      </div>

      {tab === "picks" ? (
        <div className="pl-picks">
          <div className="pl-intro t-micro text-tertiary">
            Pick every match before it kicks off · own picks are private until kickoff · +1 per
            correct result
          </div>

          {!hasAnyFixture && (
            <div className="pl-empty">
              <b>No fixtures yet.</b>
              <span className="t-sm text-tertiary">
                Match picks open once the tournament schedule is loaded.
              </span>
            </div>
          )}

          {matchdays.map((section) => (
            <section key={section.label} className="pl-md">
              <header className="pl-md-head">
                <span className="t-label">{section.label}</span>
                <span className="t-micro text-tertiary">{section.fixtures.length} matches</span>
              </header>
              <div className="pl-md-list">
                {section.fixtures.map((f) => renderFixture(f, false))}
              </div>
            </section>
          ))}

          {bracket.length > 0 && (
            <section className="pl-bracket-wrap">
              <header className="pl-md-head">
                <span className="t-label">Knockout bracket</span>
                <span className="t-micro text-tertiary">
                  Pick the team that advances · undecided rounds are TBD
                </span>
              </header>
              <div className="pl-bracket">
                {bracket.map((round) => (
                  <div key={round.label} className="pl-bcol">
                    <div className="pl-bcol-head">{round.label}</div>
                    {round.fixtures.length === 0 ? (
                      <div className="pl-tbd-card">
                        <span className="pl-tbd-dot" aria-hidden="true" />
                        <span className="t-sm text-tertiary">To be decided</span>
                      </div>
                    ) : (
                      round.fixtures.map((f) => renderFixture(f, true))
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {unscheduled.length > 0 && (
            <section className="pl-md">
              <header className="pl-md-head">
                <span className="t-label">Not yet scheduled</span>
                <span className="t-micro text-tertiary">awaiting period assignment</span>
              </header>
              <div className="pl-md-list">{unscheduled.map((f) => renderFixture(f, false))}</div>
            </section>
          )}
        </div>
      ) : (
        <div className="pl-board-page">
          <div className="pl-board-head">
            <span className="t-label">Standings</span>
            <span className="t-micro text-tertiary">+1 per correct result · ranked by points</span>
          </div>
          <LeaderboardTable rows={view.leaderboard} />
        </div>
      )}
    </div>
  );
}
