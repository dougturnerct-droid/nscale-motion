#!/usr/bin/env bash
# Sign the extension into a .zxp.  Run on a Mac, from anywhere:
#
#   ./build/sign.sh
#
# What it does, in order:
#   1. Fetches Adobe's ZXPSignCmd (free, from Adobe's CEP-Resources repo) if it's missing.
#   2. Creates a self-signed certificate the first time, valid for 10 years. Kept out of git.
#   3. Copies each extension's files to a clean staging folder (no .DS_Store etc).
#   4. Signs them:  dist/nscale-motion-<version>.zxp  + dist/nscale-motion.zxp        (After Effects)
#                   dist/nscale-motion-ppro-<version>.zxp + dist/nscale-motion-ppro.zxp (Premiere)
#   5. Verifies both signatures.
#
# After Effects only loads signed extensions, and self-signed is enough — no Adobe
# certificate or Marketplace review involved.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
DIST="$ROOT/dist"
CERT_DIR="$BUILD/cert"
CERT="$CERT_DIR/nscale-motion.p12"
PASS_FILE="$CERT_DIR/password.txt"
SIGNER="$BUILD/ZXPSignCmd"

# Adobe's binary, pinned by hash so a tampered download fails loudly.
SIGNER_URL="https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/ZXPSignCMD/4.1.3/macOS/ZXPSignCmd"
SIGNER_SHA="bc773fae0b97416fc7a462e7dadcc00270428a9913480c9b78b5606ff1cfb095"

# Timestamp server. Apple's is the one that currently works with ZXPSignCmd on macOS.
# A timestamp means the signature stays valid even after the certificate expires.
TSA="http://timestamp.apple.com/ts01"

say() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || die "Sign on a Mac. Adobe says to sign on the platform the plugin will run on."

# ---------------------------------------------------------------- 1. signer
if [[ ! -x "$SIGNER" ]]; then
  say "Fetching ZXPSignCmd from Adobe's CEP-Resources repo"
  curl -fsSL -o "$SIGNER" "$SIGNER_URL"
  echo "$SIGNER_SHA  $SIGNER" | shasum -a 256 -c - >/dev/null || { rm -f "$SIGNER"; die "ZXPSignCmd download failed its checksum"; }
  chmod +x "$SIGNER"
  xattr -d com.apple.quarantine "$SIGNER" 2>/dev/null || true   # curl doesn't quarantine, but just in case
fi

# ZXPSignCmd is an Intel binary; Apple Silicon runs it through Rosetta.
if [[ "$(uname -m)" == "arm64" ]] && ! /usr/bin/arch -x86_64 /usr/bin/true 2>/dev/null; then
  die "Rosetta isn't installed. Run:  softwareupdate --install-rosetta --agree-to-license   then re-run this."
fi

# ---------------------------------------------------------------- 2. cert
mkdir -p "$CERT_DIR"
if [[ ! -f "$CERT" ]]; then
  say "Creating a self-signed certificate (one time, valid 10 years)"
  PASS="$(openssl rand -hex 16)"
  printf '%s' "$PASS" > "$PASS_FILE"
  chmod 600 "$PASS_FILE"
  "$SIGNER" -selfSignedCert GB Scotland "Nscale" "Nscale Motion" "$PASS" "$CERT" \
    -locality Edinburgh -orgUnit Design -validityDays 3650 \
    || die "Certificate creation failed (see message above)."
  [[ -f "$CERT" ]] || die "Certificate creation reported success but no .p12 was written."
  say "Certificate saved to build/cert/ — keep that folder; it's in .gitignore. Losing it is fine but every machine must then reinstall the panel."
fi
[[ -f "$PASS_FILE" ]] || die "build/cert/password.txt is missing. Delete build/cert/ and re-run to make a fresh certificate."
PASS="$(cat "$PASS_FILE")"

# ---------------------------------------------------------------- 3-5. stage, sign, verify
# Each extension is a folder with its own CSXS/manifest.xml. The list of what to ship is
# the whole folder minus junk, so adding a file needs no change here.
version_of() { sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$1/CSXS/manifest.xml" | head -1; }

build_one() {   # build_one <source folder> <package name>
  local SRCDIR="$1" NAME="$2"
  local VERSION; VERSION="$(version_of "$SRCDIR")"
  [[ -n "$VERSION" ]] || die "Couldn't read ExtensionBundleVersion from $SRCDIR/CSXS/manifest.xml"
  local STAGE; STAGE="$(mktemp -d)"
  say "Staging $NAME $VERSION"
  rsync -a --exclude '.DS_Store' --exclude '__MACOSX' --exclude '*.map' --exclude '.debug' "$SRCDIR/" "$STAGE/"
  # stamp the manifest version into the panel's update check (the BUILT constant), staged copy only
  find "$STAGE" -name 'index.html' -maxdepth 2 -exec sed -i '' "s/var BUILT = '[^']*';/var BUILT = '$VERSION';/" {} \;
  if find "$STAGE" -type l | grep -q .; then rm -rf "$STAGE"; die "Symlinks found in $SRCDIR; replace them with real files."; fi
  mkdir -p "$DIST"
  local OUT="$DIST/$NAME-$VERSION.zxp"
  rm -f "$OUT"
  say "Signing → dist/$NAME-$VERSION.zxp"
  if ! "$SIGNER" -sign "$STAGE" "$OUT" "$CERT" "$PASS" -tsa "$TSA"; then
    say "Timestamp server unreachable — signing without a timestamp (fine: the certificate is valid for 10 years)"
    rm -f "$OUT"
    "$SIGNER" -sign "$STAGE" "$OUT" "$CERT" "$PASS" || { rm -rf "$STAGE"; die "Signing $NAME failed (see message above)."; }
  fi
  rm -rf "$STAGE"
  [[ -f "$OUT" ]] || die "Signing reported success but no .zxp was written for $NAME."
  cp -f "$OUT" "$DIST/$NAME.zxp"
  say "Verifying $NAME"
  "$SIGNER" -verify "$OUT" -certInfo | sed 's/^/   /'
}

# After Effects: the repo root is the extension (CSXS, index.html, bar.html, jsx, library, scripts).
AE_STAGE="$(mktemp -d)"
trap 'rm -rf "$AE_STAGE"' EXIT
for d in CSXS jsx library scripts; do [[ -d "$ROOT/$d" ]] || die "Missing folder: $d"; cp -R "$ROOT/$d" "$AE_STAGE/"; done
# assets (template projects, footage). After Effects' Auto-Save folders are never shipped.
if [[ -d "$ROOT/assets" ]]; then rsync -a --exclude 'Auto-Save' --exclude '*.aep_AME' --exclude '.DS_Store' "$ROOT/assets/" "$AE_STAGE/assets/"; fi
for f in index.html bar.html; do [[ -f "$ROOT/$f" ]] || die "Missing file: $f"; cp "$ROOT/$f" "$AE_STAGE/"; done
build_one "$AE_STAGE" nscale-motion

# Premiere: everything under premiere/.
[[ -d "$ROOT/premiere/CSXS" ]] && build_one "$ROOT/premiere" nscale-motion-ppro

say "Done. Files in dist/:"
ls -la "$DIST" | sed 's/^/   /'
