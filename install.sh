#!/bin/sh
# Nscale Motion — install or update the After Effects panel on a Mac.
#
# Paste this one line into Terminal (no admin password, no extra apps):
#
#   curl -fsSL https://raw.githubusercontent.com/dougturnerct-droid/nscale-motion/main/install.sh | sh
#
# What it does:
#   • downloads the latest signed build from GitHub Releases
#   • unpacks it into your own user extensions folder
#       ~/Library/Application Support/Adobe/CEP/extensions/com.nscale.motion
#   • replaces any older version
# Then restart After Effects and open  Window → Extensions → Nscale Motion.
#
# Uninstall: delete that folder.
#
# Advanced: NSM_REPO=someone/other-repo sh install.sh   (point at a fork)
#           NSM_ZXP=/path/to/nscale-motion.zxp sh install.sh   (install a local build)

set -eu

REPO="${NSM_REPO:-dougturnerct-droid/nscale-motion}"
ID="com.nscale.motion"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/$ID"
URL="https://github.com/$REPO/releases/latest/download/nscale-motion.zxp"

say() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "This installer is for macOS."
case "$REPO" in */*) ;; *) die "NSM_REPO must look like owner/repo (got '$REPO').";; esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. get the signed package
if [ -n "${NSM_ZXP:-}" ]; then
  say "Using local build: $NSM_ZXP"
  cp "$NSM_ZXP" "$TMP/nscale-motion.zxp"
else
  say "Downloading the latest Nscale Motion from $REPO"
  curl -fsSL -o "$TMP/nscale-motion.zxp" "$URL" || die "Download failed. Check the link, or that the repo is public."
fi

# 2. unpack — a .zxp is a zip with Adobe's signature files inside, so unzip keeps it signed
mkdir -p "$TMP/ext"
unzip -q -o "$TMP/nscale-motion.zxp" -d "$TMP/ext" || die "The package didn't unpack cleanly."
[ -f "$TMP/ext/CSXS/manifest.xml" ] || die "That package isn't an After Effects extension (no CSXS/manifest.xml)."
[ -f "$TMP/ext/META-INF/signatures.xml" ] || die "That package isn't signed — After Effects won't load it. Re-run build/sign.sh."

VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$TMP/ext/CSXS/manifest.xml" | head -1)"

# 3. put it in place
if pgrep -xq "After Effects" 2>/dev/null; then
  say "After Effects is open — the new version loads after you restart it."
fi
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
mv "$TMP/ext" "$DEST"

say "Installed Nscale Motion ${VERSION:-} to:"
printf '   %s\n' "$DEST"
say "Restart After Effects, then open  Window → Extensions → Nscale Motion  (and Nscale Bar)."