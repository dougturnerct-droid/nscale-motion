# Nscale Motion — After Effects and Premiere Pro panels

Two CEP extensions, one install. Mac only for now.

- **After Effects** (`com.nscale.motion`): the Nscale Motion panel plus the compact Nscale Bar.
- **Premiere Pro** (`com.nscale.motion.ppro`): places the Nscale .mogrt templates (Lower third,
  Title, five sizes each) on the timeline with the editor's text. The templates ship inside
  the panel, so no Drive access is needed. After Effects must be installed on the same machine
  (the templates are AE-built).

**Status:** the real panel (2.5.x, from the Drive folder) on a signed, one-line install:
no admin password, no debug-mode flags, no third-party installer. The build notes for the
panel itself are in the "Nscale Motion plugins: build notes" doc.

---

## Install (what a Nscale designer does)

Open **Terminal** (Spotlight → "Terminal"), paste this, press Return:

```sh
curl -fsSL https://raw.githubusercontent.com/dougturnerct-droid/nscale-motion/main/install.sh | sh
```

Restart After Effects and Premiere → **Window → Extensions → Nscale Motion** in each.

Updating is the same line. Each panel checks `version.json` in this repo when it opens and shows
"Update available" with a Copy-install-line button when a newer release exists. Uninstall by deleting `com.nscale.motion` and
`com.nscale.motion.ppro` from `~/Library/Application Support/Adobe/CEP/extensions/`.

> Replace `dougturnerct-droid/nscale-motion` here and at the top of `install.sh` once the repo exists on GitHub.
> The repo must be **public** for the bare `curl` to work (the code is just HTML/JS; the
> certificate and password are gitignored). If Nscale wants it private, the installer needs
> a GitHub token — say so and I'll add that path.

---

## Why this install has no approval steps

| Gate | How it's handled |
|---|---|
| AE refuses unsigned extensions | The build is **signed** with a self-signed certificate via Adobe's own `ZXPSignCmd`. AE accepts self-signed. No Adobe certificate, no Marketplace review. |
| `PlayerDebugMode` registry/plist flag | Not needed — only unsigned extensions need it, and on AE 2026 it's unreliable anyway. |
| Admin password | The extension goes in the **user's** CEP folder (`~/Library/…`), which needs no admin rights. |
| Gatekeeper "unidentified developer" dialog | Nothing is double-clicked. `curl | sh` runs the script without macOS quarantining it. No `.command`, no `.pkg`, no ZXP Installer app. |
| AE's "Allow Scripts to Write Files and Access Network" preference | The manifest turns on **Node.js inside the panel** (`--enable-nodejs`). Any file reading/writing (Notes, Send, Run script, PNG stills) should be built in the panel's JS, not in ExtendScript, so users never have to tick that box. |
| Adobe's UPIA installer | Deliberately not used. Adobe's own known-issue note says UPIA-installed ZXPs can fail signature checks (symlink handling, needs admin). Unzipping the signed package ourselves sidesteps it. |

---

## Folder map

```
nscale-motion/
├─ CSXS/manifest.xml       After Effects bundle: two panels, Node on, host script path
├─ index.html              the main AE panel: markup, styles and script in one file
├─ bar.html                the compact bar
├─ jsx/host.jsx            runs inside After Effects — every tool, dispatcher nsm_run at the end
├─ library/index.html      the motion library, shown in the Library tab
├─ scripts/*.jsx           the two Premiere template builders, run from the Text tab
├─ assets/                 shipped with the AE panel: social-templates.aep (+ its footage)
├─ premiere/               the Premiere Pro extension, packaged separately
│  ├─ CSXS/manifest.xml    Premiere bundle, host PPRO 22+
│  ├─ ppro/index.html      the panel, draws itself from templates.json
│  ├─ ppro/jsx/host.jsx    runs inside Premiere, entry point nsp_run
│  ├─ templates.json       which templates exist, their fields, file names
│  └─ Mogrts/              the ten .mogrt files, shipped with the panel
├─ version.json            latest versions; panels read this to offer updates (release.sh writes it)
├─ CHANGELOG.md            what changed per release; linked from the update notice
├─ install.sh              the one-liner installer (installs both)
├─ build/sign.sh           fetches ZXPSignCmd, makes the cert once, signs both → dist/*.zxp
├─ build/release.sh        sign + tag + upload both to GitHub Releases
└─ dist/                   built packages (gitignored)
```

