// Nscale Motion for Premiere Pro: host script (ExtendScript, runs inside Premiere).
// The panel calls nsp_run(action, payload). Returns "OK:message", "WARN:message", "PATH:folder",
// "STATE:{json}" (templates, the Mogrts folder, the open sequence) or "TEXT:{json}" (fields read from a selected clip).
// What templates exist, their fields and their file names all come from templates.json, next to the ae and ppro
// folders. Adding a template means adding it there and putting its .mogrt files in the Mogrts folder: no code change.

// The extension root (where templates.json and Mogrts/ live). The panel sends it with every call as
// payload.root, from CEP's own getSystemPath("extension"); $.fileName is only a fallback, because
// Premiere doesn't always set it when it loads this file from the manifest.
var NSP_ROOT = (function () { try { var f = File($.fileName); return f.exists ? f.parent.parent.parent : null; } catch (e) { return null; } })();
function nspSetRoot(p) { if (p) { var d = new Folder(String(p).replace(/[\/\\]+$/, "")); if (d.exists) NSP_ROOT = d; } }
function nspJoin(folder, name) { return String(folder.fsName).replace(/[\/\\]+$/, "") + "/" + name; }
var NSP_SPAN = 6;   // seconds of free track needed when picking a track automatically

// small JSON writer (Premiere's ExtendScript has no JSON object)
function nspJSON(v) {
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + '"';
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(nspJSON(v[i])); return "[" + a.join(",") + "]"; }
    var o = []; for (var k in v) if (v.hasOwnProperty(k)) o.push(nspJSON(String(k)) + ":" + nspJSON(v[k])); return "{" + o.join(",") + "}";
}
function nspParse(s) { try { return eval("(" + s + ")"); } catch (e) { return null; } }

function nspConfig() {
    if (!NSP_ROOT) return null;
    var f = new File(nspJoin(NSP_ROOT, "templates.json")); if (!f.exists) return null;
    f.encoding = "UTF-8"; f.open("r"); var s = f.read(); f.close();
    return nspParse(s);
}
// a folder path may start with ~ and use * in a folder name (the Google Drive path has the account in it)
function nspExpand(p) {
    var parts = String(p).split("/"), found = [new Folder(parts[0] === "~" ? "~" : (parts[0] === "" ? "/" : parts[0]))];
    for (var i = 1; i < parts.length; i++) {
        var seg = parts[i], next = []; if (!seg) continue;
        for (var j = 0; j < found.length; j++) {
            if (seg.indexOf("*") < 0) { next.push(new Folder(found[j].fsName + "/" + seg)); continue; }
            var hits = found[j].exists ? found[j].getFiles(seg) : [];
            for (var h = 0; h < hits.length; h++) if (hits[h] instanceof Folder) next.push(hits[h]);
        }
        found = next;
    }
    for (var k = 0; k < found.length; k++) if (found[k].exists) return found[k];
    return null;
}
// Order: a folder the editor chose, then the Mogrts folder shipped inside the panel, then the Drive paths in templates.json
function nspFolder(chosen, cfg) {
    if (chosen) { var c = new Folder(chosen); if (c.exists) return c; }
    if (NSP_ROOT) { var b = new Folder(nspJoin(NSP_ROOT, "Mogrts")); if (b.exists) return b; }
    var list = (cfg && cfg.mogrtFolders) || [];
    for (var i = 0; i < list.length; i++) { var f = nspExpand(list[i]); if (f) return f; }
    return null;
}
// After Effects sometimes exports "<name>.mogrt" as a folder with the real file inside; accept both
// Names are compared loosely: "Nscale - Lower third - 16x9.mogrt" also matches "Nscale \u00b7 Lower third \u00b7 16:9.mogrt"
function nspKey(n) { return String(n).toLowerCase().replace(/\.mogrt$/, "").replace(/[^a-z0-9]+/g, ""); }
function nspMogrt(folder, name) {
    if (!folder) return null;
    // Check the plain file first. (Folder(path).exists is true for a file too in Premiere's ExtendScript,
    // so testing the wrapper-folder case first would swallow flat files.)
    var f = new File(nspJoin(folder, name));
    if (f.exists && f instanceof File) return f;
    var asFolder = new Folder(nspJoin(folder, name));
    if (asFolder.exists && asFolder instanceof Folder) { var inner = asFolder.getFiles("*.mogrt"); for (var i = 0; i < inner.length; i++) if (inner[i] instanceof File) return inner[i]; }
    var want = nspKey(name), all = folder.getFiles("*.mogrt");
    for (var k = 0; k < all.length; k++) {
        if (nspKey(all[k].displayName) !== want) continue;
        if (all[k] instanceof File) return all[k];
        var inner2 = all[k].getFiles("*.mogrt"); for (var m = 0; m < inner2.length; m++) if (inner2[m] instanceof File) return inner2[m];
    }
    return null;
}
function nspFileName(tpl, formatId) { return String(tpl.file).replace("{format}", formatId); }
function nspTemplate(cfg, id) { for (var i = 0; i < cfg.templates.length; i++) if (cfg.templates[i].id === id) return cfg.templates[i]; return null; }
function nspFormat(cfg, id) { for (var i = 0; i < cfg.formats.length; i++) if (cfg.formats[i].id === id) return cfg.formats[i]; return null; }

