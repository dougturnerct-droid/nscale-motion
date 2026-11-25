# Nscale Motion — what changed

Newest first. Each heading is the After Effects panel version, which is also the release tag;
the Premiere panel version is noted where it changed. Install or update with the line in the README.

## 2.6.0 — 25 Nov 2026

After Effects panel 2.6.0 · Premiere panel 1.3.0

- Social: "Send to Media Encoder". Saves your project, fills the template in a temporary
  copy, hands each light/dark file to Media Encoder, and reopens your project within a few
  seconds. After Effects stays free while Media Encoder renders.
- Social: the template project ships inside the panel (`assets/templates.aep`), so
  you no longer open it yourself. Choose overrides it with another .aep; Built-in goes back.
- Social: a Template picker lists every comp in the project that has `Theme · controls`;
  press Scan to refresh the list.
- "Render here instead" keeps the old in-After-Effects render for the comp you have open.
- Social: "Pull Ready rows" loads posts from the Notion database *Social posts* (under Motion
  System). A post is a page made from a template per post type; its headings are the fields
  and the text under each heading is the copy. After a Media Encoder hand-off the rows are
  marked "Sent to Media Encoder" (or Failed) with the output path, who sent it and when. Needs
  the shared Notion token pasted once per Mac, under Connection in the Social tab.
- The Social tab is now **Templates**, with folders: Data centres / Cluster handover (01 Stat
  card, 02 Rack grid, 03 Spec table, 04 Test results, 05 Handover), Social / Events (Event
  post), Brand / Sign-off (End card). Pick a template and its form appears; every field goes
  to the text layer or control of the same name. The cluster cards are 1:1, 60 fps, animated
  in and out to the motion guidelines, with a transparent background for footage behind.
- "Add to open comp" drops the filled template into the comp you have open as a precomp at
  the playhead, so screens can be sequenced into each other; one undo step.
- Premiere: the cluster cards and the four text moves can be exported as .mogrt files from the
  Text tab (Build cluster cards, Build text moves). Cluster cards go out 1:1 with the catalogue's
  fields as Essential Graphics controls and the count-ups intact; text moves build one comp per
  move in 16:9, 1:1 and 9:16 with a "Text" field. In and out are protected regions. The Premiere
  panel lists them once the files are in its Mogrts folder.
- Motion library: a November tooling entry in the changelog (templates, counts, text moves, 60 fps).
- Text tab: the four moves are named for what they do rather than who they are for (Slide in by
  word, Rise by line, Rise by word, Type); the animations are unchanged.
- Animated figures end on what you type: a keyframed count (the stat on 01/05, racks and MW
  on 02) is re-keyed to the typed value rather than overwritten.

## 2.5.2 — 19 Nov 2026

After Effects panel 2.5.2 · Premiere panel 1.3.0

- Both panels now check for updates when opened and show "Update available" with a
  Copy-install-line button and a link to this page.
- Premiere: the ten .mogrt templates ship inside the panel. No Google Drive folder needed.
  Choose still overrides; Built-in goes back to the shipped set.
- Premiere: lower third gains Role line 2, Gradient opacity and Midnight gradient.
  "Get from selected" reads them back.
- Premiere: template buttons show the name only.
- Premiere: fixed templates reported missing when stored as plain files.

## 2.5.1 — 19 Nov 2026

After Effects panel 2.5.1 · Premiere panel 1.0.0

- First signed release. Install is one Terminal line: no admin password, no debug-mode
  flags, no third-party installer. Replaces the Google Drive symlink install.
- After Effects panel is the 2.5 Drive build unchanged (Social tab, loop export,
  template builders).
- Premiere panel packaged for the first time.
