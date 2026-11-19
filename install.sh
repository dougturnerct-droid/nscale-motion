#!/bin/sh
# Nscale Motion — install or update the After Effects panel on a Mac.
#
# Paste this one line into Terminal (no admin password, no extra apps):
#
#   curl -fsSL https://raw.githubusercontent.com/dougturnerct-droid/nscale-motion/main/install.sh | sh
#
# What it does:
#   • downloads the latest signed builds from GitHub Releases: the After Effects panel and
#     the Premiere Pro panel
#   • unpacks them into your own user extensions folder
#       ~/Library/Application Support/Adobe/CEP/extensions/com.nscale.motion        (After Effects)
#       ~/Library/Application Support/Adobe/CEP/extensions/com.nscale.motion.ppro   (Premiere Pro)
#   • replaces any older version
# Then restart After Effects / Premiere and open  Window → Extensions → Nscale Motion.
#
# Uninstall: delete those folders.
#
# Advanced: NSM_REPO=someone/other-repo sh install.sh        (point at a fork)
#           NSM_ZXP=/path/to/nscale-motion.zxp sh install.sh (install a local AE build)
#           NSM_PPRO_ZXP=/path/to/nscale-motion-ppro.zxp     (install a local Premiere build)
#           NSM_ONLY=ae  or  NSM_ONLY=ppro                   (install just one)

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
EXT="$HOME/Library/Application Support/Adobe/CEP/extensions"
mkdir -p "$EXT"

# install_one <package name> <extension id> <local zxp or empty> <app name>
install_one() {
  PKG="$1"; ID="$2"; LOCAL="$3"; APP="$4"
  DEST="$EXT/$ID"
  ZXP="$TMP/$PKG.zxp"
  if [ -n "$LOCAL" ]; then
    say "Using local build: $LOCAL"
    cp "$LOCAL" "$ZXP"
  else
    say "Downloading the latest $APP panel from $REPO"
    if ! curl -fsSL -o "$ZXP" "https://github.com/$REPO/releases/latest/download/$PKG.zxp"; then
      if [ "$PKG" = "nscale-motion" ]; then die "Download failed. Check the link, or that the repo is public."; fi
      say "No $APP package in this release — skipped."; return 0
    fi
  fi
  rm -rf "$TMP/$PKG"; mkdir -p "$TMP/$PKG"
  unzip -q -o "$ZXP" -d "$TMP/$PKG" || die "The $APP package didn't unpack cleanly."
  [ -f "$TMP/$PKG/CSXS/manifest.xml" ] || die "The $APP package isn't an Adobe extension (no CSXS/manifest.xml)."
  [ -f "$TMP/$PKG/META-INF/signatures.xml" ] || die "The $APP package isn't signed — it won't load. Re-run build/sign.sh."
  VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$TMP/$PKG/CSXS/manifest.xml" | head -1)"
  rm -rf "$DEST"
  mv "$TMP/$PKG" "$DEST"
  say "Installed $APP panel ${VERSION:-} → $DEST"
}

case "${NSM_ONLY:-both}" in
  ae)   install_one nscale-motion      com.nscale.motion      "${NSM_ZXP:-}"      "After Effects" ;;
  ppro) install_one nscale-motion-ppro com.nscale.motion.ppro "${NSM_PPRO_ZXP:-}" "Premiere Pro" ;;
  *)    install_one nscale-motion      com.nscale.motion      "${NSM_ZXP:-}"      "After Effects"
        install_one nscale-motion-ppro com.nscale.motion.ppro "${NSM_PPRO_ZXP:-}" "Premiere Pro" ;;
esac

if pgrep -xq "After Effects" 2>/dev/null || pgrep -xq "Adobe Premiere Pro" 2>/dev/null; then
  say "An Adobe app is open — the new version loads after you restart it."
fi
say "Restart After Effects / Premiere Pro, then open  Window → Extensions → Nscale Motion."