// the format that fits a sequence: an exact frame size, else the nearest shape (4K when the frame is that wide)
function nspFormatFor(cfg, w, h) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < cfg.formats.length; i++) {
        var f = cfg.formats[i];
        if (f.w === w && f.h === h) return f.id;
        var d = Math.abs(Math.log((w / h) / (f.w / f.h))) + Math.abs(Math.log(w / f.w)) * 0.1;
        if (d < bestD) { bestD = d; best = f.id; }
    }
    return best;
}
function nspSeqInfo(cfg) {
    var seq = app.project.activeSequence; if (!seq) return null;
    var w = parseInt(seq.frameSizeHorizontal, 10), h = parseInt(seq.frameSizeVertical, 10);
    return { name: seq.name, w: w, h: h, format: nspFormatFor(cfg, w, h) };
}

// which template and format a placed clip is, from its name (e.g. "Nscale \u00b7 Lower third \u00b7 9:16")
function nspWhat(cfg, item) {
    var n = String(item.name), tpl = null, fmt = "";
    for (var i = 0; i < cfg.templates.length; i++) if (n.indexOf(cfg.templates[i].match) >= 0) tpl = cfg.templates[i];
    for (var j = 0; j < cfg.formats.length; j++) { var lab = cfg.formats[j].label; if (n.length >= lab.length && n.substr(n.length - lab.length) === lab) { if (!fmt || lab.length > nspFormat(cfg, fmt).label.length) fmt = cfg.formats[j].id; } }
    return { tpl: tpl, format: fmt };
}

function nspPickTrack(seq, t, want) {
    var n = seq.videoTracks.numTracks;
    if (want && want > 0) return Math.min(want, n) - 1;
    for (var i = 1; i < n; i++) {
        var tr = seq.videoTracks[i], free = true;
        for (var c = 0; c < tr.clips.numItems; c++) { var cl = tr.clips[c]; if (cl.start.seconds < t + NSP_SPAN && cl.end.seconds > t) { free = false; break; } }
        if (free) return i;
    }
    return n - 1;
}
function nspTrackOf(seq, item) {
    for (var i = 0; i < seq.videoTracks.numTracks; i++) { var tr = seq.videoTracks[i]; for (var c = 0; c < tr.clips.numItems; c++) if (tr.clips[c].nodeId === item.nodeId) return i; }
    return -1;
}

function nspParam(item, name) { var c = null; try { c = item.getMGTComponent(); } catch (e) {} return c ? c.properties.getParamForDisplayName(name) : null; }
// After Effects templates hold text as JSON with a "textEditValue"; older versions take plain text
function nspSetText(item, name, text) {
    var p = nspParam(item, name); if (!p) return false;
    var t = String(text).replace(/\r\n|\n/g, "\r"), cur = p.getValue(), obj = nspParse(cur);
    if (obj && typeof obj === "object" && obj.textEditValue !== undefined) { obj.textEditValue = t; p.setValue(nspJSON(obj), true); }
    else p.setValue(t, true);
    return true;
}
function nspGetText(item, name) {
    var p = nspParam(item, name); if (!p) return null;
    var cur = p.getValue(), obj = nspParse(cur);
    return String(obj && typeof obj === "object" && obj.textEditValue !== undefined ? obj.textEditValue : cur).replace(/\r/g, "\n");
}
// Non-text fields: a slider is a number, a checkbox is true/false
function nspSetValue(item, f, v) {
    var p = nspParam(item, f.param); if (!p) return false;
    if (f.type === "checkbox") { p.setValue(v === true || v === "true" || v === 1 || v === "1", true); return true; }
    if (f.type === "slider") { var n = parseFloat(v); if (!isFinite(n)) return true; p.setValue(n, true); return true; }
    return nspSetText(item, f.param, v);
}
function nspGetValue(item, f) {
    if (f.type === "checkbox" || f.type === "slider") { var p = nspParam(item, f.param); if (!p) return null; var v = p.getValue(); return f.type === "checkbox" ? (v === true || v === "true" || v === 1) : parseFloat(v); }
    return nspGetText(item, f.param);
}
function nspFill(item, tpl, values, onlyGiven) {
    var missing = [];
    for (var i = 0; i < tpl.fields.length; i++) {
        var f = tpl.fields[i], v = values ? values[f.param] : undefined;
        if (v === undefined || v === null) { if (onlyGiven) continue; v = (f["default"] !== undefined ? f["default"] : ""); }
        if (onlyGiven && v === "" && !f.optional && !f.type) continue;   // an empty required text field means "leave it"
        if (!nspSetValue(item, f, v)) missing.push(f.label);
    }
    return missing;
}
function nspSelected(cfg, seq) {
    var sel = [], s = seq.getSelection();
    for (var i = 0; i < s.length; i++) { var it = s[i]; try { if (it.getMGTComponent() && nspWhat(cfg, it).tpl) sel.push(it); } catch (e) {} }
    return sel;
}

