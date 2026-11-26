#!/usr/bin/env bash
# Publish a release so every Nscale machine picks it up with the one-line installer.
#
#   ./build/release.sh            # signs, tags v<version>, uploads to GitHub Releases
#
# Needs the GitHub CLI signed in (`gh auth login`) and the repo pushed to GitHub.
# The release tag comes from CSXS/manifest.xml (the After Effects panel): bump its
# ExtensionBundleVersion and the two Extension Version values first, commit, then run this.
# The Premiere panel has its own version in premiere/CSXS/manifest.xml; bump it when its
# files change. Both packages are uploaded with every release.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v gh >/dev/null || { echo "Install the GitHub CLI first:  brew install gh   then  gh auth login" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run  gh auth login  first." >&2; exit 1; }

VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' CSXS/manifest.xml | head -1)"
TAG="v$VERSION"
PPRO_VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' premiere/CSXS/manifest.xml | head -1)"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists. Bump the version in CSXS/manifest.xml first." >&2; exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted changes. Commit first so the tag matches what's shipped." >&2; exit 1
fi

# version.json is what installed panels check for updates. Write it from the manifests and commit it
# before tagging, so the tag and the file agree.
OWNER_REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
printf '{\n  "ae": "%s",\n  "ppro": "%s",\n  "install": "curl -fsSL https://raw.githubusercontent.com/%s/main/install.sh | sh",\n  "notes": "https://github.com/%s/blob/main/CHANGELOG.md"\n}\n' "$VERSION" "$PPRO_VERSION" "$OWNER_REPO" "$OWNER_REPO" > version.json
# Stamp the BUILT fallback in the source too, so dev installs that symlink the repo report the right version.
sed -i '' "s/var BUILT = '[^']*';/var BUILT = '$VERSION';/" index.html
sed -i '' "s/var BUILT = '[^']*';/var BUILT = '$PPRO_VERSION';/" premiere/ppro/index.html
if [[ -n "$(git status --porcelain version.json index.html premiere/ppro/index.html)" ]]; then
  git add version.json index.html premiere/ppro/index.html && git commit -q -m "version.json and BUILT stamps for $TAG" && git push -q
fi

# Release notes: the "## $VERSION" section of CHANGELOG.md, if there is one.
NOTES="$(mktemp)"
awk -v v="$VERSION" '/^## /{p = ($2 == v)} p' CHANGELOG.md > "$NOTES"
if [[ ! -s "$NOTES" ]]; then
  echo "No \"## $VERSION\" section in CHANGELOG.md. Add one (what changed, for the team), commit, and re-run." >&2; exit 1
fi
printf '\nInstall or update (Mac): paste into Terminal, then restart After Effects / Premiere.\n\n    curl -fsSL https://raw.githubusercontent.com/%s/main/install.sh | sh\n' "$OWNER_REPO" >> "$NOTES"

./build/sign.sh

git tag -a "$TAG" -m "Nscale Motion $VERSION"
git push origin "$TAG"

ASSETS=("dist/nscale-motion-$VERSION.zxp" "dist/nscale-motion.zxp")
if [[ -f "dist/nscale-motion-ppro.zxp" ]]; then
  ASSETS+=("dist/nscale-motion-ppro-$PPRO_VERSION.zxp" "dist/nscale-motion-ppro.zxp")
fi

gh release create "$TAG" \
  "${ASSETS[@]}" \
  --title "Nscale Motion $VERSION" \
  --notes-file "$NOTES" \
  --latest

echo
echo "Released $TAG. The installer's 'latest' link now points at this build."