In Webflow terms: `index.html` is the page, `jsx/host.jsx` is the custom code that
actually touches the comp, and `manifest.xml` is the site settings. The panel sends a
message ("apply this curve to the selected keys") and the host replies with a short
string like `OK:done` or `WARN:select some keyframes first`, which the panel shows in
its status bar.

---

## Set-up (what you do, once)

1. Put this folder in a GitHub repo (public) and push it.
2. Replace `dougturnerct-droid/nscale-motion` in `install.sh` and in this README. Commit.
3. Install the GitHub CLI if you don't have it: `brew install gh` then `gh auth login`.
4. On Apple Silicon make sure Rosetta is installed (Adobe's signer is Intel-only):
   `softwareupdate --install-rosetta --agree-to-license`
5. Run `./build/sign.sh` once. It downloads `ZXPSignCmd`, creates `build/cert/` with the
   certificate and a random password, and signs the first build.
   **Back up `build/cert/`** (it's gitignored). If it's lost you make a new one and every
   machine just reinstalls — not a disaster, but avoid it.

## Releasing a new version

1. Add a `## <version> — <date>` section at the top of `CHANGELOG.md` saying what changed. The
   panels link to it from the update notice, and it becomes the GitHub release notes.
2. Bump the version in `CSXS/manifest.xml` — three places: `ExtensionBundleVersion` and
   both `Extension … Version="…"` lines. Keep them identical. This is the release tag.
   If the Premiere files changed, also bump `premiere/CSXS/manifest.xml` (two places).
3. Commit.
4. `./build/release.sh`

That signs, tags `v<version>`, and publishes a GitHub Release marked *latest*. The
installer always pulls `…/releases/latest/download/nscale-motion.zxp`, so everyone gets
the new build next time they run the line.

## Testing on your own machine

```sh
./build/sign.sh && NSM_ZXP=dist/nscale-motion.zxp NSM_PPRO_ZXP=dist/nscale-motion-ppro.zxp sh install.sh
```

Restart After Effects. The status bar at the bottom of the panel should read
"Ready" and the tools work on a selected layer — that proves the whole chain
(signature → panel → ExtendScript).

To see the panel's JS console: add a `.debug` file and turn on PlayerDebugMode on your
machine only. Not set up yet — say the word.

---

## If something's off

- **Panel isn't in the Extensions menu** → the signature check failed or the manifest
  didn't parse. Re-run `./build/sign.sh` (it runs `-verify` at the end) and reinstall.
- **Panel opens but is blank** → almost always a signature problem. Same fix.
- **Every tool answers "EvalScript error."** → `jsx/host.jsx` has a syntax error.
  ExtendScript is old JavaScript: no `const`/`let`, no arrow functions, no `JSON`.
- **Rosetta prompt or "bad CPU type"** when signing → step 4 above.
- **`permission denied ./ZXPSignCmd`** → `chmod +x build/ZXPSignCmd` (the script does
  this, but if you downloaded the binary by hand macOS will also quarantine it).

## Lifetime

Adobe's 17 Nov 2026 note: UXP for After Effects is public beta only (AE Beta 27.1). CEP
is disabled by default from **Dec 2028** (re-enableable) and removed from **Dec 2029**.
This panel has about three years before it needs a UXP port.

## Social: the template project

`assets/social-templates.aep` ships inside the After Effects panel. Any comp in it with a
`Theme · controls` layer (with the `Dark mode` checkbox) and a `Heading` text layer is offered
in the Social tab's Template picker. To change templates: edit the file, Collect Files into
`assets/` so footage comes along, bump the AE version, changelog, release. Third-party effects
used in the comps (Deep Glow, Shadow Studio, ...) must be installed on every machine that
renders, or those layers render wrong; prefer built-in effects where you can.

"Send to Media Encoder" never opens that file in place: it copies it to the system temp folder,
works there, and reopens your project. Temp copies live in `~/…/TemporaryItems/nscale-social-ame`.

## Social: Notion

Posts are queued in the Notion database **Social posts** (under *Motion System*). A row is a
page: the **page body** carries the copy, the columns carry metadata. New → pick the template
for the post type (Event post, Quote post, …); it lays out a `###` heading per field with the
copy typed underneath. Set Status to **Ready**. In the panel, Social → Notion → **Pull Ready
rows** loads them into the batch; **Send to Media Encoder** renders them and writes Status,
Output, Rendered by and Rendered at back to each row.

How a page maps to a comp:

- The Template option names the comp (`TEMPLATE_COMP` in `index.html` maps option → comp name;
  an unlisted option is used as the comp name as-is).
- Each `###` heading is a field; the paragraphs under it, up to the next heading or a divider,
  are its value (line breaks kept). Text outside a heading is ignored, so notes are fine.
- In the comp, a field fills the **text layer with the same name**. `Dark mode` on
  `Theme · controls` is the light/dark switch. The event comp (`social-asset`) keeps its special
  handling (hero line-split, glass clearance); every other comp uses the plain name match.
- Rows whose title starts with `TEMPLATE` are never rendered.

Adding a post type: build the comp (text layers named as the fields; a `Theme · controls`
layer with `Dark mode`), save into `assets/social-templates.aep`, add the option to the
Template select in Notion, make a page template for it (below), add the option → comp name to
`TEMPLATE_COMP`, release.

Making a page template in Notion (the API can't): open the database → the arrow next to
**New** → **New template** → name it after the Template option → set Template, Light and
Dark on it → copy the body from the matching `TEMPLATE · …` row. Then the `TEMPLATE · …`
rows can be deleted.

Access is a Notion *internal integration* shared with that database. Its token is pasted once per
Mac under Social → Notion → Connection and saved to
`~/Library/Application Support/Nscale Motion/notion.json` (never in this repo). Setting up the
integration, once:

1. notion.so/profile/integrations → New integration → name "Nscale Motion panel", workspace Nscale,
   type Internal. Capabilities: read and update content. Copy the token (`ntn_…`).
2. Open the Social posts database → ··· menu → Connections → add "Nscale Motion panel".
3. Give the token to editors directly (Slack DM, not a public channel). Anyone with it can read
   and edit whatever the integration is connected to, which is only that database.

## Premiere: updating the templates

The panel uses `premiere/Mogrts/` first; the Google Drive paths in `templates.json` are only
fallbacks, and Choose in the panel overrides both. To ship new templates:

1. Export from After Effects. AE often writes `<name>.mogrt` as a *folder* with the real file
   inside — take the file out.
2. Save it into `premiere/Mogrts/` under the name `templates.json` expects:
   `Nscale - Lower third - 16x9.mogrt`, `Nscale - Title - 9x16.mogrt`, and so on
   (plain hyphens, format ids `16x9`, `16x9 4K`, `1x1`, `4x5`, `9x16`).
3. Bump the version in `premiere/CSXS/manifest.xml` (two places), commit, release.

Premiere doesn't update clips already on a timeline when a template changes; only new ones.

## Still a per-machine step

"Allow Scripts to Write Files and Access Network" (After Effects → Settings → Scripting &
Expressions) must be on, because `host.jsx` writes files from ExtendScript (Send, Notes,
Render stills). Node is already enabled in the manifest; moving those writes into the
panel's JS removes this step. Not done yet.