function nspState(p) {
    var cfg = nspConfig(); if (!cfg) return "WARN:templates.json is missing from this version of the panel.";
    var folder = nspFolder(p.folder, cfg), seq = nspSeqInfo(cfg), found = {};
    for (var i = 0; i < cfg.templates.length; i++) for (var j = 0; j < cfg.formats.length; j++)
        found[cfg.templates[i].id + "/" + cfg.formats[j].id] = !!nspMogrt(folder, nspFileName(cfg.templates[i], cfg.formats[j].id));
    return "STATE:" + nspJSON({ templates: cfg.templates, formats: cfg.formats, folder: folder ? folder.fsName : "", found: found, sequence: seq });
}
function nspAdd(p) {
    var cfg = nspConfig(); if (!cfg) return "WARN:templates.json is missing from this version of the panel.";
    var seq = app.project.activeSequence; if (!seq) return "WARN:Open a sequence first.";
    var tpl = nspTemplate(cfg, p.id); if (!tpl) return "WARN:Unknown template.";
    var info = nspSeqInfo(cfg), fmt = p.format && nspFormat(cfg, p.format) ? p.format : info.format;
    var folder = nspFolder(p.folder, cfg); if (!folder) return "WARN:Choose the Mogrts folder first (under Templates folder).";
    var file = nspMogrt(folder, nspFileName(tpl, fmt));
    if (!file) return "WARN:" + nspFileName(tpl, fmt) + " isn't in the Mogrts folder.";
    var pos = seq.getPlayerPosition(), track = nspPickTrack(seq, pos.seconds, p.track);
    var item = seq.importMGT(file.fsName, pos.ticks, track, 0);
    if (!item) return "WARN:Premiere didn't place the template. Is After Effects installed on this computer?";
    var missing = nspFill(item, tpl, p.values, false);
    return "OK:" + tpl.name + " \u00b7 " + nspFormat(cfg, fmt).label + " on V" + (track + 1) + " at the playhead" + (missing.length ? " \u00b7 couldn't set " + missing.join(", ") : "");
}
// swap a placed clip for the same template in another format: same track, start and length, same text
function nspSwap(cfg, seq, item, tpl, fmt, folder, values) {
    var file = nspMogrt(folder, nspFileName(tpl, fmt)); if (!file) return { warn: nspFileName(tpl, fmt) + " isn't in the Mogrts folder" };
    var track = nspTrackOf(seq, item); if (track < 0) return { warn: "couldn't find the clip's track" };
    var keep = {}, i;
    for (i = 0; i < tpl.fields.length; i++) { var cur = nspGetText(item, tpl.fields[i].param); if (cur !== null) keep[tpl.fields[i].param] = cur; }
    if (values) for (i = 0; i < tpl.fields.length; i++) { var v = values[tpl.fields[i].param]; if (v !== undefined && v !== null && (v !== "" || tpl.fields[i].optional)) keep[tpl.fields[i].param] = v; }
    var startTicks = item.start.ticks, endTicks = item.end.ticks;
    item.remove(false, false);
    var n = seq.importMGT(file.fsName, startTicks, track, 0); if (!n) return { warn: "Premiere didn't place the template" };
    var note = ""; try { var t = new Time(); t.ticks = endTicks; n.end = t; } catch (e) { note = "length reset: trim it back"; }
    nspFill(n, tpl, keep, false);
    return { note: note };
}
// every Nscale clip in the sequence (used after duplicating a sequence into another shape)
function nspAll(cfg, seq) {
    var all = [];
    for (var i = 0; i < seq.videoTracks.numTracks; i++) { var tr = seq.videoTracks[i]; for (var c = 0; c < tr.clips.numItems; c++) { var it = tr.clips[c]; try { if (it.getMGTComponent() && nspWhat(cfg, it).tpl) all.push(it); } catch (e) {} } }
    return all;
}
function nspUpdate(p) {
    var cfg = nspConfig(); if (!cfg) return "WARN:templates.json is missing from this version of the panel.";
    var seq = app.project.activeSequence; if (!seq) return "WARN:Open a sequence first.";
    var sel = p.all ? nspAll(cfg, seq) : nspSelected(cfg, seq);
    if (!sel.length) return p.all ? "WARN:There are no Nscale clips in this sequence." : "WARN:Select one or more Nscale clips in the timeline.";
    var folder = nspFolder(p.folder, cfg), info = nspSeqInfo(cfg), want = p.format && nspFormat(cfg, p.format) ? p.format : info.format;
    var texted = 0, swapped = 0, notes = [];
    for (var i = 0; i < sel.length; i++) {
        var w = nspWhat(cfg, sel[i]), vals = (p.id === w.tpl.id) ? p.values : null;   // text only goes onto clips of the template being edited
        if (w.format !== want) {
            var r = nspSwap(cfg, seq, sel[i], w.tpl, want, folder, vals);
            if (r.warn) { notes.push(r.warn); continue; }
            swapped++; if (vals) texted++; if (r.note && notes.join("|").indexOf(r.note) < 0) notes.push(r.note);
        } else if (vals) { nspFill(sel[i], w.tpl, vals, true); texted++; }
    }
    var did = [];
    if (swapped) did.push(swapped + " clip" + (swapped === 1 ? "" : "s") + " now " + nspFormat(cfg, want).label);
    if (texted) did.push("text updated on " + texted);
    if (!did.length) return notes.length ? "WARN:" + notes.join("; ") : (p.all ? "OK:All " + sel.length + " Nscale clips already match this sequence." : "WARN:Nothing to update: the selected clips already match.");
    return "OK:" + did.join(", ") + (notes.length ? " \u00b7 " + notes.join(" \u00b7 ") : "");
}
function nspRead() {
    var cfg = nspConfig(); if (!cfg) return "WARN:templates.json is missing from this version of the panel.";
    var seq = app.project.activeSequence; if (!seq) return "WARN:Open a sequence first.";
    var sel = nspSelected(cfg, seq); if (!sel.length) return "WARN:Select an Nscale clip in the timeline.";
    var w = nspWhat(cfg, sel[0]), values = {};
    for (var i = 0; i < w.tpl.fields.length; i++) { var v = nspGetValue(sel[0], w.tpl.fields[i]); if (v !== null) values[w.tpl.fields[i].param] = v; }
    return "TEXT:" + nspJSON({ id: w.tpl.id, name: sel[0].name, values: values });
}

