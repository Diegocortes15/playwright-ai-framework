#!/usr/bin/env bash
# Runs a suite on a chosen browser engine and records a labeled Qase run.
#
#   scripts/run-suite.sh <suite> <browser>
#     suite    smoke | regression
#     browser  chromium | firefox | webkit | all      (default: chromium)
#
# One place holds the engine → Playwright-project mapping, so the GitHub workflow and a QA
# running it locally cannot drift apart. The workflow passes its dispatch inputs straight
# through.
#
# Exit codes: 0 ran (whatever the tests did), 64 bad suite, 65 bad browser,
#             66 a scheduled run asked for a non-chromium engine.
# The suite's own pass/fail is NOT this script's exit code — it reports a run, and the Qase
# record plus the JSON report carry the verdict, the same contract `run-and-report.ts` has.
set -uo pipefail

SUITE="${1:-}"
BROWSER="${2:-chromium}"

case "$SUITE" in
  smoke | regression) ;;
  *)
    echo "run-suite: suite must be 'smoke' or 'regression', got '${SUITE}'." >&2
    exit 64
    ;;
esac

# Cross-browser is opt-in and standard-user only (ADR-0027): each engine gets a `-no-auth`
# and a `-standard` project and nothing else, so "regression on Firefox" means every spec
# that routes to those two — NOT the problem_user and error_user contexts, which stay
# chromium by design. `all` passes no --project filter at all, which is how it picks up the
# chromium per-user projects as well as the four cross-browser ones.
PROJECTS=()
case "$BROWSER" in
  chromium)
    ENGINES='chromium'
    ;;
  firefox | webkit)
    ENGINES="$BROWSER"
    export CROSS_BROWSER=1
    PROJECTS=(--project="${BROWSER}-no-auth" --project="${BROWSER}-standard")
    ;;
  all)
    ENGINES='chromium,firefox,webkit'
    export CROSS_BROWSER=1
    ;;
  *)
    echo "run-suite: browser must be 'chromium', 'firefox', 'webkit' or 'all', got '${BROWSER}'." >&2
    exit 65
    ;;
esac

# ADR-0029: the scheduled cadences are chromium, and this is what makes that true rather
# than merely intended. GitHub exports GITHUB_EVENT_NAME, so the refusal happens where the
# run actually starts — a cron that somehow reached here with another engine stops, loudly,
# instead of quietly spending triple the minutes on every cadence forever.
if [ "${GITHUB_EVENT_NAME:-}" = 'schedule' ] && [ "$BROWSER" != 'chromium' ]; then
  echo "run-suite: refusing '${BROWSER}' on a scheduled run — the cadences are chromium (ADR-0029)." >&2
  echo "run-suite: dispatch the workflow manually to run another engine." >&2
  exit 66
fi

# Read by run-and-report.ts, so the Qase description names the engine that ran instead of
# assuming Chromium.
export RUN_ENGINES="$ENGINES"

# Qase run label: the engine is part of the identity of a run, so a WebKit regression does
# not read as a repeat of the chromium one. Chromium stays unsuffixed, keeping every
# existing run title and the labels already in Qase intact.
LABEL="$(printf '%s' "$SUITE" | tr '[:lower:]' '[:upper:]')"
[ "$BROWSER" != 'chromium' ] && LABEL="${LABEL} · $(printf '%s' "$BROWSER" | tr '[:lower:]' '[:upper:]')"

GREP=()
[ "$SUITE" = 'smoke' ] && GREP=(--grep "@smoke")

echo "run-suite: ${SUITE} on ${BROWSER} (engines: ${ENGINES})"
echo "run-suite: npx tsx src/tcms/run-and-report.ts ${LABEL} ${GREP[*]-} ${PROJECTS[*]-}"
exec npx tsx src/tcms/run-and-report.ts "$LABEL" ${GREP[@]+"${GREP[@]}"} ${PROJECTS[@]+"${PROJECTS[@]}"}
