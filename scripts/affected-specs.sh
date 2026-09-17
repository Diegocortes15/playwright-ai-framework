#!/usr/bin/env bash
# Prints which spec files a change set needs run — or the single word ALL.
#
#   scripts/affected-specs.sh [base-ref]      (default: origin/main)
#
# One resolver, used by the pull-request check in `.github/workflows/test.yml` and by
# /from-issue's local verification, so CI and a developer cannot disagree about what
# "related tests" means.
#
# IT FAILS SAFE. The rule it replaces asked `git diff -- tests/ | grep '\.spec\.ts$'` and
# exited 0 when that came back empty, so a pull request touching only a Page Object ran
# ZERO tests and reported success. That is not hypothetical: PR #94 was the fix that took
# `main` out of a red state, it changed `src/pages/InventoryPage.ts` and nothing under
# `tests/`, and its check passed having run nothing at all. Here, anything this script
# cannot confidently map to a spec resolves to ALL.
#
# Exit codes: 0 answer on stdout · 64 the base ref cannot be resolved.
set -uo pipefail

BASE="${1:-origin/main}"
git rev-parse --verify --quiet "$BASE" >/dev/null || {
  echo "affected-specs: cannot resolve base ref '${BASE}'." >&2
  exit 64
}

CHANGED=$(git diff --name-only --diff-filter=AMR "${BASE}...HEAD")
[ -z "$CHANGED" ] && exit 0

# Paths that cannot change a test's outcome: documentation, agent instructions, or an
# artifact a run writes rather than reads.
is_inert() {
  case "$1" in
    docs/* | *.md | .claude/* | .tcms/* | .observations/* | .github/* | scripts/*) return 0 ;;
    .gitignore | .prettierignore | .prettierrc* | LICENSE) return 0 ;;
    *) return 1 ;;
  esac
}

# Paths whose blast radius is the whole suite: config, the fixture every spec imports, the
# user list the projects are derived from, shared utilities, test data. Mapping these to a
# subset would be guessing, and guessing is what this script exists to stop.
is_global() {
  case "$1" in
    playwright*.config.ts | tsconfig.json | package.json | package-lock.json | eslint.config.*) return 0 ;;
    src/fixtures/* | src/observations/* | data/*) return 0 ;;
    # env.ts is read at config-eval time and by every entry point, so a change there can
    # alter any run. The REST of src/utils/ is ordinary shared code and resolves by name
    # below — lumping the whole directory in here sent SW-19 to ALL over a helper that two
    # Page Objects use, which is the over-selection this script exists to avoid, not cause.
    src/utils/env.ts) return 0 ;;
    tests/users.ts | tests/auth.setup.ts) return 0 ;;
    *) return 1 ;;
  esac
}

# Specs that mention a name, case-insensitively. A spec reaches a Page Object through its
# fixture (`inventoryPage`) and a Component through the property holding it (`.footer`), so
# the basename is what to look for. Deliberately loose: over-selecting costs seconds,
# under-selecting costs a green check on untested code.
specs_naming() {
  grep -rlis -- "$1" tests --include='*.spec.ts' 2>/dev/null || true
}

# How other modules import this file: src/utils/network.ts → utils/network. Enough to match
# both the path alias (@utils/network) and a relative import (../utils/network).
module_specifier() {
  printf '%s' "$1" | sed 's|^src/||; s|\.ts$||'
}

specs=()
for f in $CHANGED; do
  is_inert "$f" && continue
  if is_global "$f"; then
    echo "ALL"
    exit 0
  fi
  case "$f" in
    tests/*.spec.ts)
      # A changed spec runs itself. Deletions never reach here (--diff-filter=AMR).
      [ -f "$f" ] && specs+=("$f")
      ;;
    src/pages/* | src/components/* | src/utils/*)
      # Resolve by NAME, which works because a spec reaches a Page Object through its
      # fixture (`inventoryPage`) and a Component through the property holding it
      # (`.footer`). Case-insensitive and deliberately loose: over-selecting costs seconds,
      # under-selecting costs a green check on untested code.
      #
      # Construction breakage needs no separate canary. Fixtures are lazy, so any spec that
      # names the subject also instantiates the page composing it — if the constructor
      # broke, these specs are exactly the ones that fail.
      found=$(specs_naming "$(basename "$f" .ts)")

      # Nothing names it directly? Follow ONE level of the import graph before giving up. A
      # helper like src/utils/network.ts is never mentioned in a spec — the spec calls
      # `inventoryPage.blockProductImages()` — but the Page Objects importing it ARE named,
      # and those resolve.
      if [ -z "$found" ]; then
        importers=$(grep -rls -- "$(module_specifier "$f")" src --include='*.ts' 2>/dev/null || true)
        while IFS= read -r importer; do
          [ -z "$importer" ] && continue
          found="$(printf '%s\n%s' "$found" "$(specs_naming "$(basename "$importer" .ts)")")"
        done <<<"$importers"
        found=$(printf '%s' "$found" | grep -v '^[[:space:]]*$' || true)
      fi

      if [ -z "$found" ]; then
        # Changed code nothing appears to exercise, directly or one hop away. Could be
        # genuinely uncovered, or both matches could have missed it; either way this is not
        # the place to decide.
        echo "ALL"
        exit 0
      fi
      while IFS= read -r s; do [ -n "$s" ] && specs+=("$s"); done <<<"$found"
      ;;
    *)
      # Unrecognised: a new top-level directory, a build file nobody thought about. The
      # answer is the safe one, and the fix is to teach this script the path.
      echo "ALL"
      exit 0
      ;;
  esac
done

printf '%s\n' ${specs[@]+"${specs[@]}"} | sort -u