function nsp_run(action, p) {
    p = p || {}; nspSetRoot(p.root);
    try {
        p = p || {};
        if (action === "debug") { var dcfg = nspConfig(), dfold = nspFolder(p.folder, dcfg), names = []; if (dfold) { var dl = dfold.getFiles(); for (var di = 0; di < dl.length; di++) names.push(dl[di].displayName); } var probe = dfold ? nspJoin(dfold, "Nscale - Title - 16x9.mogrt") : ""; var pf = probe ? new File(probe) : null; return "OK:" + names.length + " entries in " + (dfold ? dfold.fsName : "none") + " | probe " + (pf && pf.exists ? "found" : "MISSING") + " " + probe + " | first: " + names.slice(0, 3).join(", "); }
        if (action === "chooseFolder") { var f = Folder.selectDialog("Choose a Mogrts folder (only needed to override the templates shipped with the panel)"); return f ? "PATH:" + f.fsName : "WARN:No folder chosen."; }
        if (action === "state") return nspState(p);
        if (action === "add") return nspAdd(p);
        if (action === "update") return nspUpdate(p);
        if (action === "matchAll") return nspUpdate({ all: true, format: p.format, folder: p.folder });
        if (action === "read") return nspRead();
        return "WARN:Unknown action " + action;
    } catch (err) { return "WARN:Error: " + err.toString() + (err.line ? " (line " + err.line + ")" : ""); }
}
