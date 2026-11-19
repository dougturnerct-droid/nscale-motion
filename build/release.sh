#!/usr/bin/env bash
# Publish a release so every Nscale machine picks it up with the one-line installer.
#
#   ./build/release.sh            # signs, tags v<version>, uploads to GitHub Releases
#
# Needs the GitHub CLI signed in (`gh auth login`) and the repo pushed to GitHub.
# The version comes from CSXS/manifest.xml — bump ExtensionBundleVersion and the two
# Extension Version values there first, commit, then run this.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v gh >/dev/null || { echo "Install the GitHub CLI first:  brew install gh   then  gh auth login" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run  gh auth login  first." >&2; exit 1; }

VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' CSXS/manifest.xml | head -1)"
TAG="v$VERSION"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists. Bump the version in CSXS/manifest.xml first." >&2; exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted changes. Commit first so the tag matches what's shipped." >&2; exit 1
fi

./build/sign.sh

git tag -a "$TAG" -m "Nscale Motion $VERSION"
git push origin "$TAG"

gh release create "$TAG" \
  "dist/nscale-motion-$VERSION.zxp" \
  "dist/nscale-motion.zxp" \
  --title "Nscale Motion $VERSION" \
  --notes "Install or update (Mac): paste the line from the README into Terminal and restart After Effects." \
  --latest

echo
echo "Released $TAG. The installer's 'latest' link now points at this build."
