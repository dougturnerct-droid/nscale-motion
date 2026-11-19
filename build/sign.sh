#!/usr/bin/env bash
# Sign the extension into a .zxp.  Run on a Mac, from anywhere:
#
#   ./build/sign.sh
#
# What it does, in order:
#   1. Fetches Adobe's ZXPSignCmd (free, from Adobe's CEP-Resources repo) if it's missing.
#   2. Creates a self-signed certificate the first time, valid for 10 years. Kept out of git.
#   3. Copies the extension files to a clean staging folder (no .DS_Store etc).
#   4. Signs them into  dist/nscale-motion-<version>.zxp  and  dist/nscale-motion.zxp
#   5. Verifies the signature.
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
  PASS="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)"
  printf '%s' "$PASS" > "$PASS_FILE"
  chmod 600 "$PASS_FILE"
  "$SIGNER" -selfSignedCert GB Scotland "Nscale" "Nscale Motion" "$PASS" "$CERT" \
    -locality Edinburgh -orgUnit Design -validityDays 3650 >/dev/null
  say "Certificate saved to build/cert/ — keep that folder; it's in .gitignore. Losing it is fine but every machine must then reinstall the panel."
fi
PASS="$(cat "$PASS_FILE")"

# ---------------------------------------------------------------- 3. stage
VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$ROOT/CSXS/manifest.xml" | head -1)"
[[ -n "$VERSION" ]] || die "Couldn't read ExtensionBundleVersion from CSXS/manifest.xml"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
say "Staging version $VERSION"
for d in CSXS panel bar library host; do
  [[ -d "$ROOT/$d" ]] || die "Missing folder: $d"
  rsync -a --exclude '.DS_Store' --exclude '__MACOSX' --exclude '*.map' "$ROOT/$d" "$STAGE/"
done
[[ -f "$ROOT/.debug" ]] && say "Note: .debug exists in the repo but is NOT packaged (correct for a release)."

# Symlinks break CEP's signature check — refuse rather than ship a blank panel.
if find "$STAGE" -type l | grep -q .; then die "Symlinks found in the staged files; replace them with real files."; fi

# ---------------------------------------------------------------- 4. sign
mkdir -p "$DIST"
OUT="$DIST/nscale-motion-$VERSION.zxp"
rm -f "$OUT"
say "Signing → dist/nscale-motion-$VERSION.zxp"
if ! "$SIGNER" -sign "$STAGE" "$OUT" "$CERT" "$PASS" -tsa "$TSA" >/dev/null 2>&1; then
  say "Timestamp server unreachable — signing without a timestamp (fine: the certificate is valid for 10 years)"
  rm -f "$OUT"
  "$SIGNER" -sign "$STAGE" "$OUT" "$CERT" "$PASS"
fi
cp -f "$OUT" "$DIST/nscale-motion.zxp"

# ---------------------------------------------------------------- 5. verify
say "Verifying"
"$SIGNER" -verify "$OUT" -certInfo | sed 's/^/   /'
say "Done. Files in dist/:"
ls -la "$DIST" | sed 's/^/   /'
