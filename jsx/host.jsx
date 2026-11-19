// Nscale Motion \u2014 After Effects host script for the HTML panel (loaded by the shell from the content folder)
// Install: copy this file into
//   macOS:   /Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/
//   Windows: C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\
// Restart After Effects, then open it from the Window menu. It docks and resizes like any panel.
// For "Send to Claude": Settings > Scripting & Expressions > "Allow Scripts to Write Files and Access Network".
//
// Tabs
//   Timing & easing  Productive / Expressive, curves with icons and a live curve view (locked by default,
//                    unlock to edit), steps that retime and ease in one press, step and curve cycling,
//                    and keyframe label colours by curve type.
//   Stagger          Offset selected layers, or their selected keyframes, by a token step.
//   Toolkit          Null, Anchor point, Cloner (selected keyframes: copy, mirror there-and-back, reverse),
//                    Stagger, Review box, Modes (light / dark).
//   Library          The Nscale motion library, inside the panel.
//   Send to Claude   Renders a draft, a contact sheet and the look settings, with your notes, into the
//                    Drive inbox, versioned.
// Every action is one undo step.

// Where this content lives (set while the file loads): <version>/ae/jsx/host.jsx, so the version root is three levels up.
var NSM_ROOT = (function () { try { return File($.fileName).parent.parent.parent; } catch (e) { return null; } })();
// The extension folder itself (CSXS, jsx, assets ...). The panel sends it as p.root from CEP; $.fileName is the fallback.
var NSM_EXT = (function () { try { var f = File($.fileName); return f.exists ? f.parent.parent : null; } catch (e) { return null; } })();
function nsmSetExt(p) { if (p && p.root) { var d = new Folder(String(p.root).replace(/[\/\\]+$/, "")); if (d.exists) NSM_EXT = d; } }
// Run one of the scripts that ship with the panel (content/scripts). Names are fixed: letters, digits, _ and - only.
function runBundled(name) {
    if (!/^[A-Za-z0-9_\-]+\.jsx$/.test(String(name))) return "WARN:That isn't one of the panel's scripts.";
    if (!NSM_ROOT) return "WARN:Couldn't find the panel's scripts folder.";
    var f = new File(NSM_ROOT.fsName + "/scripts/" + name);
    if (!f.exists) { try { f = new File(File($.fileName).parent.parent.fsName + "/scripts/" + name); } catch (e) {} }   // panel installed on its own: scripts sit inside it
    if (!f.exists) return "WARN:" + name + " isn't in this version of the panel.";
    $.evalFile(f);
    return "OK:Ran " + name;
}

// ---- TOKENS (v1.0; keep in step with tokens.json and the Figma plugin) ----
var TOKENS = {
    steps: {
        xs:  { productive: { frames: 3,  ms: 50  }, expressive: { frames: 13,  ms: 217  } },
        s:   { productive: { frames: 8,  ms: 133 }, expressive: { frames: 21,  ms: 350  } },
        m:   { productive: { frames: 13, ms: 217 }, expressive: { frames: 34,  ms: 567  } },
        l:   { productive: { frames: 21, ms: 350 }, expressive: { frames: 55,  ms: 917  } },
        xl:  { productive: { frames: 34, ms: 567 }, expressive: { frames: 89,  ms: 1483 } },
        xxl: { productive: { frames: 55, ms: 917 }, expressive: { frames: 144, ms: 2400 } }
    },
    curves: {
        enter:  { productive: { name: "Quick settle",   bezier: [0.2, 0.8, 0.3, 1] },    expressive: { name: "Float",         bezier: [0.3, 0.3, 0.15, 1] } },
        exit:   { productive: { name: "Reverse settle", bezier: [0.7, 0, 0.8, 0.2] },    expressive: { name: "Reverse float", bezier: [0.85, 0, 0.7, 0.7] } },
        move:   { productive: { name: "Machined",       bezier: [0.65, 0, 0.35, 1] },    expressive: { name: "Drift",         bezier: [0.5, 0.13, 0.3, 1] } },
        line:   { productive: { name: "Hard stop",      bezier: [0.55, 0, 0.9, 0.55] },  expressive: { name: "Momentum",      bezier: [0.6, 0, 0.8, 0.5] } },
        settle: { productive: { name: "Carry settle",   bezier: [0.33, 0.67, 0.67, 1] }, expressive: { name: "Carry settle",  bezier: [0.33, 0.67, 0.67, 1] } }
    },
    // Proposals: measured from the mechanic-scale reference; not yet part of v1.0
    proposals: {
        mScale: { name: "Mechanic scale", bezier: [0.05, 0.1, 0.75, 0.3] },
        mPush:  { name: "Mechanic push",  bezier: [0.2, 0, 0.75, 0.15] },
        mEject: { name: "Mechanic eject", bezier: [0.3, 0.1, 0.8, 0.5] },
        mSnap:  { name: "Mechanic snap",  bezier: [0.6, 0.05, 0.9, 0.6] }
    }
};
// Keyframe label colour per curve type (After Effects label index), so the timeline is scannable
var LABELS = { enter: 9, exit: 1, move: 8, line: 2, settle: 14, proposal: 11 };
var LABEL_NAMES = { 9: "Green", 1: "Red", 8: "Blue", 2: "Yellow", 14: "Cyan", 11: "Orange" };
var LABEL_RGB = { 9: [0.30, 0.74, 0.30], 1: [0.85, 0.26, 0.24], 8: [0.27, 0.45, 0.88], 2: [0.90, 0.80, 0.25], 14: [0.25, 0.80, 0.85], 11: [0.95, 0.55, 0.20] };
// ---- END OF TOKENS ----

var STEP_ORDER = ["xs", "s", "m", "l", "xl", "xxl"];
var CURVE_ORDER = ["enter", "exit", "move", "line", "settle"];
var PROPOSAL_ORDER = ["mScale", "mPush", "mEject", "mSnap"];
var CURVE_ROLE = { enter: "Enter", exit: "Exit", move: "Move", line: "Line", settle: "Settle" };
var SETTINGS_SECTION = "NscaleMotionTokens";

// ---------- Maths: cubic-bezier -> AE speed / influence ----------
// A CSS cubic-bezier(x1, y1, x2, y2) maps exactly onto an AE keyframe pair:
//   out influence of key A = x1 \u00d7 100 %
//   out speed of key A     = (y1 / x1) \u00d7 average speed
//   in influence of key B  = (1 \u2212 x2) \u00d7 100 %
//   in speed of key B      = ((1 \u2212 y2) / (1 \u2212 x2)) \u00d7 average speed
// where average speed = value change \u00f7 duration.
function clampInfluence(x) {
    var v = x * 100;
    if (v < 0.1) v = 0.1;
    if (v > 100) v = 100;
    return v;
}

function bezierToEase(bez, delta, seconds) {
    var x1 = bez[0], y1 = bez[1], x2 = bez[2], y2 = bez[3];
    var avg = delta / seconds;
    var outSpeed = x1 > 0 ? (y1 / x1) * avg : 0;
    var inSpeed = (1 - x2) > 0 ? ((1 - y2) / (1 - x2)) * avg : 0;
    return {
        outSpeed: outSpeed, outInfluence: clampInfluence(x1),
        inSpeed: inSpeed, inInfluence: clampInfluence(1 - x2)
    };
}

// ---------- Property helpers ----------
function isSpatial(prop) {
    var t = prop.propertyValueType;
    return t === PropertyValueType.TwoD_SPATIAL || t === PropertyValueType.ThreeD_SPATIAL;
}

function supportedForEase(prop) {
    var t = prop.propertyValueType;
    return t === PropertyValueType.OneD || t === PropertyValueType.TwoD || t === PropertyValueType.ThreeD ||
           t === PropertyValueType.TwoD_SPATIAL || t === PropertyValueType.ThreeD_SPATIAL;
}

function supportedForRetime(prop) {
    var t = prop.propertyValueType;
    return t !== PropertyValueType.NO_VALUE && t !== PropertyValueType.CUSTOM_VALUE;
}

// Value change per eased dimension between two keys.
function deltasBetween(prop, k1, k2) {
    var a = prop.keyValue(k1), b = prop.keyValue(k2);
    if (prop.propertyValueType === PropertyValueType.OneD) return [b - a];
    if (isSpatial(prop)) {
        var sum = 0;
        for (var i = 0; i < a.length; i++) sum += (b[i] - a[i]) * (b[i] - a[i]);
        return [Math.sqrt(sum)];
    }
    var out = [];
    for (var j = 0; j < a.length; j++) out.push(b[j] - a[j]);
    return out;
}

function sortedSelectedKeys(prop) {
    var s = prop.selectedKeys.slice(0);
    s.sort(function (x, y) { return x - y; });
    return s;
}

// Every property, on every layer, with two or more selected keyframes. After Effects' own "selected properties"
// list often holds only one of them when keys are picked across properties or layers, so look at the keys directly.
function getTargets(comp) {
    var out = [];
    function walk(g) {
        for (var i = 1; i <= g.numProperties; i++) {
            var p = g.property(i);
            if (!p) continue;
            if (p.propertyType === PropertyType.PROPERTY) {
                try { if (p.numKeys > 1 && p.selectedKeys.length > 1) out.push(p); } catch (e) {}
            } else if (p.numProperties > 0) walk(p);
        }
    }
    for (var l = 1; l <= comp.numLayers; l++) walk(comp.layer(l));
    return out;
}
function targetSummary(targets) {
    var layers = {}, n = 0;
    for (var i = 0; i < targets.length; i++) { var L = targets[i].propertyGroup(targets[i].propertyDepth); if (!layers[L.index]) { layers[L.index] = 1; n++; } }
    return targets.length + " propert" + (targets.length === 1 ? "y" : "ies") + (n > 1 ? " on " + n + " layers" : "");
}

// ---------- Apply a curve between neighbouring selected keys ----------
function applyCurve(prop, bez, issues) {
    if (!supportedForEase(prop)) { issues.push(prop.name + ": curves can't be set on this kind of property (colour, path, text). Skipped."); return 0; }
    if (!prop.isInterpolationTypeValid(KeyframeInterpolationType.BEZIER)) { issues.push(prop.name + ": doesn't support bezier keyframes. Skipped."); return 0; }
    var sel = sortedSelectedKeys(prop);
    var pairs = 0;
    for (var i = 0; i < sel.length - 1; i++) {
        var k1 = sel[i], k2 = sel[i + 1];
        if (k2 !== k1 + 1) continue;
        var seconds = prop.keyTime(k2) - prop.keyTime(k1);
        if (seconds <= 0) continue;

        var deltas = deltasBetween(prop, k1, k2);
        var outEase = [], inEase = [];
        for (var d = 0; d < deltas.length; d++) {
            var e = bezierToEase(bez, deltas[d], seconds);
            outEase.push(new KeyframeEase(e.outSpeed, e.outInfluence));
            inEase.push(new KeyframeEase(e.inSpeed, e.inInfluence));
        }

        prop.setInterpolationTypeAtKey(k1, prop.keyInInterpolationType(k1), KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, prop.keyOutInterpolationType(k2));
        prop.setTemporalAutoBezierAtKey(k1, false);
        prop.setTemporalAutoBezierAtKey(k2, false);
        prop.setTemporalContinuousAtKey(k1, false);
        prop.setTemporalContinuousAtKey(k2, false);

        // Keep the side of each key that sits outside the pair as it was.
        prop.setTemporalEaseAtKey(k1, prop.keyInTemporalEase(k1), outEase);
        prop.setTemporalEaseAtKey(k2, inEase, prop.keyOutTemporalEase(k2));
        pairs++;
    }
    if (pairs === 0) issues.push(prop.name + ": select at least two neighbouring keyframes.");
    return pairs;
}

// ---------- Retime selected keys to a step ----------
function captureKey(prop, i) {
    var k = {
        value: prop.keyValue(i),
        inType: prop.keyInInterpolationType(i),
        outType: prop.keyOutInterpolationType(i),
        selected: prop.keySelected(i)
    };
    if (prop.isInterpolationTypeValid(KeyframeInterpolationType.BEZIER)) {
        k.inEase = prop.keyInTemporalEase(i);
        k.outEase = prop.keyOutTemporalEase(i);
        k.tContinuous = prop.keyTemporalContinuous(i);
        k.tAuto = prop.keyTemporalAutoBezier(i);
    }
    if (isSpatial(prop)) {
        k.inTan = prop.keyInSpatialTangent(i);
        k.outTan = prop.keyOutSpatialTangent(i);
        k.sContinuous = prop.keySpatialContinuous(i);
        k.sAuto = prop.keySpatialAutoBezier(i);
        k.roving = prop.keyRoving(i);
    }
    try { k.label = prop.keyLabel(i); } catch (e) {}
    return k;
}

function restoreKey(prop, time, k) {
    var i = prop.addKey(time);
    prop.setValueAtKey(i, k.value);
    prop.setInterpolationTypeAtKey(i, k.inType, k.outType);
    if (k.inEase) {
        prop.setTemporalContinuousAtKey(i, k.tContinuous);
        prop.setTemporalAutoBezierAtKey(i, k.tAuto);
        if (!k.tAuto) prop.setTemporalEaseAtKey(i, k.inEase, k.outEase);
    }
    if (k.inTan) {
        prop.setSpatialContinuousAtKey(i, k.sContinuous);
        prop.setSpatialAutoBezierAtKey(i, k.sAuto);
        if (!k.sAuto) prop.setSpatialTangentsAtKey(i, k.inTan, k.outTan);
    }
    if (k.label !== undefined) { try { prop.setLabelAtKey(i, k.label); } catch (e) {} }
    return i;
}

// Spaces neighbouring selected keys `stepSeconds` apart, starting from the first selected key.
// Gaps in the selection keep their own spacing, so keys 1\u20132 and 4\u20135 can be retimed in one press.
// Keys after the selection move along by the same amount so nothing overlaps.
// Every key is put back with its own value, eases, tangents, label and selection.
function retime(prop, stepSeconds, issues) {
    if (!supportedForRetime(prop)) { issues.push(prop.name + ": can't be retimed. Skipped."); return false; }
    var sel = sortedSelectedKeys(prop), n = prop.numKeys, isSel = {};
    if (sel.length < 2) return false;
    for (var s = 0; s < sel.length; s++) isSel[sel[s]] = true;
    var first = sel[0], old = {}, newTimes = {}, changed = false;
    for (var a = first; a <= n; a++) old[a] = prop.keyTime(a);
    newTimes[first] = old[first];
    for (var b = first + 1; b <= n; b++) {
        newTimes[b] = newTimes[b - 1] + ((isSel[b] && isSel[b - 1]) ? stepSeconds : old[b] - old[b - 1]);
        if (Math.abs(newTimes[b] - old[b]) > 1e-6) changed = true;
    }
    if (!changed) return true;

    var saved = [];
    for (var i = first + 1; i <= n; i++) saved.push({ time: newTimes[i], key: captureKey(prop, i) });
    for (var r = n; r > first; r--) prop.removeKey(r);
    var restored = [];
    for (var j = 0; j < saved.length; j++) {
        var idx = restoreKey(prop, saved[j].time, saved[j].key);
        prop.setSelectedAtKey(idx, saved[j].key.selected);
        restored.push(idx);
    }
    // Roving needs its neighbours in place, so it goes back on last.
    for (var q = 0; q < saved.length; q++) {
        if (saved[q].key.roving) { try { prop.setRovingAtKey(restored[q], true); } catch (e2) {} }
    }
    prop.setSelectedAtKey(first, true);
    return true;
}


// ---------- Small helpers ----------
// custom-drawn groups can't be notified; hiding and showing them makes ScriptUI call onDraw again
function redraw(el) { try { el.hide(); el.show(); } catch (e) {} }
function getSetting(k, d) { try { if (app.settings.haveSetting(SETTINGS_SECTION, k)) return app.settings.getSetting(SETTINGS_SECTION, k); } catch (e) {} return d; }
function setSetting(k, v) { try { app.settings.saveSetting(SETTINGS_SECTION, k, String(v)); } catch (e) {} }
function fmt(v) { return String(Math.round(v * 100) / 100); }
function bezStr(b) { return fmt(b[0]) + ", " + fmt(b[1]) + ", " + fmt(b[2]) + ", " + fmt(b[3]); }
function sameBez(a, b) { for (var i = 0; i < 4; i++) if (Math.abs(a[i] - b[i]) > 0.0005) return false; return true; }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "comp"; }
function q(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n") + '"'; }
function js(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return isFinite(v) ? String(Math.round(v * 10000) / 10000) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return q(v);
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(js(v[i])); return "[" + a.join(",") + "]"; }
    if (typeof v === "function") return "null";
    if (v instanceof Date) return q(v.toString());
    // only open plain objects the panel built itself; After Effects objects are never walked (some crash when read)
    if (v.constructor !== Object) { try { return q("(" + (v.reflect ? v.reflect.name : "object") + ")"); } catch (e0) { return q("(object)"); } }
    var o = []; for (var k in v) { try { if (v.hasOwnProperty(k) && typeof v[k] !== "function") o.push(q(k) + ":" + js(v[k])); } catch (e) {} } return "{" + o.join(",") + "}";
}

// ---------- Curve edits: per moment and curve, kept between sessions ----------
// stored as "productive.enter=0.2,0.8,0.3,1;expressive.move=..."
var EDITS = (function () {
    var out = {}, raw = getSetting("edits", "");
    if (raw) { var parts = raw.split(";"); for (var i = 0; i < parts.length; i++) { var kv = parts[i].split("="); if (kv.length === 2) { var n = kv[1].split(","); if (n.length === 4) out[kv[0]] = [+n[0], +n[1], +n[2], +n[3]]; } } }
    return out;
})();
function saveEdits() { var a = []; for (var k in EDITS) if (EDITS.hasOwnProperty(k)) a.push(k + "=" + EDITS[k].join(",")); setSetting("edits", a.join(";")); }
function curveDef(mode, id) { return TOKENS.curves[id] ? TOKENS.curves[id][mode] : TOKENS.proposals[id]; }
function curveBez(mode, id) { var e = EDITS[mode + "." + id]; return e ? e : curveDef(mode, id).bezier; }
function curveEdited(mode, id) { return !!EDITS[mode + "." + id]; }
function labelFor(id) { return TOKENS.curves[id] ? LABELS[id] : LABELS.proposal; }

// ---------- Keyframe labels ----------
function labelSelectedSegments(prop, label) {
    var sel = sortedSelectedKeys(prop);
    for (var i = 0; i < sel.length - 1; i++) {
        if (sel[i + 1] !== sel[i] + 1) continue;
        // the outgoing key of each eased segment carries the colour of its curve
        try { prop.setLabelAtKey(sel[i], label); } catch (e) {}
    }
}

// ---------- Step helpers ----------
// spacing of the first pair of neighbouring selected keys (what Step \u2212 / + count from)
function currentSpacing(p) {
    var sel = sortedSelectedKeys(p);
    for (var i = 0; i < sel.length - 1; i++) if (sel[i + 1] === sel[i] + 1) return p.keyTime(sel[i + 1]) - p.keyTime(sel[i]);
    return p.keyTime(sel[1]) - p.keyTime(sel[0]);
}
function stepSeconds(comp, key, mode, snap) {
    var s = TOKENS.steps[key][mode].ms / 1000;
    if (snap) s = Math.max(1, Math.round(s / comp.frameDuration)) * comp.frameDuration;
    return s;
}
function nearestStepIndex(seconds, mode) {
    var best = 0, bd = 1e9;
    for (var i = 0; i < STEP_ORDER.length; i++) { var d = Math.abs(TOKENS.steps[STEP_ORDER[i]][mode].ms / 1000 - seconds); if (d < bd) { bd = d; best = i; } }
    return best;
}

// ---------- Stagger ----------
function layerX(L) { try { var p = L.property("ADBE Transform Group").property("ADBE Position"); var v = p.dimensionsSeparated ? [L.property("ADBE Transform Group").property("ADBE Position_0").value] : p.value; return v[0]; } catch (e) { return 0; } }
function orderLayers(layers, how, comp) {
    var a = layers.slice(0);
    if (how === "stack") a.sort(function (x, y) { return x.index - y.index; });
    else if (how === "ltr") a.sort(function (x, y) { return layerX(x) - layerX(y); });
    else if (how === "rtl") a.sort(function (x, y) { return layerX(y) - layerX(x); });
    else if (how === "centre") { var c = comp.width / 2; a.sort(function (x, y) { return Math.abs(layerX(x) - c) - Math.abs(layerX(y) - c); }); }
    return a;
}
function staggerOffsets(n, stepS, spacing, mode, comp, easeBez) {
    var out = [0];
    if (spacing === "growing") {
        // each gap one step longer: xs, s, m, l\u2026 starting from the chosen step
        var start = 0; for (var s = 0; s < STEP_ORDER.length; s++) if (Math.abs(TOKENS.steps[STEP_ORDER[s]][mode].ms / 1000 - stepS) < 0.02) start = s;
        for (var i = 1; i < n; i++) { var k = STEP_ORDER[Math.min(STEP_ORDER.length - 1, start + i - 1)]; out.push(out[i - 1] + stepSeconds(comp, k, mode, true)); }
    } else if (spacing === "eased" && n > 1) {
        // same total spread as even spacing, distributed along the selected curve
        var total = stepS * (n - 1);
        for (var j = 1; j < n; j++) out.push(total * bezierY(easeBez, j / (n - 1)));
    } else for (var e = 1; e < n; e++) out.push(stepS * e);
    for (var r = 0; r < out.length; r++) out[r] = Math.round(out[r] / comp.frameDuration) * comp.frameDuration;
    return out;
}
function bezierY(b, x) {   // evaluate a cubic-bezier easing at progress x
    var cx = 3 * b[0], bx = 3 * (b[2] - b[0]) - cx, ax = 1 - cx - bx, cy = 3 * b[1], by = 3 * (b[3] - b[1]) - cy, ay = 1 - cy - by, t = x;
    for (var i = 0; i < 12; i++) { var ex = ((ax * t + bx) * t + cx) * t - x, d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(ex) < 1e-6 || d === 0) break; t -= ex / d; }
    t = Math.max(0, Math.min(1, t)); return ((ay * t + by) * t + cy) * t;
}
function shiftSelectedKeys(layer, delta) {
    var moved = 0;
    function walk(g) {
        for (var i = 1; i <= g.numProperties; i++) {
            var p = g.property(i); if (!p) continue;
            if (p.propertyType === PropertyType.PROPERTY) {
                if (p.numKeys > 0 && p.selectedKeys.length > 0 && supportedForRetime(p)) {
                    var sel = sortedSelectedKeys(p), saved = [];
                    for (var s = 0; s < sel.length; s++) saved.push({ t: p.keyTime(sel[s]) + delta, k: captureKey(p, sel[s]) });
                    for (var r = sel.length - 1; r >= 0; r--) p.removeKey(sel[r]);
                    for (var a = 0; a < saved.length; a++) { var idx = restoreKey(p, saved[a].t, saved[a].k); p.setSelectedAtKey(idx, true); moved++; }
                }
            } else walk(p);
        }
    }
    walk(layer);
    return moved;
}

// ---------- Send to Claude ----------
// Text layers: a plain summary, each field read on its own, because After Effects throws for fields that don't apply
// (asking point text for its box size gives "Text document not of Box document type" and stopped the whole send)
function textSummary(doc) {
    var out = {}, F = ["text", "font", "fontSize", "fillColor", "strokeColor", "strokeWidth", "applyFill", "applyStroke", "tracking", "leading", "allCaps", "smallCaps", "baselineShift", "justification"];
    for (var i = 0; i < F.length; i++) { try { var v = doc[F[i]]; if (v !== undefined && typeof v !== "function") out[F[i]] = (F[i] === "justification") ? String(v) : v; } catch (e) {} }
    try { if (doc.boxText) { out.boxText = true; out.boxTextSize = doc.boxTextSize; try { out.boxTextPos = doc.boxTextPos; } catch (e1) {} } else out.pointText = true; } catch (e2) {}
    return out;
}
function readProp(p) {
    var out = { name: p.name, match: p.matchName };
    try {
        if (p.propertyValueType === PropertyValueType.NO_VALUE || p.propertyValueType === PropertyValueType.CUSTOM_VALUE) { out.value = "(not readable by script)"; return out; }
        var isText = p.propertyValueType === PropertyValueType.TEXT_DOCUMENT;
        out.value = p.propertyValueType === PropertyValueType.SHAPE ? "(shape)" : isText ? textSummary(p.value) : p.value;
        if (p.expression) { out.expression = p.expression; out.expressionEnabled = p.expressionEnabled; if (p.expressionError) { out.expressionError = p.expressionError; ERRORS.push({ layer: CUR_LAYER, property: p.name, error: p.expressionError }); } }
        if (p.numKeys > 0) {
            out.keys = [];
            for (var k = 1; k <= p.numKeys; k++) {
                var key = { t: p.keyTime(k), v: p.propertyValueType === PropertyValueType.SHAPE ? "(shape)" : isText ? textSummary(p.keyValue(k)) : p.keyValue(k) };
                try { var ei = p.keyInTemporalEase(k), eo = p.keyOutTemporalEase(k); key.easeIn = [ei[0].speed, ei[0].influence]; key.easeOut = [eo[0].speed, eo[0].influence]; } catch (e) {}
                try { key.label = p.keyLabel(k); } catch (e2) {}
                out.keys.push(key);
            }
        }
    } catch (e3) { out.error = String(e3); }
    return out;
}
// Pseudo effects (custom controls from scripts and presets) can crash After Effects when read if their plugin is
// missing, and no error can catch a crash, so they're listed by name only.
function isPseudo(p) { try { return /^Pseudo\//.test(p.matchName); } catch (e) { return true; } }
function walkGroup(g, depth) {
    var out = { name: g.name, match: g.matchName, props: [] };
    for (var i = 1; i <= g.numProperties; i++) {
        var p = g.property(i); if (!p) continue;
        if (isPseudo(p)) { out.props.push({ name: p.name, match: "(pseudo effect, settings not read)" }); continue; }
        if (p.propertyType === PropertyType.PROPERTY) { if (p.isModified || p.numKeys > 0) out.props.push(readProp(p)); }
        else if (depth < 8) { var c = walkGroup(p, depth + 1); if (c.props.length) out.props.push(c); }
    }
    return out;
}
var ERRORS = [], CUR_LAYER = "", LAST_ERRORS = [], LAST_WARNINGS = [];
function lookJSON(comp, note, mode) {
    ERRORS = [];
    var data = { comp: comp.name, size: [comp.width, comp.height], fps: comp.frameRate, workArea: [comp.workAreaStart, comp.workAreaDuration], moment: mode, note: note, edits: EDITS, sent: new Date().toString(), layers: [] };
    for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i), o = { index: i, name: L.name, enabled: L.enabled, inPoint: L.inPoint, outPoint: L.outPoint, startTime: L.startTime }; CUR_LAYER = L.name;
        try { o.blend = L.blendingMode; o.adjustment = L.adjustmentLayer; o.threeD = L.threeDLayer; if (L.trackMatteLayer) o.matteLayer = L.trackMatteLayer.name; } catch (e) {}
        try { if (L.parent) o.parent = L.parent.name; if (L.source && L.source instanceof CompItem) o.precomp = L.source.name; } catch (e2) {}
        var groups = [["styles", "ADBE Layer Styles"], ["effects", "ADBE Effect Parade"], ["masks", "ADBE Mask Parade"], ["transform", "ADBE Transform Group"], ["contents", "ADBE Root Vectors Group"], ["text", "ADBE Text Properties"]];
        for (var g = 0; g < groups.length; g++) { var grp = L.property(groups[g][1]); if (grp) { var w = walkGroup(grp, 0); if (w.props.length) o[groups[g][0]] = w; } }
        data.layers.push(o);
    }
    // missing footage and effects the scripting interface reports as broken
    var warnings = [];
    for (var w = 1; w <= comp.numLayers; w++) { var Lw = comp.layer(w); try { if (Lw.source && Lw.source.footageMissing) warnings.push(Lw.name + ": footage missing"); } catch (e) {} }
    data.errors = ERRORS; data.warnings = warnings;
    LAST_ERRORS = ERRORS; LAST_WARNINGS = warnings;
    return js(data);
}
function cleanTemp(folder, stem) {
    try { var fs = folder.getFiles(stem + ".*.m4v"); for (var i = 0; i < fs.length; i++) if (fs[i].length === 0) fs[i].remove(); } catch (e) {}
}
function nextVersion(folder, base) {
    var files = folder.getFiles(base + "_v*"), max = 0;
    for (var i = 0; i < files.length; i++) { var m = decodeURI(files[i].name).match(/_v(\d+)/); if (m) max = Math.max(max, +m[1]); }
    return max + 1;
}
// contact sheet: a temporary comp holding time-shifted copies of the comp in a grid, saved as one PNG
function contactSheet(comp, count, file) {
    var cols = 4, rows = Math.ceil(count / cols), cellW = 480, cellH = Math.round(cellW * comp.height / comp.width), gap = 24, top = 40;
    var W = cols * cellW + (cols + 1) * gap, H = rows * (cellH + top) + (rows + 1) * gap;
    var sheet = app.project.items.addComp("_claude_sheet", W, H, 1, comp.frameDuration * 2, comp.frameRate);
    sheet.bgColor = [0.08, 0.08, 0.08];
    var a = comp.workAreaStart, d = comp.workAreaDuration;
    for (var i = 0; i < count; i++) {
        var t = a + d * i / Math.max(1, count - 1); if (i === count - 1) t = a + d - comp.frameDuration;
        var col = i % cols, row = Math.floor(i / cols), x = gap + col * (cellW + gap), y = gap + row * (cellH + top + gap) + top;
        var L = sheet.layers.add(comp); L.startTime = -t; L.property("ADBE Transform Group").property("ADBE Scale").setValue([100 * cellW / comp.width, 100 * cellW / comp.width]);
        L.property("ADBE Transform Group").property("ADBE Position").setValue([x + cellW / 2, y + cellH / 2]);
        var T = sheet.layers.addText("f" + Math.round(t / comp.frameDuration) + "   " + (Math.round(t * 100) / 100) + " s");
        var td = T.property("ADBE Text Properties").property("ADBE Text Document"), doc = td.value; doc.fontSize = 22; doc.fillColor = [0.85, 0.85, 0.85]; doc.applyFill = true; doc.justification = ParagraphJustification.LEFT_JUSTIFY; td.setValue(doc);
        T.property("ADBE Transform Group").property("ADBE Position").setValue([x, y - 12]);
    }
    var ok = true;
    try { sheet.saveFrameToPng(0, file); } catch (e) { ok = false; }
    sheet.remove();
    return ok;
}
function renderDraft(comp, file) {
    var rq = app.project.renderQueue, item = rq.items.add(comp), ok = false;
    try {
        try { item.setSettings({ "Resolution": [2, 2] }); } catch (e) {}
        var om = item.outputModule(1), names = om.templates, pick = null;
        for (var i = 0; i < names.length; i++) if (/H\.264/i.test(names[i])) { pick = names[i]; break; }
        if (!pick) { item.remove(); return "no H.264 output template found"; }
        om.applyTemplate(pick); om.file = file;
        rq.render(); ok = true;
    } catch (e2) { try { item.remove(); } catch (e3) {} return String(e2); }
    try { item.remove(); } catch (e4) {}
    return ok ? "" : "render failed";
}



// ---------- Scripts from Claude: find and run the newest script in the Drive Scripts folder ----------
function listScripts(folder, depth, out) {
    var items = folder.getFiles();
    for (var i = 0; i < items.length; i++) {
        var f = items[i];
        if (f instanceof Folder) { if (depth < 3 && f.name.charAt(0) !== ".") listScripts(f, depth + 1, out); }
        else if (/\.jsx(bin)?$/i.test(decodeURI(f.name))) out.push(f);
    }
    return out;
}
function runLatestScript(path) {
    var folder = path ? new Folder(path) : null;
    if (!folder || !folder.exists) return "WARN:Choose the Scripts folder first.";
    var all = listScripts(folder, 0, []);
    if (!all.length) return "WARN:No scripts in that folder yet.";
    all.sort(function (a, b) { return b.modified.getTime() - a.modified.getTime(); });   // ExtendScript can't subtract Dates
    var top = all.slice(0, 5);
    // pick from the newest five (newest selected), in case Drive hasn't finished syncing the latest one
    var w = new Window("dialog", "Run a script");
    w.alignChildren = ["fill", "top"];
    w.add("statictext", undefined, "Newest scripts in " + decodeURI(folder.name) + ":");
    var list = w.add("listbox", undefined, [], { numberOfColumns: 2, showHeaders: true, columnTitles: ["Script", "Modified"], columnWidths: [300, 150] });
    for (var i = 0; i < top.length; i++) {
        var it = list.add("item", decodeURI(top[i].name));
        it.subItems[0].text = top[i].modified.toLocaleString ? top[i].modified.toLocaleString() : String(top[i].modified);
    }
    list.selection = 0; list.preferredSize = [470, 22 * top.length + 30];
    w.add("statictext", undefined, "Not seeing the newest one? Google Drive may still be syncing it.");
    var b = w.add("group"); b.alignment = "right";
    b.add("button", undefined, "Cancel", { name: "cancel" }); b.add("button", undefined, "Run", { name: "ok" });
    list.onDoubleClick = function () { w.close(1); };
    if (w.show() !== 1 || !list.selection) return "WARN:Cancelled.";
    var f = top[list.selection.index], name = decodeURI(f.name);
    try { $.evalFile(f); } catch (err) { return "WARN:" + name + " stopped: " + err.toString() + (err.line ? " (line " + err.line + ")" : ""); }
    return "OK:Ran " + name;
}

// ---------- Beats: insert a hold of one token step at the last selected key on each property ----------
// The selected key's value is held for the step, then the animation carries on exactly as before, later.
// Works across properties and layers; needs only one selected key per property.
// Uses the same captureKey / restoreKey as retiming, so every value, ease, tangent and label comes back as it was.
function beatTargets(comp) {
    var out = [];
    function walk(g) {
        for (var i = 1; i <= g.numProperties; i++) {
            var p = g.property(i); if (!p) continue;
            if (p.propertyType === PropertyType.PROPERTY) { try { if (p.numKeys > 0 && p.selectedKeys.length > 0) out.push(p); } catch (e) {} }
            else if (p.numProperties > 0) walk(p);
        }
    }
    for (var l = 1; l <= comp.numLayers; l++) walk(comp.layer(l));
    return out;
}
function zeroEase(e) { var o = []; for (var i = 0; i < e.length; i++) o.push(new KeyframeEase(0, e[i].influence)); return o; }
function copyKey(k) { var c = {}; for (var x in k) if (k.hasOwnProperty(x)) c[x] = k[x]; return c; }
function addBeat(p, secs) {
    if (!supportedForRetime(p)) return false;
    var sel = sortedSelectedKeys(p); if (!sel.length) return false;
    var k = sel[sel.length - 1], heldT = p.keyTime(k), held = captureKey(p, k), later = [];
    for (var n = k + 1; n <= p.numKeys; n++) later.push({ time: p.keyTime(n) + secs, key: captureKey(p, n) });
    for (var r = p.numKeys; r > k; r--) p.removeKey(r);
    // the held key stops dead (zero out-speed) so the hold reads as a beat; its own arrival is unchanged
    if (held.outEase) {
        try { p.setTemporalContinuousAtKey(k, false); p.setTemporalAutoBezierAtKey(k, false); p.setTemporalEaseAtKey(k, held.inEase, zeroEase(held.outEase)); } catch (e) {}
    }
    // the copy at the end of the beat starts from rest and leaves exactly as the original key used to
    var copy = copyKey(held);
    if (held.inEase) { copy.inEase = zeroEase(held.inEase); copy.tAuto = false; copy.tContinuous = false; }
    copy.roving = false;
    var newT = heldT + secs;
    restoreKey(p, newT, copy);
    var placed = [];
    for (var m = 0; m < later.length; m++) placed.push(restoreKey(p, later[m].time, later[m].key));
    for (var v = 0; v < later.length; v++) if (later[v].key.roving) { try { p.setRovingAtKey(placed[v], true); } catch (e2) {} }
    for (var q = 1; q <= p.numKeys; q++) p.setSelectedAtKey(q, Math.abs(p.keyTime(q) - newT) < 1e-4);   // select the new key so beats can stack
    return true;
}

// ---------- Null ----------
function uniqueLayerName(comp, base) {
    var name = base, n = 2, taken = {};
    for (var i = 1; i <= comp.numLayers; i++) taken[comp.layer(i).name] = true;
    while (taken[name]) name = base + " " + n++;
    return name;
}
function selectedLayerList(comp) { var a = []; for (var i = 0; i < comp.selectedLayers.length; i++) a.push(comp.selectedLayers[i]); return a; }
// A null at the centre of the selected layers (their anchor points, as seen in the comp), above the topmost one.
// Parent: selected layers that have no parent yet are parented to it; layers that already have a parent keep it.
function makeNull(comp, parentSel) {
    var sel = selectedLayerList(comp), any3D = false, top = null;
    for (var i = 0; i < sel.length; i++) { if (sel[i].threeDLayer) any3D = true; if (!top || sel[i].index < top.index) top = sel[i]; }
    var N = comp.layers.addNull();
    N.name = uniqueLayerName(comp, "Nscale null");
    if (any3D) N.threeDLayer = true;
    var pos = N.property("ADBE Transform Group").property("ADBE Position");
    if (sel.length) {
        var ids = []; for (var j = 0; j < sel.length; j++) ids.push(sel[j].index);
        // let After Effects work out each layer's anchor point in comp space (handles parents, scale and rotation)
        pos.expression = "var ids = [" + ids.join(",") + "], s = [0, 0, 0];\n" +
            "for (var i = 0; i < ids.length; i++) { var L = thisComp.layer(ids[i]); var c = L.toComp(L.anchorPoint); s = s + [c[0], c[1], c.length > 2 ? c[2] : 0]; }\n" +
            "s = s / ids.length;\nvalue.length > 2 ? s : [s[0], s[1]];";
        var v = pos.valueAtTime(comp.time, false), bad = !!pos.expressionError;
        pos.expression = "";
        if (!bad) pos.setValue(v);
        N.moveBefore(top);
    }
    var parented = 0, kept = 0;
    if (parentSel) for (var k = 0; k < sel.length; k++) { if (sel[k].parent) kept++; else { sel[k].parent = N; parented++; } }
    for (var d = 0; d < sel.length; d++) sel[d].selected = false;
    N.selected = true;
    return "OK:" + N.name + (sel.length ? " at the centre of " + sel.length + " layer" + (sel.length === 1 ? "" : "s") : " at the comp centre") +
        (parentSel && sel.length ? " \u00b7 parented " + parented + (kept ? " \u00b7 " + kept + " already had a parent, left as they were" : "") : "");
}

// ---------- Position helpers (anchor point) ----------
function addVec(a, d) { if (!(a instanceof Array)) return a + d[0]; var o = a.slice(0); o[0] += d[0]; o[1] += d[1]; return o; }
function shiftProp(p, d) {
    if (p.numKeys > 0) { for (var k = 1; k <= p.numKeys; k++) p.setValueAtKey(k, addVec(p.keyValue(k), d)); }
    else p.setValue(addVec(p.value, d));
}

// =====================================================================================================
// 2.3 additions: anchor point, cloner mirror / reverse, read curve from keys, review box, theme modes,
// notes saved in the project, render presets
// =====================================================================================================

// ---------- Anchor point ----------
// Moves each selected layer's anchor point to a point on its own bounds (corners, middle of a side, centre)
// without the layer moving: Position is shifted by the same amount, through the layer's scale and rotation.
// point: "tl","t","tr","l","c","r","bl","b","br"
function layerBounds(L, t) {
    try {
        if (L instanceof ShapeLayer || L instanceof TextLayer) { var r = L.sourceRectAtTime(t, false); return [r.left, r.top, r.width, r.height]; }
        if (L.source && L.source.width) return [0, 0, L.source.width, L.source.height];
    } catch (e) {}
    return null;
}
function anchorFor(b, point) {
    var fx = { tl: 0, t: 0.5, tr: 1, l: 0, c: 0.5, r: 1, bl: 0, b: 0.5, br: 1 }[point], fy = { tl: 0, t: 0, tr: 0, l: 0.5, c: 0.5, r: 0.5, bl: 1, b: 1, br: 1 }[point];
    if (fx === undefined) { fx = 0.5; fy = 0.5; }
    return [b[0] + b[2] * fx, b[1] + b[3] * fy];
}
function setAnchor(comp, point) {
    var sel = selectedLayerList(comp), done = 0, notes = [];
    if (!sel.length) return "WARN:Select the layers to re-anchor.";
    for (var i = 0; i < sel.length; i++) {
        var L = sel[i], tg = L.property("ADBE Transform Group"), b = layerBounds(L, comp.time);
        if (!tg || !b) { notes.push(L.name + ": no size to anchor to"); continue; }
        var A = tg.property("ADBE Anchor Point");
        if (A.numKeys > 0 || A.expression) { notes.push(L.name + ": anchor point is animated or has an expression, left alone"); continue; }
        var oldA = A.value, target = anchorFor(b, point), d = [target[0] - oldA[0], target[1] - oldA[1]];
        if (Math.abs(d[0]) < 1e-4 && Math.abs(d[1]) < 1e-4) { done++; continue; }
        var sc = tg.property("ADBE Scale").valueAtTime(comp.time, false), rz = 0;
        try { rz = tg.property("ADBE Rotate Z").valueAtTime(comp.time, false); } catch (e) {}
        var th = rz * Math.PI / 180, sx = sc[0] / 100, sy = sc[1] / 100;
        var dp = [Math.cos(th) * d[0] * sx - Math.sin(th) * d[1] * sy, Math.sin(th) * d[0] * sx + Math.cos(th) * d[1] * sy];
        var nA = oldA.slice(0); nA[0] = target[0]; nA[1] = target[1]; A.setValue(nA);
        var P = tg.property("ADBE Position");
        if (P.dimensionsSeparated) { shiftProp(tg.property("ADBE Position_0"), [dp[0]]); shiftProp(tg.property("ADBE Position_1"), [dp[1]]); }
        else if (P.expression) notes.push(L.name + ": Position has an expression, so the layer may jump");
        else shiftProp(P, dp);
        if (L.threeDLayer) notes.push(L.name + ": 3D, only Z rotation is accounted for");
        if (tg.property("ADBE Scale").numKeys > 0 || (tg.property("ADBE Rotate Z") && tg.property("ADBE Rotate Z").numKeys > 0)) notes.push(L.name + ": scale or rotation is animated, matched at the playhead");
        done++;
    }
    var names = { tl: "top left", t: "top middle", tr: "top right", l: "left middle", c: "centre", r: "right middle", bl: "bottom left", b: "bottom middle", br: "bottom right" };
    return "OK:Anchor at " + (names[point] || "centre") + " on " + done + " layer" + (done === 1 ? "" : "s") + (notes.length ? " \u00b7 " + notes.join("; ") : "");
}

// ---------- Cloner: keyframes ----------
// Works on the selected keyframes of every property, across layers. Values, eases, tangents and labels come along.
//   simple   a copy of the selected keys, after them (a step apart if you like) or at the playhead
//   mirror   the selected keys played back the other way after the last one (there and back), with an optional
//            hold before the return
//   reverse  the selected keys reversed in place: same span, order flipped, eases swapped
function swappedKey(k) {
    var K = copyKey(k), tmp;
    tmp = K.inType; K.inType = K.outType; K.outType = tmp;
    if (K.inEase) { tmp = K.inEase; K.inEase = K.outEase; K.outEase = tmp; }
    if (K.inTan) { tmp = K.inTan; K.inTan = K.outTan; K.outTan = tmp; }
    K.roving = false;
    return K;
}
function cloneKeysOn(p, o, comp, gap) {
    if (!supportedForRetime(p)) return 0;
    var sel = sortedSelectedKeys(p); if (!sel.length) return 0;
    var a = p.keyTime(sel[0]), b = p.keyTime(sel[sel.length - 1]), fd = comp.frameDuration, saved = [], i, times = [], kind = o.kind || "simple";
    for (i = 0; i < sel.length; i++) saved.push({ t: p.keyTime(sel[i]), k: captureKey(p, sel[i]) });
    if (kind === "reverse") {
        if (sel.length < 2) return 0;
        for (i = sel.length - 1; i >= 0; i--) p.removeKey(sel[i]);
        for (i = 0; i < saved.length; i++) { times.push(a + b - saved[i].t); restoreKey(p, a + b - saved[i].t, swappedKey(saved[i].k)); }
    } else if (kind === "mirror") {
        if (sel.length < 2) return 0;
        // the last key is the turn: it's repeated as the start of the return only when there's a hold
        for (i = saved.length - (gap > 0 ? 1 : 2); i >= 0; i--) { var tm = b + gap + (b - saved[i].t); times.push(tm); restoreKey(p, tm, swappedKey(saved[i].k)); }
    } else {
        var start = o.place === "playhead" ? comp.time : b + Math.max(gap, fd);   // never on top of the last key
        for (i = 0; i < saved.length; i++) { var t2 = start + (saved[i].t - a); times.push(t2); restoreKey(p, t2, saved[i].k); }
    }
    // the new keys end up selected, so pressing again carries on from them
    for (var r = 1; r <= p.numKeys; r++) {
        var on = false;
        for (var t = 0; t < times.length; t++) if (Math.abs(p.keyTime(r) - times[t]) < 1e-4) on = true;
        p.setSelectedAtKey(r, on);
    }
    return times.length;
}
function cloneKeys(comp, o) {
    var props = beatTargets(comp), n = 0, used = 0, gap = o.step ? stepSeconds(comp, o.step, o.mode, true) : 0, kind = o.kind || "simple";
    if (!props.length) return "WARN:Select the keyframes to clone.";
    for (var i = 0; i < props.length; i++) { var c = cloneKeysOn(props[i], o, comp, gap); if (c) { n += c; used++; } }
    if (!n) return "WARN:" + (kind === "simple" ? "Nothing to clone." : "Select two or more keyframes on a property.");
    var what = { simple: "Copied", mirror: "Mirrored", reverse: "Reversed" }[kind];
    var where = kind === "reverse" ? "in place" : kind === "mirror" ? (gap ? "back to the start after a " + o.step + " hold" : "straight back to the start")
        : (o.place === "playhead" ? "at the playhead" : (gap ? o.step + " after the selection" : "right after the selection"));
    return "OK:" + what + " the keyframes on " + used + " propert" + (used === 1 ? "y" : "ies") + ", " + where + (kind === "reverse" ? "" : " \u00b7 the new keys are selected");
}

// ---------- Read the curve on the selected keys ----------
// Turns the first selected pair's eases back into cubic-bezier numbers (the inverse of bezierToEase).
function readCurve(comp) {
    var targets = getTargets(comp);
    if (!targets.length) return "WARN:Select two neighbouring keyframes to read their curve.";
    for (var t = 0; t < targets.length; t++) {
        var p = targets[t], sel = sortedSelectedKeys(p);
        for (var i = 0; i < sel.length - 1; i++) {
            var k1 = sel[i], k2 = sel[i + 1];
            if (k2 !== k1 + 1) continue;
            var T = p.keyTime(k2) - p.keyTime(k1), frames = Math.round(T / comp.frameDuration), L = p.propertyGroup(p.propertyDepth);
            var where = L.name + " > " + p.name;
            if (p.keyOutInterpolationType(k1) === KeyframeInterpolationType.HOLD) return "CURVE:hold|" + where + "|" + frames;
            if (p.keyOutInterpolationType(k1) === KeyframeInterpolationType.LINEAR && p.keyInInterpolationType(k2) === KeyframeInterpolationType.LINEAR) return "CURVE:0,0,1,1|" + where + "|" + frames;
            if (!supportedForEase(p)) continue;
            var d = deltasBetween(p, k1, k2), di = 0;
            for (var j = 1; j < d.length; j++) if (Math.abs(d[j]) > Math.abs(d[di])) di = j;
            var delta = d[di];
            if (Math.abs(delta) < 1e-9) continue;
            var eo = p.keyOutTemporalEase(k1)[Math.min(di, p.keyOutTemporalEase(k1).length - 1)], ei = p.keyInTemporalEase(k2)[Math.min(di, p.keyInTemporalEase(k2).length - 1)];
            var avg = delta / T, x1 = eo.influence / 100, x2 = 1 - ei.influence / 100;
            var y1 = x1 > 0 ? (eo.speed / avg) * x1 : 0, y2 = (1 - x2) > 0 ? 1 - (ei.speed / avg) * (1 - x2) : 1;
            if (p.keyOutInterpolationType(k1) === KeyframeInterpolationType.LINEAR) { x1 = 0; y1 = 0; }
            if (p.keyInInterpolationType(k2) === KeyframeInterpolationType.LINEAR) { x2 = 1; y2 = 1; }
            return "CURVE:" + [x1, y1, x2, y2].join(",") + "|" + where + "|" + frames;
        }
    }
    return "WARN:Couldn't read a curve: select two neighbouring keyframes on a number or position property.";
}

// ---------- Review box ----------
// A small, clearly-not-design box in a corner that reads the animation live: name, version, comp, date and
// the motion details (what moves, how far, how long, which token and curve).
var REVIEW_NAME = "Review meta", REVIEW_BOX = "Review meta \u00b7 box";
function reviewExpr(o, fallback) {
    var show = o.show || {};
    var L = [];
    L.push("// Nscale review box: reads the comp on screen live");
    L.push("var c = null;");
    L.push("for (var li = 1; li <= thisComp.numLayers; li++) { var LL = thisComp.layer(li); if (LL.name.indexOf(\"Review meta\") === 0 || !LL.active) continue;");
    L.push("  try { if (LL.source && LL.source.numLayers !== undefined) { c = LL.source; break; } } catch (eS) {} }");
    L.push("if (!c) c = " + (fallback ? "comp(" + q(fallback) + ")" : "thisComp") + ";");
    L.push("var fd = c.frameDuration;");
    L.push("function marker(def) { var m = thisLayer.marker, n = def; for (var i = 1; i <= m.numKeys; i++) if (m.key(i).time <= time + 0.001 && m.key(i).comment) n = m.key(i).comment; return n; }");
    L.push("var TOK = [[\"xs\", 50, 217], [\"s\", 133, 350], [\"m\", 217, 567], [\"l\", 350, 917], [\"xl\", 567, 1483], [\"xxl\", 917, 2400]];");
    L.push("function tok(s) { var ms = s * 1000, tol = fd * 1000 * 0.75, out = [];");
    L.push("  for (var i = 0; i < TOK.length; i++) { if (Math.abs(ms - TOK[i][1]) <= tol) out.push(\"Productive \" + TOK[i][0]); if (Math.abs(ms - TOK[i][2]) <= tol) out.push(\"Expressive \" + TOK[i][0]); }");
    L.push("  return out.length ? \" \u00b7 \" + out.join(\" / \") : \"\"; }");
    L.push("function r1(v) { return Math.round(v * 10) / 10; }");
    L.push("function sg(v) { return (v > 0 ? \"+\" : \"\") + r1(v); }");
    L.push("function timing(s) { return s.toFixed(2) + \"s \u00b7 \" + Math.round(s / fd) + \"f\" + tok(s); }");
    L.push("var CURVES = [[\"quick settle\", [0.2, 0.8, 0.3, 1]], [\"reverse settle\", [0.7, 0, 0.8, 0.2]], [\"machined\", [0.65, 0, 0.35, 1]], [\"hard stop\", [0.55, 0, 0.9, 0.55]],");
    L.push("  [\"float\", [0.3, 0.3, 0.15, 1]], [\"reverse float\", [0.85, 0, 0.7, 0.7]], [\"drift\", [0.5, 0.13, 0.3, 1]], [\"momentum\", [0.6, 0, 0.8, 0.5]], [\"carry settle\", [0.33, 0.67, 0.67, 1]],");
    L.push("  [\"linear\", [0, 0, 1, 1]], [\"AE easy ease\", [0.333, 0, 0.667, 1]]];");
    L.push("function bz(u, b) { var cx = 3 * b[0], bx = 3 * (b[2] - b[0]) - cx, ax = 1 - cx - bx, cy = 3 * b[1], by = 3 * (b[3] - b[1]) - cy, ay = 1 - cy - by, t = u;");
    L.push("  for (var k = 0; k < 10; k++) { var e = ((ax * t + bx) * t + cx) * t - u, d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(e) < 1e-6 || d == 0) break; t -= e / d; }");
    L.push("  return ((ay * t + by) * t + cy) * t; }");
    L.push("function dist(a, b) { if (typeof a == \"number\") return b - a; var s = 0; for (var i = 0; i < a.length; i++) s += (b[i] - a[i]) * (b[i] - a[i]); return Math.sqrt(s); }");
    L.push("function curveOf(p) { var t1 = p.key(1).time, t2 = p.key(2).time, v1 = p.key(1).value, total = dist(v1, p.key(2).value); if (!total) return \"\";");
    L.push("  var best = \"\", bestErr = 1e9;");
    L.push("  for (var ci = 0; ci < CURVES.length; ci++) { var err = 0;");
    L.push("    for (var n = 1; n < 10; n++) { var u = n / 10, got = dist(v1, p.valueAtTime(t1 + u * (t2 - t1))) / total; err += Math.pow(got - bz(u, CURVES[ci][1]), 2); }");
    L.push("    err = Math.sqrt(err / 9); if (err < bestErr) { bestErr = err; best = CURVES[ci][0]; } }");
    L.push("  return bestErr < 0.03 ? best : \"custom ease\"; }");
    L.push("function describe(Ly) {");
    L.push("  var parts = [], dur = null, main = null;");
    L.push("  function add(p, f) { try { if (p.numKeys >= 2) { var t = f(p.key(1).value, p.key(2).value); if (t) { parts.push(t); var d = p.key(2).time - p.key(1).time; if (dur === null || d > dur) { dur = d; main = p; } } } } catch (e) {} }");
    L.push("  function mv(a, b) { var o = []; if (Math.abs(b[0] - a[0]) > 0.05) o.push(\"x \" + sg(b[0] - a[0])); if (Math.abs(b[1] - a[1]) > 0.05) o.push(\"y \" + sg(b[1] - a[1])); return o.length ? \"move \" + o.join(\" \") + \"px\" : \"\"; }");
    L.push("  function num(label, unit) { return function (a, b) { return a == b ? \"\" : label + \" \" + r1(a) + unit + \" \u2192 \" + r1(b) + unit; }; }");
    L.push("  var T = Ly.transform;");
    L.push("  add(T.position, mv);");
    L.push("  try { add(T.xPosition, function (a, b) { return a == b ? \"\" : \"move x \" + sg(b - a) + \"px\"; }); add(T.yPosition, function (a, b) { return a == b ? \"\" : \"move y \" + sg(b - a) + \"px\"; }); } catch (eP) {}");
    L.push("  add(T.scale, function (a, b) { return a[0] == b[0] && a[1] == b[1] ? \"\" : \"scale \" + r1(a[0]) + \" \u2192 \" + r1(b[0]) + \"%\"; });");
    L.push("  add(T.rotation, num(\"rotate\", \"\u00b0\"));");
    L.push("  add(T.opacity, num(\"opacity\", \"%\"));");
    L.push("  try { var D = Ly.content(\"Draw\"); add(D.start, num(\"trim start\", \"%\")); add(D.end, num(\"trim end\", \"%\")); add(D.offset, num(\"trim offset\", \"\u00b0\")); } catch (eD) {}");
    L.push("  try { for (var g = 1; g <= Ly.content.numProperties; g++) { var G = Ly.content(g); try { add(G.transform.position, function (a, b) { var t = mv(a, b); return t ? \"path \" + t : \"\"; }); } catch (eG) {}");
    L.push("    try { add(G.transform.rotation, num(\"path rotate\", \"\u00b0\")); } catch (eR) {} } } catch (eC) {}");
    L.push("  return parts.length ? parts.join(\", \") + \" \u00b7 \" + timing(dur) + (main ? \" \u00b7 \" + curveOf(main) : \"\") : \"\";");
    L.push("}");
    L.push("var lines = [];");
    if (show.name) L.push("lines.push(" + q(o.nameLabel || "Test") + " + \": \" + marker(" + q(o.name || "untitled") + "));");
    if (show.version && o.version) L.push("lines.push(\"Version: \" + " + q(o.version) + ");");
    if (show.comp) L.push("lines.push(\"Comp: \" + c.name);");
    if (show.date) L.push("lines.push(\"Date: \" + " + q(o.date || "") + ");");
    if (show.fps) L.push("lines.push(Math.round(1 / fd) + \" fps \u00b7 \" + c.duration.toFixed(2) + \"s\");");
    if (show.details) {
        var list = o.layers && o.layers.length ? "[" + (function () { var a = []; for (var i = 0; i < o.layers.length; i++) a.push(q(o.layers[i])); return a.join(", "); })() + "]" : "null";
        L.push("var only = " + list + ", mode = " + q(o.details || "lines") + ", shown = 0;");
        L.push("for (var k = 1; k <= c.numLayers && shown < 10; k++) { var Lk = c.layer(k); if (Lk.name.indexOf(\"Review meta\") === 0) continue;");
        L.push("  var want = only ? only.indexOf(Lk.name) >= 0 : mode == \"lines\" ? (/line|marker/i.test(Lk.name) && Lk.name.indexOf(\"\u00b7\") < 0) : true;");
        L.push("  if (!want) continue; var d = \"\"; try { d = describe(Lk); } catch (eL) {}");
        L.push("  if (d) { lines.push(Lk.name + \": \" + d); shown++; } }");
    }
    L.push("lines.length ? lines.join(\"\\r\") : \" \";");
    return L.join("\n");
}
function makeReview(comp, o) {
    var size = Math.max(6, Math.min(40, +o.size || 11)), pad = Math.round(size * 0.75), margin = Math.round(size * 2.2), corner = o.corner || "br";
    // read from the precomp on screen when this is an exporter comp, otherwise from this comp
    var fallback = null;
    for (var i = 1; i <= comp.numLayers; i++) { var Li = comp.layer(i); if (Li.source instanceof CompItem && Li.name.indexOf("Review meta") !== 0) { fallback = Li.source.name; break; } }
    if (o.details === "selected") {
        o.layers = [];
        for (var s = 0; s < comp.selectedLayers.length; s++) if (comp.selectedLayers[s].name.indexOf("Review meta") !== 0) o.layers.push(comp.selectedLayers[s].name);
        if (!o.layers.length) return "WARN:Select the layers to describe, or pick 'Line layers' or 'All animated'.";
        if (fallback) fallback = null;   // the selected layers live in this comp
    }
    var keepMarkers = [], old = null, oldBox = null;
    for (var j = 1; j <= comp.numLayers; j++) { if (comp.layer(j).name === REVIEW_NAME) old = comp.layer(j); if (comp.layer(j).name === REVIEW_BOX) oldBox = comp.layer(j); }
    if (old) { var om = old.property("ADBE Marker"); for (var k = 1; k <= om.numKeys; k++) keepMarkers.push([om.keyTime(k), om.keyValue(k).comment]); old.locked = false; old.remove(); }
    if (oldBox) { oldBox.locked = false; oldBox.remove(); }

    var t = comp.layers.addText("REVIEW");
    t.name = REVIEW_NAME; t.label = 1;
    var st = t.property("ADBE Text Properties").property("ADBE Text Document"), doc = st.value;
    try { doc.font = "Menlo-Regular"; } catch (eF) {}
    doc.fontSize = size; doc.applyFill = true; doc.fillColor = [1, 1, 1]; doc.applyStroke = false; doc.tracking = 0;
    doc.justification = (corner === "tl" || corner === "bl") ? ParagraphJustification.LEFT_JUSTIFY : ParagraphJustification.RIGHT_JUSTIFY;
    try { doc.autoLeading = false; doc.leading = Math.round(size * 1.4); } catch (eL) {}
    st.setValue(doc);
    st.expression = reviewExpr(o, fallback);
    var rx = (corner === "tl" || corner === "bl") ? "r.left" : "r.left + r.width", ry = (corner === "tl" || corner === "tr") ? "r.top" : "r.top + r.height";
    var px = (corner === "tl" || corner === "bl") ? String(margin + pad) : "thisComp.width - " + (margin + pad), py = (corner === "tl" || corner === "tr") ? String(margin + pad) : "thisComp.height - " + (margin + pad);
    var tr = t.property("ADBE Transform Group");
    tr.property("ADBE Anchor Point").expression = "var r = sourceRectAtTime(time, false);\n[" + rx + ", " + ry + "];";
    tr.property("ADBE Position").expression = "[" + px + ", " + py + "];";
    var mk = t.property("ADBE Marker");
    for (var m = 0; m < keepMarkers.length; m++) mk.setValueAtTime(keepMarkers[m][0], new MarkerValue(keepMarkers[m][1]));
    t.startTime = 0; t.inPoint = 0; t.outPoint = comp.duration;

    var b = comp.layers.addShape(); b.name = REVIEW_BOX; b.label = 1;
    var bt = b.property("ADBE Transform Group"); bt.property("ADBE Anchor Point").setValue([0, 0]); bt.property("ADBE Position").setValue([0, 0]);
    var grp = b.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); grp.name = "Panel";
    var V = function () { return b.property("ADBE Root Vectors Group").property("Panel").property("ADBE Vectors Group"); };
    var rect = V().addProperty("ADBE Vector Shape - Rect"), T = "thisComp.layer(" + q(REVIEW_NAME) + ")";
    rect.property("ADBE Vector Rect Size").expression = "var t = " + T + ", r = t.sourceRectAtTime(time, false);\n[r.width + " + 2 * pad + ", r.height + " + 2 * pad + "];";
    rect.property("ADBE Vector Rect Position").expression = "var t = " + T + ", r = t.sourceRectAtTime(time, false);\nt.toComp([r.left + r.width / 2, r.top + r.height / 2]);";
    var fill = V().addProperty("ADBE Vector Graphic - Fill"); fill.property("ADBE Vector Fill Color").setValue([0, 0, 0]); fill.property("ADBE Vector Fill Opacity").setValue(85);
    var stroke = V().addProperty("ADBE Vector Graphic - Stroke"); stroke.property("ADBE Vector Stroke Color").setValue([1, 0.83, 0]); stroke.property("ADBE Vector Stroke Width").setValue(1);
    b.startTime = 0; b.inPoint = 0; b.outPoint = comp.duration;
    b.moveToBeginning(); t.moveToBeginning();
    var where = { tl: "top left", tr: "top right", bl: "bottom left", br: "bottom right" }[corner];
    return "OK:Review box " + where + ", " + size + " px \u00b7 reading " + (fallback ? "the comp on screen (" + fallback + " now)" : "this comp") + (keepMarkers.length ? " \u00b7 per-cut names kept" : "");
}
function removeReview(comp) {
    var n = 0;
    for (var i = comp.numLayers; i >= 1; i--) { var L = comp.layer(i); if (L.name === REVIEW_NAME || L.name === REVIEW_BOX) { L.locked = false; L.remove(); n++; } }
    return n ? "OK:Review box removed." : "WARN:No review box in this comp.";
}

// ---------- Theme modes (light / dark), like Figma variable modes ----------
// One controller per comp, "Theme \u00b7 controls": a Dark mode checkbox and a Light and a Dark Color Control per token.
// Linked colours pick their value from the controller, so switching the checkbox switches the design.
var THEME_CTRL = "Theme \u00b7 controls", THEME_TAG = "nscale-theme";
var BRAND_NAMES = { "0F41F3": "Blue", "040E27": "Midnight", "00DF99": "Spearmint", "FDFFF8": "Chalk", "FFFFFF": "White", "000000": "Black" };
function hex6(c) { var s = ""; for (var i = 0; i < 3; i++) { var h = Math.round(Math.max(0, Math.min(1, c[i])) * 255).toString(16).toUpperCase(); s += h.length < 2 ? "0" + h : h; } return s; }
function rgbOf(h) { h = String(h).replace("#", ""); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]; }
function themeCtrl(comp, make) {
    for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === THEME_CTRL) return comp.layer(i);
    if (!make) return null;
    var c = comp.layers.addNull(); c.name = THEME_CTRL; c.comment = THEME_TAG; c.label = 1; c.moveToBeginning();
    c.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control").name = "Dark mode";
    try { c.enabled = false; } catch (e) {}
    return c;
}
function themeFx(ctrl, name, which) {   // finds "Name \u00b7 Light" / "Name \u00b7 light" (earlier theme rigs used lower case)
    var fx = ctrl.property("ADBE Effect Parade"), want = (name + " \u00b7 " + which).toLowerCase();
    for (var i = 1; i <= fx.numProperties; i++) if (fx.property(i).name.toLowerCase() === want) return fx.property(i);
    return null;
}
function themeTokens(ctrl) {
    var fx = ctrl.property("ADBE Effect Parade"), out = [], seen = {};
    for (var i = 1; i <= fx.numProperties; i++) {
        var e = fx.property(i), m = e.name.match(/^(.*) \u00b7 (light|dark)$/i);
        if (!m || seen[m[1].toLowerCase()]) continue; seen[m[1].toLowerCase()] = true;
        var Lc = themeFx(ctrl, m[1], "Light"), Dc = themeFx(ctrl, m[1], "Dark");
        if (Lc && Dc) out.push({ name: m[1], light: hex6(Lc.property(1).value), dark: hex6(Dc.property(1).value) });
    }
    return out;
}
function themeAddToken(ctrl, name, light, dark) {
    if (!themeFx(ctrl, name, "Light")) { ctrl.property("ADBE Effect Parade").addProperty("ADBE Color Control").name = name + " \u00b7 Light"; themeFx(ctrl, name, "Light").property(1).setValue(rgbOf(light)); }
    if (!themeFx(ctrl, name, "Dark")) { ctrl.property("ADBE Effect Parade").addProperty("ADBE Color Control").name = name + " \u00b7 Dark"; themeFx(ctrl, name, "Dark").property(1).setValue(rgbOf(dark || light)); }
}
function themeExpr(token, ctrl) {
    var C = "thisComp.layer(" + q(THEME_CTRL) + ").effect", ln = token + " \u00b7 Light", dn = token + " \u00b7 Dark";
    if (ctrl) { var lf = themeFx(ctrl, token, "Light"), df = themeFx(ctrl, token, "Dark"); if (lf) ln = lf.name; if (df) dn = df.name; }
    return "// Nscale theme: " + token + "\n" + C + "(\"Dark mode\")(\"Checkbox\") == 1 ? " + C + "(" + q(dn) + ")(\"Color\") : " + C + "(" + q(ln) + ")(\"Color\");";
}
function themeState(comp) {
    var c = themeCtrl(comp, false);
    if (!c) return "THEME:" + js({ comp: comp.name, has: false, dark: false, tokens: [] });
    return "THEME:" + js({ comp: comp.name, has: true, dark: c.property("ADBE Effect Parade").property("Dark mode").property(1).value == 1, tokens: themeTokens(c) });
}
// Links every plain colour on the selected layers (or all layers when none are selected) to a token.
// Colours already on a token keep it; new colours become new tokens named after the brand colour or the hex.
function themeLink(comp) {
    var ctrl = themeCtrl(comp, true), tokens = themeTokens(ctrl), byLight = {}, linked = 0, added = 0, skipped = 0, already = 0;
    for (var t = 0; t < tokens.length; t++) byLight[tokens[t].light] = tokens[t].name;
    var layers = selectedLayerList(comp);
    if (!layers.length) for (var i = 1; i <= comp.numLayers; i++) layers.push(comp.layer(i));
    function tokenFor(c) {
        var h = hex6(c);
        if (byLight[h]) return byLight[h];
        var name = BRAND_NAMES[h] || ("#" + h), n = 2, base = name;
        while (themeFx(ctrl, name, "Light")) name = base + " " + n++;
        themeAddToken(ctrl, name, h, h); byLight[h] = name; added++;
        return name;
    }
    function link(p) {
        var ex = String(p.expression || "");
        if (ex) { if (/\u00b7 (light|dark)"\)\("Color"\)/i.test(ex) && ex.indexOf("Nscale theme") >= 0) already++; else skipped++; return; }
        if (p.numKeys > 0) { skipped++; return; }
        p.expression = themeExpr(tokenFor(p.value), ctrl); linked++;
    }
    function walk(g) {
        for (var k = 1; k <= g.numProperties; k++) {
            var p = g.property(k); if (!p) continue;
            if (p.propertyType === PropertyType.PROPERTY) { if (p.propertyValueType === PropertyValueType.COLOR && p.canSetExpression) link(p); }
            else if (p.numProperties > 0 && !isPseudo(p)) walk(p);
        }
    }
    for (var l = 0; l < layers.length; l++) {
        var L = layers[l];
        if (L === ctrl || L.name.indexOf("Review meta") === 0) continue;
        try {
            // solids: their colour isn't scriptable live, so a Fill effect carries it
            if (L.source && L.source.mainSource && L.source.mainSource instanceof SolidSource) {
                var fx = L.property("ADBE Effect Parade"), f = fx.property("Theme fill");
                if (!f) { fx.addProperty("ADBE Fill").name = "Theme fill"; f = L.property("ADBE Effect Parade").property("Theme fill"); for (var c = 1; c <= f.numProperties; c++) if (f.property(c).propertyValueType === PropertyValueType.COLOR) f.property(c).setValue(L.source.mainSource.color); }
            }
            // text: fill colour through a "Theme colour" animator
            if (L instanceof TextLayer) {
                var A = L.property("ADBE Text Properties").property("ADBE Text Animators"), an = null;
                for (var x = 1; x <= A.numProperties; x++) if (A.property(x).name === "Theme colour") an = A.property(x);
                if (!an) {
                    var fc = L.property("ADBE Text Properties").property("ADBE Text Document").value.fillColor;
                    an = A.addProperty("ADBE Text Animator"); an.name = "Theme colour";
                    an = L.property("ADBE Text Properties").property("ADBE Text Animators").property("Theme colour");
                    an.property("ADBE Text Animator Properties").addProperty("ADBE Text Fill Color");
                    an.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
                    an = L.property("ADBE Text Properties").property("ADBE Text Animators").property("Theme colour");
                    an.property("ADBE Text Animator Properties").property("ADBE Text Fill Color").setValue(fc);
                }
            }
            walk(L);
        } catch (e) { skipped++; }
    }
    return "OK:" + linked + " colour" + (linked === 1 ? "" : "s") + " linked" + (added ? " \u00b7 " + added + " new token" + (added === 1 ? "" : "s") + ": set their dark values in the panel" : "") + (already ? " \u00b7 " + already + " already linked" : "") + (skipped ? " \u00b7 " + skipped + " skipped (animated, or driven by another expression)" : "");
}
function themeSetMode(dark, scope) {
    var comps = [], n = 0;
    if (scope === "all") { for (var i = 1; i <= app.project.numItems; i++) if (app.project.item(i) instanceof CompItem) comps.push(app.project.item(i)); }
    else comps.push(app.project.activeItem);
    for (var c = 0; c < comps.length; c++) { var ctrl = themeCtrl(comps[c], false); if (ctrl) { ctrl.property("ADBE Effect Parade").property("Dark mode").property(1).setValue(dark ? 1 : 0); n++; } }
    return n ? "OK:" + (dark ? "Dark" : "Light") + " mode in " + n + " comp" + (n === 1 ? "" : "s") : "WARN:No theme set up yet. Link colours first.";
}
function themeSetToken(comp, o) {
    var ctrl = themeCtrl(comp, true);
    if (!themeFx(ctrl, o.name, "Light")) themeAddToken(ctrl, o.name, o.light || "FFFFFF", o.dark || o.light || "FFFFFF");
    if (o.light) themeFx(ctrl, o.name, "Light").property(1).setValue(rgbOf(o.light));
    if (o.dark) themeFx(ctrl, o.name, "Dark").property(1).setValue(rgbOf(o.dark));
    return "OK:" + o.name + " \u00b7 light #" + String(o.light || "").replace("#", "") + " \u00b7 dark #" + String(o.dark || "").replace("#", "");
}

// ---------- Notes, saved inside the project file ----------
// Kept in the project's XMP metadata, so they travel with the .aep (save the project to keep them).
var NOTES_NS = "http://ns.nscale.com/motion/1.0/";
function xmpReady() {
    try { if (typeof XMPMeta === "undefined") ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript"); XMPMeta.registerNamespace(NOTES_NS, "nscm"); return true; } catch (e) { return false; }
}
function notesAll() {
    if (!xmpReady()) return { project: { text: "", t: 0 }, comps: {} };
    try { var m = new XMPMeta(app.project.xmpPacket), p = m.getProperty(NOTES_NS, "notes"); if (p) { var o = eval("(" + String(p.value) + ")"); if (o && o.comps) return o; } } catch (e) {}
    return { project: { text: "", t: 0 }, comps: {} };
}
function notesSave(all) {
    if (!xmpReady()) return false;
    var m = new XMPMeta(app.project.xmpPacket);
    m.setProperty(NOTES_NS, "notes", js(all));
    app.project.xmpPacket = m.serialize();
    return true;
}
function notesGet() {
    var all = notesAll(), comp = app.project.activeItem, list = [];
    for (var id in all.comps) if (all.comps.hasOwnProperty(id) && all.comps[id].text) list.push({ id: id, name: all.comps[id].name, t: all.comps[id].t });
    var cur = (comp instanceof CompItem) ? (all.comps[String(comp.id)] || { text: "", t: 0 }) : null;
    return "NOTES:" + js({ compId: comp instanceof CompItem ? String(comp.id) : "", compName: comp instanceof CompItem ? comp.name : "", comp: cur, project: all.project, list: list, file: app.project.file ? decodeURI(app.project.file.name) : "" });
}
function notesSet(o) {
    var all = notesAll(), now = new Date().getTime();
    if (o.compId) all.comps[o.compId] = { name: o.compName, text: o.comp || "", t: now };
    if (o.project !== undefined) all.project = { text: o.project || "", t: now };
    return notesSave(all) ? "OK:Notes saved into the project \u00b7 save the project file to keep them" : "WARN:Couldn't write the notes (XMP library didn't load).";
}
function openComp(id) {
    for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && String(it.id) === String(id)) { it.openInViewer(); return "OK:Opened " + it.name; } }
    return "WARN:That comp isn't in the project any more.";
}
function activeCompId() { var c = app.project.activeItem; return "COMP:" + (c instanceof CompItem ? c.id + "|" + c.name : "|"); }

// ---------- Render presets ----------
// Each preset names an output-module template by pattern; the first template in this After Effects that matches is used.
function renderTemplates() {
    var comp = app.project.activeItem; if (!(comp instanceof CompItem)) return "WARN:Open a composition first.";
    var it = app.project.renderQueue.items.add(comp), names = [];
    try { names = it.outputModule(1).templates; } catch (e) {}
    it.remove();
    var out = []; for (var i = 0; i < names.length; i++) if (!/^_HIDDEN/.test(names[i])) out.push(names[i]);
    return "TEMPLATES:" + js(out);
}
function pickTemplate(names, wanted) {
    var pats = String(wanted).split("||");
    for (var p = 0; p < pats.length; p++) {
        var exact = pats[p];
        for (var i = 0; i < names.length; i++) if (names[i] === exact) return names[i];
        var re; try { re = new RegExp(pats[p], "i"); } catch (e) { continue; }
        for (var j = 0; j < names.length; j++) if (re.test(names[j])) return names[j];
    }
    return null;
}
function renderPreset(comp, o) {
    var folder = o.folder ? new Folder(o.folder) : null;
    if (!folder && app.project.file) folder = new Folder(app.project.file.parent.fsName + "/Renders");
    if (!folder) return "WARN:Choose a save folder first (the project isn't saved yet, so there's no folder next to it).";
    if (!folder.exists && !folder.create()) return "WARN:Couldn't create " + folder.fsName;
    var loops = (!o.still && o.loop) ? Math.max(2, Math.round(o.loop)) : 0;
    var base = slug(o.name || comp.name) + (loops ? "_loop" + loops : ""), name = base;
    if (o.version) name = base + "_v" + pad2(nextVersion(folder, base));
    if (o.still) {
        var f = new File(folder.fsName + "/" + name + "_f" + Math.round(comp.time / comp.frameDuration) + ".png");
        try { comp.saveFrameToPng(comp.time, f); } catch (e) { return "WARN:Still failed: " + e.toString(); }
        return "OK:Saved " + decodeURI(f.name) + " in " + decodeURI(folder.name);
    }
    // loop export: a wrapper comp that plays the chosen range back to back, rendered in place of the comp
    var target = comp, start = o.range === "comp" ? 0 : comp.workAreaStart, span = o.range === "comp" ? comp.duration : comp.workAreaDuration, wrap = null;
    if (loops) {
        wrap = app.project.items.addComp(comp.name + " (loop x" + loops + ")", comp.width, comp.height, comp.pixelAspect, span * loops, 1 / comp.frameDuration);
        wrap.bgColor = comp.bgColor;
        for (var li = loops - 1; li >= 0; li--) {
            var ll = wrap.layers.add(comp);
            ll.startTime = li * span - start; ll.inPoint = li * span; ll.outPoint = (li + 1) * span;
        }
        target = wrap;
    }
    var rq = app.project.renderQueue, item = rq.items.add(target), om = item.outputModule(1), tpl = pickTemplate(om.templates, o.template);
    if (!tpl) { item.remove(); if (wrap) wrap.remove(); return "WARN:No output template in this After Effects matches \u201c" + o.label + "\u201d. Pick one under Custom."; }
    om.applyTemplate(tpl);
    try { item.setSettings({ "Resolution": o.half ? [2, 2] : [1, 1] }); } catch (e1) {}
    if (loops) { item.timeSpanStart = 0; item.timeSpanDuration = wrap.duration; }
    else { item.timeSpanStart = start; item.timeSpanDuration = span; }
    var seq = /sequence/i.test(tpl), path = folder.fsName + "/" + name;
    if (seq) { var sub = new Folder(path); if (!sub.exists) sub.create(); path = sub.fsName + "/" + name + "_[#####]"; }
    om.file = new File(path);
    if (!o.now) return "OK:Queued " + name + " \u00b7 " + tpl + " \u00b7 open the Render Queue to start it" + (loops ? " \u00b7 keep the comp \u201c" + wrap.name + "\u201d until it has rendered" : "");
    // render only this item: switch the others off for the moment and put them back after
    var off = [];
    for (var r = 1; r <= rq.numItems; r++) { var ri = rq.item(r); if (ri !== item && ri.status === RQItemStatus.QUEUED) { ri.render = false; off.push(ri); } }
    var err = "";
    try { rq.render(); } catch (e2) { err = e2.toString(); }
    for (var k = 0; k < off.length; k++) try { off[k].render = true; } catch (e3) {}
    if (wrap) try { wrap.remove(); } catch (e4) {}    // the wrapper was only for this render
    if (err) return "WARN:Render stopped: " + err;
    return "OK:Rendered " + name + (loops ? " (plays " + loops + " times)" : "") + " \u00b7 " + tpl + " \u00b7 " + decodeURI(folder.name);
}
function chooseFolder(title) { var f = Folder.selectDialog(title || "Choose a folder"); return f ? "PATH:" + f.fsName : "WARN:No folder chosen."; }

// ---------- Shared settings between the panel and the bar ----------
// Saved in After Effects' preferences so whichever panel opens next starts from the latest settings.
function nsm_stateSet(json) { setSetting("uiState", json); return "OK"; }
function nsm_stateGet() { return getSetting("uiState", ""); }

// ---------- Text moves: the house set (decided 5 Nov 2026), rebuilt from type-in-wide v16 ----------
// Each move puts named text animators on the selected text layers, timed from the playhead or the layer's in point.
// Timings are the built ones in 60 fps frames, converted to the comp's frame rate.
//   word  Headline, by word       in 89f (Expressive xl) \u00b7 out 34f (Expressive m)
//   line  Body copy, by line      in 144f (Expressive xxl) \u00b7 out 55f (Expressive l)
//   rise  Short line, rise by word in 55f (Expressive l) \u00b7 no out
//   type  Typing, with cursor     150f, cursor leaves 21f after the last letter
var TM_SPEARMINT = [0, 0.8745, 0.6, 1];
var TM_IN_NAMES = { word: ["In-Reveal", "In-Position", "In-Overall position", "Colour"], line: ["In-Reveal", "In-Position", "In-Overall position", "Colour"],
    rise: ["In - Opacity", "In - Position - y", "In - Position - x"], type: ["Reveal", "Colour + Position"] };
var TM_OUT_NAMES = ["Out-Reveal", "Out-Colour", "Out-Position", "Out-Overall position"];
var TM_LABEL = { word: "Headline \u00b7 by word", line: "Body copy \u00b7 by line", rise: "Short line \u00b7 rise by word", type: "Typing \u00b7 with cursor" };
function tmSecs(comp, f60) { return Math.max(1, Math.round(f60 / 60 / comp.frameDuration)) * comp.frameDuration; }
function tmFr(comp, f60) { return Math.max(1, Math.round(f60 * (1 / comp.frameDuration) / 60)); }
function tmAnims(L) { return L.property("ADBE Text Properties").property("ADBE Text Animators"); }
function tmRemove(L, names) {
    var A = tmAnims(L);
    for (var i = A.numProperties; i >= 1; i--) { var n = A.property(i).name; for (var j = 0; j < names.length; j++) if (n === names[j]) { A.property(i).remove(); break; } }
}
function tmSet(p, v) { try { p.setValue(v); } catch (e) { if (v instanceof Array && v.length === 4) p.setValue([v[0], v[1], v[2]]); else throw e; } }
// two keys with the house ease: "in" leaves at average speed with 30% influence and lands with 85%; "out" is that reversed
function tmKeys(p, t0, t1, v0, v1, kind) {
    while (p.numKeys) p.removeKey(1);
    p.setValueAtTime(t0, v0); p.setValueAtTime(t1, v1);
    var k1 = p.nearestKeyIndex(t0), k2 = p.nearestKeyIndex(t1), dims = isSpatial(p) ? 1 : (v0 instanceof Array ? v0.length : 1);
    var dist = 0; if (v0 instanceof Array) { for (var d = 0; d < v0.length; d++) dist += (v1[d] - v0[d]) * (v1[d] - v0[d]); dist = Math.sqrt(dist); } else dist = Math.abs(v1 - v0);
    var avg = dist / Math.max(0.0001, t1 - t0);
    function e(speed, inf) { var a = []; for (var i = 0; i < dims; i++) a.push(new KeyframeEase(speed, inf)); return a; }
    if (kind === "in") { p.setTemporalEaseAtKey(k1, e(0, 33.33), e(avg, 30)); p.setTemporalEaseAtKey(k2, e(0, 85), e(0, 16.67)); }
    else { p.setTemporalEaseAtKey(k1, e(0, 16.67), e(0, 85)); p.setTemporalEaseAtKey(k2, e(avg, 30), e(0, 16.67)); }
    try { p.setLabelAtKey(k1, kind === "in" ? 9 : 1); p.setLabelAtKey(k2, 0); } catch (eL) {}
}
// one animator: props are [matchName, value]; sel (optional) is { based, smooth, keys:[t0,t1,v0,v1,kind], expr, startExpr }
function tmAdd(L, name, props, sel) {
    tmAnims(L).addProperty("ADBE Text Animator").name = name;
    var A = function () { return tmAnims(L).property(name); };
    for (var i = 0; i < props.length; i++) {
        A().property("ADBE Text Animator Properties").addProperty(props[i][0]);
        tmSet(A().property("ADBE Text Animator Properties").property(props[i][0]), props[i][1]);
    }
    if (sel) {
        A().property("ADBE Text Selectors").addProperty("ADBE Text Selector");
        var S = function () { return A().property("ADBE Text Selectors").property(1); };
        if (sel.based) S().property("ADBE Text Range Advanced").property("ADBE Text Range Type2").setValue(sel.based);
        if (sel.smooth != null) S().property("ADBE Text Range Advanced").property("ADBE Text Selector Smoothness").setValue(sel.smooth);
        if (sel.keys) tmKeys(S().property("ADBE Text Percent Offset"), sel.keys[0], sel.keys[1], sel.keys[2], sel.keys[3], sel.keys[4]);
        if (sel.expr) S().property("ADBE Text Percent Offset").expression = sel.expr;
        if (sel.startExpr) S().property("ADBE Text Percent Start").expression = sel.startExpr;
    }
    return A();
}
function tmOffsetRef(name) { return 'text.animator("' + name + '").selector("Range Selector 1").offset'; }

function tmIn(comp, L, id, t0) {
    var R = tmOffsetRef("In-Reveal");
    tmRemove(L, TM_IN_NAMES[id]);
    if (id === "word") {
        var d = tmSecs(comp, 89);
        tmAdd(L, "In-Reveal", [["ADBE Text Opacity", 0]], { based: 3, smooth: 0, keys: [t0, t0 + d, 0, 100, "in"] });
        tmAdd(L, "In-Position", [["ADBE Text Position 3D", [3, 0, 0]]], { based: 3, smooth: 0, expr: R + ".valueAtTime(time - framesToTime(" + tmFr(comp, 2) + "))" });
        tmAdd(L, "In-Overall position", [["ADBE Text Position 3D", [423, 0, 0]]], { based: 4, expr: R });
        tmAdd(L, "Colour", [["ADBE Text Fill Color", TM_SPEARMINT]], { based: 3, smooth: 0, expr: R + ".valueAtTime(time - framesToTime(" + tmFr(comp, 1) + "))" });
        return d;
    }
    if (id === "line") {
        var dl = tmSecs(comp, 144);
        tmAdd(L, "In-Reveal", [["ADBE Text Opacity", 0]], { based: 4, smooth: 0, keys: [t0, t0 + dl, 0, 100, "in"] });
        tmAdd(L, "In-Position", [["ADBE Text Position 3D", [0, 30, 0]]], { based: 4, smooth: 40, expr: R + ".valueAtTime(time - framesToTime(" + tmFr(comp, 2) + "))" });
        tmAdd(L, "In-Overall position", [["ADBE Text Position 3D", [0, -4, 0]]], null);
        tmKeys(tmAnims(L).property("In-Overall position").property("ADBE Text Animator Properties").property("ADBE Text Position 3D"), t0, t0 + dl, [0, 156, 0], [0, -4, 0], "in");
        tmAdd(L, "Colour", [["ADBE Text Fill Color", TM_SPEARMINT]], { based: 3, smooth: 0, expr: R + ".valueAtTime(time - framesToTime(" + tmFr(comp, 1) + "))" });
        return dl;
    }
    if (id === "rise") {
        var dr = tmSecs(comp, 55), O = tmOffsetRef("In - Opacity");
        tmAdd(L, "In - Opacity", [["ADBE Text Opacity", 0]], { based: 3, smooth: 80, keys: [t0, t0 + dr, 0, 100, "in"] });
        tmAdd(L, "In - Position - y", [["ADBE Text Position 3D", [0, 40, 0]]], { based: 3, smooth: 80, expr: O });
        tmAdd(L, "In - Position - x", [["ADBE Text Position 3D", [5, 0, 0]]], { based: 3, expr: tmOffsetRef("In - Position - y") + ".valueAtTime(time - framesToTime(" + tmFr(comp, 8) + "))" });
        return dr;
    }
    return 0;
}
function tmOut(comp, L, id, t0) {
    var O = tmOffsetRef("Out-Reveal");
    tmRemove(L, TM_OUT_NAMES);
    var d = tmSecs(comp, id === "line" ? 55 : 34);
    tmAdd(L, "Out-Reveal", [["ADBE Text Opacity", 0]], { based: id === "line" ? 4 : 3, smooth: id === "line" ? 31 : 0, keys: [t0, t0 + d, -100, 0, "out"] });
    tmAdd(L, "Out-Colour", [["ADBE Text Fill Color", TM_SPEARMINT]], { based: 3, smooth: 0, expr: O + ".valueAtTime(time + framesToTime(" + tmFr(comp, 1) + "))" });
    tmAdd(L, "Out-Position", [["ADBE Text Position 3D", [3, 0, 0]]], { based: 3, smooth: 0, expr: O + ".valueAtTime(time + framesToTime(" + tmFr(comp, 2) + "))" });
    tmAdd(L, "Out-Overall position", [["ADBE Text Position 3D", id === "line" ? [0, -30, 0] : [-468.1094, 0, 0]]], { based: 4, expr: O });
    return d;
}
// typing: a "Typed %" slider drives it; Source Text shows only the typed part so the layer's width follows the typing
function tmType(comp, L, t0, withCursor) {
    var d = tmSecs(comp, 150), SL = "Typed %";
    var fx = L.property("ADBE Effect Parade");
    if (!fx.property(SL)) { fx.addProperty("ADBE Slider Control").name = SL; }
    var slider = L.property("ADBE Effect Parade").property(SL).property(1);
    tmKeys(slider, t0, t0 + d, 0, 100, "in");
    var st = L.property("ADBE Text Properties").property("ADBE Text Document");
    st.expressionEnabled = false;
    var N = String(st.value.text).length;
    st.expression = "// Nscale typing: shows the typed part only, so the layer's width (and the cursor) follows the typing. Timing: the \"Typed %\" slider\n" +
        "var full = (value.text !== undefined) ? String(value.text) : String(value);\n" +
        "var n = Math.min(full.length, Math.ceil(clamp(effect(\"Typed %\")(\"Slider\"), 0, 100) / 100 * full.length - 1e-6));\n" +
        "full.substr(0, n);";
    st.expressionEnabled = true;
    tmRemove(L, TM_IN_NAMES.type);
    var SLR = 'effect("Typed %")("Slider")', NEXPR = "var N = " + N + ", n = Math.min(N, Math.ceil(clamp(" + SLR + ", 0, 100) / 100 * N - 1e-6));\n";
    var startExpr = function (pRef) { return "// Nscale typing: keeps this range on the same characters now the text is shortened (full length " + N + "; apply again after editing the text)\n" + NEXPR + "var p = " + pRef + ";\nn > 0 ? clamp((value + p) * N / n - p, -100, 100) : value;"; };
    tmAdd(L, "Reveal", [["ADBE Text Scale 3D", [0, 0, 100]]], { smooth: 0, expr: SLR + ";", startExpr: startExpr(SLR) });
    tmAdd(L, "Colour + Position", [["ADBE Text Position 3D", [0, 3, 0]]], { smooth: 0, expr: SLR + ".valueAtTime(time - framesToTime(" + tmFr(comp, 1) + "));", startExpr: startExpr(tmOffsetRef("Colour + Position")) });
    var note = "";
    if (withCursor) note = tmCursor(comp, L);
    return { d: d, note: note };
}
// a spearmint cursor that follows the typed text, solid while typing, blinking after, gone 21f after the last letter
function tmCursor(comp, L) {
    var tag = "nscale-cursor:" + L.name;
    for (var r = comp.numLayers; r >= 1; r--) if (comp.layer(r).comment === tag) comp.layer(r).remove();
    var C = comp.layers.addShape(); C.name = uniqueLayerName(comp, L.name + " \u00b7 cursor"); C.comment = tag; C.label = 9;
    C.moveBefore(L);
    C.startTime = 0; C.inPoint = L.inPoint; C.outPoint = L.outPoint;
    var fx = function () { return C.property("ADBE Effect Parade"); };
    fx().addProperty("ADBE Color Control").name = "Colour"; fx().property("Colour").property(1).setValue([0, 0.8745, 0.6]);
    var sliders = [["Width %", 6], ["Height %", 95], ["Gap px", 6], ["Out after typing (f)", Math.round(21 / comp.frameDuration / 60)], ["Blink (s)", 0.53]];
    for (var i = 0; i < sliders.length; i++) { fx().addProperty("ADBE Slider Control").name = sliders[i][0]; fx().property(sliders[i][0]).property(1).setValue(sliders[i][1]); }
    var T = 'thisComp.layer(' + q(L.name) + ')';
    var FS = "var t = " + T + ", fs = 72; try { fs = t.text.sourceText.style.fontSize; } catch (e) {} fs = fs * t.transform.scale[1] / 100;\n";
    C.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").name = "Cursor";
    var gv = function () { return C.property("ADBE Root Vectors Group").property("Cursor").property("ADBE Vectors Group"); };
    gv().addProperty("ADBE Vector Shape - Rect"); gv().addProperty("ADBE Vector Graphic - Fill");
    gv().property(1).property("ADBE Vector Rect Size").expression = FS + "[Math.max(1, fs * effect(\"Width %\")(\"Slider\") / 100), fs * effect(\"Height %\")(\"Slider\") / 100];";
    gv().property(1).property("ADBE Vector Rect Position").expression = FS + "var h = fs * effect(\"Height %\")(\"Slider\") / 100, w = Math.max(1, fs * effect(\"Width %\")(\"Slider\") / 100);\n[w / 2, -h * 0.38];";
    gv().property(2).property("ADBE Vector Fill Color").expression = 'effect("Colour")("Color");';
    var tr = C.property("ADBE Transform Group");
    tr.property("ADBE Anchor Point").setValue([0, 0]);
    tr.property("ADBE Position").expression = "// Nscale cursor: sits at the end of the typed text (sourceTime: the text layer's own time)\n" +
        "var t = " + T + ", r = t.sourceRectAtTime(t.sourceTime(time), false);\nt.toComp([r.left + r.width + effect(\"Gap px\")(\"Slider\"), 0]);";
    tr.property("ADBE Opacity").expression = "// Nscale cursor: solid while typing, blinks after, leaves a set number of frames after the last letter\n" +
        "var sl = " + T + ".effect(\"Typed %\")(\"Slider\");\nif (sl.numKeys < 2) 100; else {\n" +
        "  var k1 = sl.key(1).time, k2 = sl.key(sl.numKeys).time, outAt = k2 + framesToTime(Math.round(effect(\"Out after typing (f)\")(\"Slider\")));\n" +
        "  (time < k1 || time >= outAt) ? 0 : time <= k2 ? 100 : (Math.floor((time - k2) / Math.max(0.05, effect(\"Blink (s)\")(\"Slider\"))) % 2 === 0 ? 100 : 0);\n}";
    return "cursor added (\"" + C.name + "\")";
}
function textMove(comp, o) {
    var layers = [];
    for (var i = 0; i < comp.selectedLayers.length; i++) if (comp.selectedLayers[i] instanceof TextLayer) layers.push(comp.selectedLayers[i]);
    if (!layers.length) return "WARN:Select one or more text layers.";
    var id = o.id, part = o.part === "out" ? "out" : "in";
    if (!TM_LABEL[id]) return "WARN:Unknown text move " + id + ".";
    if (part === "out" && (id === "rise" || id === "type")) return "WARN:" + TM_LABEL[id] + " has no out.";
    var dur = 0, notes = [];
    for (var j = 0; j < layers.length; j++) {
        var L = layers[j], t0 = o.at === "inpoint" ? L.inPoint : comp.time;
        if (id === "type") { var r = tmType(comp, L, t0, o.cursor !== false); dur = r.d; if (r.note) notes.push(r.note); }
        else dur = part === "in" ? tmIn(comp, L, id, t0) : tmOut(comp, L, id, t0);
    }
    var f = Math.round(dur / comp.frameDuration);
    return "OK:" + TM_LABEL[id] + (id === "type" ? "" : " " + part) + " on " + layers.length + " layer" + (layers.length === 1 ? "" : "s") + " \u00b7 " + f + "f from the " + (o.at === "inpoint" ? "layer in point" : "playhead") + (notes.length ? " \u00b7 " + notes.join(", ") : "");
}


// ---------- Premiere text templates (.mogrt): three moves, each at three heading sizes ----------
// Sizes: the motion library's social scale, 16:9 row (1920 wide), heading steps only. Draft until the social type scale is signed off.
//   Display  XL 240 px  DM Sans Bold, leading 100%, tracking -3%
//   H1\u2013H2    L  160 px  DM Sans Bold, leading 100%, tracking -3%
//   H3\u2013H6    M  107 px  DM Sans Bold, leading 110%, tracking -3%
var NSM_FPS = 60, NSM_W = 1920, NSM_H = 1080, NSM_X = 160;
var NSM_WHITE = [0.9922, 1, 0.9725];
var NSM_SIZES = [
    { key: "Display", label: "Display", size: 240, lead: 1.0 },
    { key: "H1", label: "H1\u2013H2", size: 160, lead: 1.0 },
    { key: "H3", label: "H3\u2013H6", size: 107, lead: 1.1 }
];
var NSM_MOVES = [
    { id: "word", file: "Headline by word", name: "Headline by word", dur: 6, text: "Headline, word by word" },
    { id: "rise", file: "Short line rise by word", name: "Short line rise by word", dur: 5, text: "A short line rises" },
    { id: "type", file: "Typing with cursor", name: "Typing with cursor", dur: 6, text: "Typing, with a cursor" }
];
var NSM_SOURCE = "Typing source";
var NSM_NOTES = [];

function nsmStyle(L, sz) {
    var st = L.property("ADBE Text Properties").property("ADBE Text Document"), d = st.value;
    d.font = "DMSans-Bold"; d.fontSize = sz.size; d.applyFill = true; d.fillColor = NSM_WHITE; d.applyStroke = false;
    d.justification = ParagraphJustification.LEFT_JUSTIFY;
    d.tracking = -30;
    try { d.autoLeading = false; d.leading = Math.round(sz.size * sz.lead); } catch (e) {}
    st.setValue(d);
}
// anchor on the left edge, half way down the text, and sit it at the left margin, centred vertically
function nsmPlace(L) {
    var r = L.sourceRectAtTime(0, false), tg = L.property("ADBE Transform Group");
    tg.property("ADBE Anchor Point").setValue([r.left, r.top + r.height / 2]);
    tg.property("ADBE Position").setValue([NSM_X, NSM_H / 2]);
}
function nsmText(comp, text, name, sz) { var L = comp.layers.addText(text); L.name = name; nsmStyle(L, sz); return L; }
// a protected region keeps the in and out at their set length when the clip is stretched in Premiere
function nsmProtect(comp, t, d, label) {
    var m = new MarkerValue(label); m.duration = d;
    try { m.protectedRegion = true; } catch (e) { NSM_NOTES.push("protected regions need After Effects 2019 (16.1) or later"); }
    comp.markerProperty.setValueAtTime(t, m);
}
function nsmFullTextExpr() {
    return "var v = thisComp.layer(" + q(NSM_SOURCE) + ").text.sourceText.value;\nvar full = (v && v.text !== undefined) ? String(v.text) : String(v);\n";
}

function nsmBuild(comp, mv, sz) {
    var L, d, dOut;
    if (mv.id !== "type") {
        L = nsmText(comp, mv.text, "Text", sz); nsmPlace(L);
        d = tmIn(comp, L, mv.id, 0);
        nsmProtect(comp, 0, d, "In");
        if (mv.id === "word") {
            dOut = tmSecs(comp, 34);
            tmOut(comp, L, mv.id, comp.duration - dOut);
            nsmProtect(comp, comp.duration - dOut, dOut, "Out");
        }
        L.property("ADBE Text Properties").property("ADBE Text Document").addToMotionGraphicsTemplateAs(comp, "Text");
        return;
    }
    // typing: Premiere edits an invisible source layer; the visible layer types out whatever it says
    var S = nsmText(comp, mv.text, NSM_SOURCE, sz);
    S.shy = true; S.property("ADBE Transform Group").property("ADBE Opacity").setValue(0);   // invisible, but Premiere can still edit it
    L = nsmText(comp, mv.text, "Typing", sz); nsmPlace(L);
    tmType(comp, L, 0, true);
    L.property("ADBE Text Properties").property("ADBE Text Document").expression =
        "// Nscale typing: types out the text from \"" + NSM_SOURCE + "\" (the layer Premiere edits). Timing: the \"Typed %\" slider\n" + nsmFullTextExpr() +
        "var n = Math.min(full.length, Math.ceil(clamp(effect(\"Typed %\")(\"Slider\"), 0, 100) / 100 * full.length - 1e-6));\nfull.substr(0, n);";
    var A = tmAnims(L), names = ["Reveal", "Colour + Position"];
    for (var i = 0; i < names.length; i++) {
        var sp = A.property(names[i]).property("ADBE Text Selectors").property(1).property("ADBE Text Percent Start");
        sp.expression = sp.expression.replace(/var N = \d+, /, nsmFullTextExpr() + "var N = full.length, ").replace(/full length \d+; apply again after editing the text/, "length read from the source layer");
    }
    // cursor on / off for Premiere
    var C = null; for (var c = 1; c <= comp.numLayers; c++) if (comp.layer(c).comment === "nscale-cursor:" + L.name) C = comp.layer(c);
    if (C) {
        C.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control").name = "Show cursor";
        C.property("ADBE Effect Parade").property("Show cursor").property(1).setValue(1);
        C.property("ADBE Root Vectors Group").property("Cursor").property("ADBE Vectors Group").property(2).property("ADBE Vector Fill Opacity").expression = 'effect("Show cursor")("Checkbox") * 100;';
    }
    d = tmSecs(comp, 150);
    nsmProtect(comp, 0, d + tmSecs(comp, 21) + comp.frameDuration, "Typing");
    S.property("ADBE Text Properties").property("ADBE Text Document").addToMotionGraphicsTemplateAs(comp, "Text");
    if (C) C.property("ADBE Effect Parade").property("Show cursor").property(1).addToMotionGraphicsTemplateAs(comp, "Cursor");
}

// Builds all nine templates and exports them. quiet: return a message instead of showing an alert (for the panel).
function nsmBuildPremiereTemplates(quiet) {
    function done(kind, msg) { if (!quiet) alert(msg, "Nscale text templates"); return kind + ":" + msg; }
    if (parseFloat(app.version) < 16.1) return done("WARN", "This needs After Effects 2019 (16.1) or later.");
    var out = Folder.selectDialog("Where should the .mogrt files go? (for the team: Google Drive / Motion / Premiere text)");
    if (!out) return done("WARN", "No folder chosen.");
    var made = [], failed = [], first = null;
    NSM_NOTES = [];
    app.beginUndoGroup("Nscale text templates");
    try {
        var folder = null;
        for (var i = 1; i <= app.project.numItems; i++) if (app.project.item(i) instanceof FolderItem && app.project.item(i).name === "Nscale text templates") folder = app.project.item(i);
        if (!folder) folder = app.project.items.addFolder("Nscale text templates");
        for (var k = 0; k < NSM_MOVES.length; k++) for (var s = 0; s < NSM_SIZES.length; s++) {
            var mv = NSM_MOVES[k], sz = NSM_SIZES[s], name = "Nscale \u00b7 " + mv.name + " \u00b7 " + sz.label, file = "Nscale - " + mv.file + " - " + sz.key + ".mogrt";
            for (var j = folder.numItems; j >= 1; j--) if (folder.item(j).name === name) folder.item(j).remove();   // rebuild from scratch
            var comp = app.project.items.addComp(name, NSM_W, NSM_H, 1, mv.dur, NSM_FPS);
            comp.parentFolder = folder; comp.hideShyLayers = true;
            try { nsmBuild(comp, mv, sz); } catch (e) { failed.push(name + ": " + e.toString() + (e.line ? " (line " + e.line + ")" : "")); continue; }
            comp.motionGraphicsTemplateName = name;
            var ok = false; try { ok = comp.exportAsMotionGraphicsTemplate(true, out.fsName + "/" + file); } catch (e2) { failed.push(name + ": " + e2.toString()); continue; }
            if (ok) made.push(file); else failed.push(name + ": export refused (save the project, then build again)");
            if (!first) first = comp;
        }
    } finally { app.endUndoGroup(); }
    if (first) first.openInViewer();
    var notes = []; for (var n = 0; n < NSM_NOTES.length; n++) if (notes.join("|").indexOf(NSM_NOTES[n]) < 0) notes.push(NSM_NOTES[n]);
    if (quiet) return made.length ? (failed.length ? "WARN:" : "OK:") + made.length + " templates exported to " + out.fsName + (failed.length ? " \u00b7 problems: " + failed.join("; ") : "") : "WARN:Nothing exported. " + failed.join("; ");
    return done(made.length && !failed.length ? "OK" : "WARN", (made.length ? "Exported to " + out.fsName + ":\n- " + made.join("\n- ") : "Nothing exported.") +
        (failed.length ? "\n\nProblems:\n- " + failed.join("\n- ") : "") + (notes.length ? "\n\nNote: " + notes.join("; ") : "") +
        "\n\nThe comps are in the project folder \"Nscale text templates\" if you want to adjust them.");
}

// ---------- Event social: fills the "social-asset" comp from the panel's form and renders it ----------
// One post = a top line, an event name, a date chip and an optional location chip, in light and/or dark mode.
// p.what: "render" (renders every post in p.jobs, then puts the comp back), "preview" (stills of the first post,
// then puts the comp back) or "apply" (leaves the first post in the comp, one undo step).
var SOCIAL = { comp: "social-asset", glass: "png-sequence_main", heroSize: 135, heroLead: 1.1, heroMax: 860, heroMin: 96, gap: 24,
               dropTag: "// Nscale social: glass element lowered" };
function socialFolder() {
    var cs = new Folder("~/Library/CloudStorage"), g = cs.exists ? cs.getFiles("GoogleDrive-*") : [];
    for (var i = 0; i < g.length; i++) { var f = new Folder(g[i].fsName + "/My Drive/Motion/motion finals/socials"); if (f.exists) return f; }
    if (app.project.file) return new Folder(app.project.file.parent.fsName + "/Renders");
    return null;
}
function socialRun(p) {
    var what = p.what || "render", jobs = p.jobs || [], i;
    if (!jobs.length) return "WARN:Fill in the event name first.";
    var MODES = []; if (p.light) MODES.push({ suffix: "_light", dark: 0 }); if (p.dark) MODES.push({ suffix: "_dark", dark: 1 });
    if (!MODES.length) return "WARN:Tick Light, Dark or both.";

    function srcText(L) { return L.property("ADBE Text Properties").property("ADBE Text Document"); }
    function tr(L, m) { return L.property("ADBE Transform Group").property(m); }
    function has(c) { try { return !!(c.layer("Theme \u00b7 controls") && c.layer("Heading")); } catch (e) { return false; } }

    // ----- the comp: the open one if it is a social comp, otherwise the one called "social-asset"
    var comp = app.project.activeItem, wantName = p.template || SOCIAL.comp;
    if (p.template || !(comp instanceof CompItem && has(comp))) {
        comp = null;
        for (i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === wantName && has(it)) { comp = it; break; } }
        if (!comp && !p.template) for (i = 1; i <= app.project.numItems; i++) { var it2 = app.project.item(i); if (it2 instanceof CompItem && has(it2)) { comp = it2; break; } }
    }
    if (!comp) return "WARN:No template comp called \u201c" + wantName + "\u201d here (it needs the \u201cTheme \u00b7 controls\u201d and \u201cHeading\u201d layers).";

    var dark = null;
    try { dark = comp.layer("Theme \u00b7 controls").property("ADBE Effect Parade").property("Dark mode").property(1); } catch (e0) {}
    if (!dark) return "WARN:Can't find \u201cDark mode\u201d on the \u201cTheme \u00b7 controls\u201d layer.";

    var hero = null, subs = [];
    for (i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        if (!(L instanceof TextLayer)) continue;
        if (L.name === "Heading") hero = L; else if (L.name === "Subheading") subs.push(L);
    }
    if (!hero || subs.length < 2) return "WARN:The comp needs one \u201cHeading\u201d and two \u201cSubheading\u201d text layers.";
    subs.sort(function (a, b) { return tr(a, "ADBE Position").value[1] - tr(b, "ADBE Position").value[1]; });
    var topL = subs[0], botL = subs[1];

    function chipParts(name) {
        var chip = null; try { chip = comp.layer(name); } catch (e) {}
        if (!chip) return null;
        var kids = [], text = null, k;
        for (k = 1; k <= comp.numLayers; k++) if (comp.layer(k).parent === chip) { kids.push(comp.layer(k)); if (comp.layer(k) instanceof TextLayer) text = comp.layer(k); }
        var grp = chip.property("ADBE Root Vectors Group").property(1), cont = grp.property("ADBE Vectors Group"), rect = null;
        for (k = 1; k <= cont.numProperties; k++) if (cont.property(k).matchName === "ADBE Vector Shape - Rect") rect = cont.property(k);
        if (!text || !rect) return null;
        return { chip: chip, kids: kids, text: text, rect: rect, gt: grp.property("ADBE Vector Transform Group") };
    }
    var cDate = chipParts("chip-date"), cLoc = chipParts("chip-loc");
    if (!cDate || !cLoc) return "WARN:Can't find the chips (\u201cchip-date\u201d and \u201cchip-loc\u201d, each with a text layer parented to it).";

    var glass = null, glassPos = null, glassExpr = "", glassExprOn = false, glassOurs = false;
    try { glass = comp.layer(SOCIAL.glass); } catch (eG) {}
    if (glass) {
        glassPos = tr(glass, "ADBE Position"); glassExpr = glassPos.expression; glassExprOn = glassPos.expressionEnabled;
        glassOurs = glassExpr.indexOf(SOCIAL.dropTag) === 0;           // a drop left by an earlier "Apply to comp"
    }
    // px lowers the glass element (0 = where it was built); restore puts back whatever was there when this run started
    function setGlassDrop(px, restore) {
        if (!glassPos) return false;
        if (restore) { glassPos.expression = glassExpr; if (glassExpr) glassPos.expressionEnabled = glassExprOn; return true; }
        if (glassExpr && !glassOurs) return !px;                       // someone else's expression: leave it alone
        glassPos.expression = px ? SOCIAL.dropTag + "\nvalue + (value.length > 2 ? [0, " + px + ", 0] : [0, " + px + "]);" : "";
        return true;
    }

    var outFolder = null;
    if (what === "render" || what === "ame") {
        outFolder = p.folder ? new Folder(p.folder) : socialFolder();
        if (!outFolder) return "WARN:Choose a save folder first.";
        if (!outFolder.exists && !outFolder.create()) return "WARN:Couldn't create " + outFolder.fsName;
    } else if (what === "preview") {
        outFolder = new Folder(Folder.temp.fsName + "/nscale-social-preview");
        if (!outFolder.exists) outFolder.create();
    }

    var T = comp.workAreaStart + comp.workAreaDuration / 2;

    // ----- measuring
    function chipGeom(c) {
        var r = c.text.sourceRectAtTime(T, false), po = tr(c.text, "ADBE Position").value, an = tr(c.text, "ADBE Anchor Point").value;
        var sz = c.rect.property("ADBE Vector Rect Size").value, rp = c.rect.property("ADBE Vector Rect Position").value;
        var ga = c.gt.property("ADBE Vector Anchor").value, gp = c.gt.property("ADBE Vector Position").value, gs = c.gt.property("ADBE Vector Scale").value;
        var unit = rp[0] + sz[0] / 2 - ga[0];
        return { textLeft: po[0] - an[0] + r.left, textRight: po[0] - an[0] + r.left + r.width, unit: unit, gpx: gp[0], gs: gs, chipRight: gp[0] + unit * gs[0] / 100 };
    }
    var ruler = null, widths = {};
    function lineWidth(text, doc) {                                   // width of one line at the full hero size, as point text
        if (widths.hasOwnProperty(text)) return widths[text];
        var w = 0;
        try {
            if (!ruler) { ruler = comp.layers.addText(text); ruler.name = "nscale ruler (temporary)"; ruler.enabled = false; }
            var tp = srcText(ruler), d = tp.value;
            d.text = text; d.font = doc.font; d.fontSize = SOCIAL.heroSize; d.tracking = doc.tracking; d.applyFill = true;
            tp.setValue(d);
            w = ruler.sourceRectAtTime(T, false).width;
        } catch (e) {}
        widths[text] = w;
        return w;
    }
    function dropRuler() { if (ruler) { try { ruler.remove(); } catch (e) {} ruler = null; } }

    // ----- how the comp is now
    function snapChip(c) {
        var g = chipGeom(c), en = [], k;
        for (k = 0; k < c.kids.length; k++) en.push(c.kids[k].enabled);
        var pad = g.chipRight - g.textRight; if (!(pad > 10 && pad < 120)) pad = 43;
        return { doc: srcText(c.text).value, pos: tr(c.text, "ADBE Position").value, scale: g.gs, pad: pad, left: g.textLeft, chipOn: c.chip.enabled, kidsOn: en };
    }
    var keep = { dark: dark.value, hero: srcText(hero).value, heroPos: tr(hero, "ADBE Position").value, top: srcText(topL).value,
                 bot: srcText(botL).value, botOn: botL.enabled, date: snapChip(cDate), loc: snapChip(cLoc) };
    var heroBox = false, heroBoxSize = null, heroBoxPos = null;
    try { heroBox = keep.hero.boxText; if (heroBox) { heroBoxSize = keep.hero.boxTextSize; heroBoxPos = keep.hero.boxTextPos; } } catch (e1) {}

    function restoreChip(c, s) {
        srcText(c.text).setValue(s.doc);
        tr(c.text, "ADBE Position").setValue(s.pos);
        c.gt.property("ADBE Vector Scale").setValue(s.scale);
        c.chip.enabled = s.chipOn;
        for (var k = 0; k < c.kids.length; k++) c.kids[k].enabled = s.kidsOn[k];
    }
    function restoreAll() {
        try { dark.setValue(keep.dark); } catch (e) {}
        try { setGlassDrop(0, true); } catch (e) {}
        try { srcText(hero).setValue(keep.hero); tr(hero, "ADBE Position").setValue(keep.heroPos); } catch (e) {}
        try { srcText(topL).setValue(keep.top); } catch (e) {}
        try { srcText(botL).setValue(keep.bot); botL.enabled = keep.botOn; } catch (e) {}
        try { restoreChip(cDate, keep.date); } catch (e) {}
        try { restoreChip(cLoc, keep.loc); } catch (e) {}
    }

    // ----- one post
    function setLine(L, text) { var tp = srcText(L), d = tp.value; d.text = text; tp.setValue(d); }

    function heroLines(text) {                                         // the lines to set, and the widest one at full size
        var raw = String(text).replace(/\r\n?/g, "\n").split("\n"), lines = [], k, widest = 0;
        for (k = 0; k < raw.length; k++) { var s = raw[k].replace(/^\s+|\s+$/g, ""); if (s) lines.push(s); }
        if (lines.length === 1 && lineWidth(lines[0], keep.hero) > SOCIAL.heroMax + 4) {   // one long line: break it where the two halves are most even
            var words = lines[0].split(/\s+/), best = null;
            for (k = 1; k < words.length; k++) {
                var a = words.slice(0, k).join(" "), b = words.slice(k).join(" "), w = Math.max(lineWidth(a, keep.hero), lineWidth(b, keep.hero));
                if (!best || w < best.w) best = { w: w, lines: [a, b] };
            }
            if (best) lines = best.lines;
        }
        for (k = 0; k < lines.length; k++) widest = Math.max(widest, lineWidth(lines[k], keep.hero));
        return { lines: lines, widest: widest };
    }
    function setHero(text) {
        var hl = heroLines(text), lines = hl.lines, size = SOCIAL.heroSize, widest = hl.widest;
        if (widest > SOCIAL.heroMax + 4) { var smaller = Math.floor(size * SOCIAL.heroMax / widest); widest = widest * smaller / size; size = smaller; }
        var leading = Math.round(size * SOCIAL.heroLead * 10) / 10, tp = srcText(hero);
        tp.setValue(keep.hero); tr(hero, "ADBE Position").setValue(keep.heroPos);
        var d = tp.value;
        d.text = lines.join("\r"); d.fontSize = size;
        try { d.autoLeading = false; } catch (e) {}
        d.leading = leading;
        if (heroBox) {
            var h = Math.max(heroBoxSize[1], Math.ceil(leading * lines.length + size * 0.25));
            d.boxTextSize = [heroBoxSize[0], h];
            try { d.boxTextPos = [heroBoxPos[0], heroBoxPos[1]]; } catch (e2) {}
        }
        tp.setValue(d);
        if (heroBox) {                                                 // keep the first line where it was if the box grew from its centre
            var now = null; try { now = tp.value.boxTextPos; } catch (e3) {}
            if (now && Math.abs(now[1] - heroBoxPos[1]) > 0.5) { var hp = tr(hero, "ADBE Position").value; tr(hero, "ADBE Position").setValue([hp[0], hp[1] + (heroBoxPos[1] - now[1]), hp[2]]); }
        }
        return { size: size, lines: lines, width: widest };
    }
    function setChip(c, s, text) {
        restoreChip(c, s);
        text = String(text === null || text === undefined ? "" : text).replace(/^\s+|\s+$/g, "");
        if (!text) { c.chip.enabled = false; for (var k = 0; k < c.kids.length; k++) c.kids[k].enabled = false; return; }
        c.chip.enabled = true; for (var k2 = 0; k2 < c.kids.length; k2++) c.kids[k2].enabled = true;
        setLine(c.text, text);
        var g = chipGeom(c);
        if (Math.abs(g.textLeft - s.left) > 0.5) { var tp = tr(c.text, "ADBE Position").value; tr(c.text, "ADBE Position").setValue([tp[0] + (s.left - g.textLeft), tp[1], tp[2]]); g = chipGeom(c); }
        c.gt.property("ADBE Vector Scale").setValue([(g.textRight + s.pad - g.gpx) / g.unit * 100, s.scale[1]]);
    }
    function toComp(L, pt) {
        var q2 = [pt[0], pt[1]];
        while (L) {
            var po = tr(L, "ADBE Position").value, an = tr(L, "ADBE Anchor Point").value, sc = tr(L, "ADBE Scale").value;
            q2 = [po[0] + (q2[0] - an[0]) * sc[0] / 100, po[1] + (q2[1] - an[1]) * sc[1] / 100];
            L = L.parent;
        }
        return q2;
    }
    // how far the glass element has to drop to stay clear of the event name through the work area, and when it comes closest
    function measureGlass(heroWidth) {
        if (!glass) return null;
        var probe = null, out = null;
        try {
            var r = hero.sourceRectAtTime(T, false);
            if (heroBox) try { var hd = srcText(hero).value; r = { left: hd.boxTextPos[0], top: hd.boxTextPos[1], height: hd.boxTextSize[1] }; } catch (eB) {}
            var a = toComp(hero, [r.left, r.top]), b = toComp(hero, [r.left, r.top + r.height]);
            var x0 = a[0] - SOCIAL.gap, x1 = a[0] + heroWidth + SOCIAL.gap, y0 = a[1] - SOCIAL.gap, y1 = b[1] + SOCIAL.gap, gs = tr(glass, "ADBE Scale").value;
            probe = comp.layers.addShape(); probe.name = "nscale probe (temporary)"; probe.enabled = false;
            var sl = probe.property("ADBE Effect Parade").addProperty("ADBE Slider Control").property(1);
            sl.expression = "var L = thisComp.layer(\"" + SOCIAL.glass + "\"), out = 600;\n" +
                "for (var d = 0; d <= 600; d += 10) {\n" +
                "  var p = L.fromComp([" + ((x0 + x1) / 2) + ", " + ((y0 + y1) / 2) + " - d]);\n" +
                "  var s = L.sampleImage([p[0], p[1]], [" + ((x1 - x0) / 2 / (gs[0] / 100)) + ", " + ((y1 - y0) / 2 / (gs[1] / 100)) + "], true, time);\n" +
                "  if (s[3] < 0.0002) { out = d; break; }\n" +
                "}\nout;";
            out = { need: 0, at: T };
            var step = comp.frameDuration * 6, end = comp.workAreaStart + comp.workAreaDuration;
            for (var t = comp.workAreaStart; t <= end; t += step) { var v = sl.valueAtTime(t, false); if (v > out.need) { out.need = v; out.at = t; } }
        } catch (e) { out = null; }
        if (probe) try { probe.remove(); } catch (e2) {}
        return out;
    }
    function applyJob(job, notes) {
        var h = setHero(job.hero), label = job.name;
        setLine(topL, job.top || "");
        topL.enabled = !!String(job.top || "").replace(/\s+/g, "");
        botL.enabled = false;
        setChip(cDate, keep.date, job.date);
        setChip(cLoc, keep.loc, job.loc);
        dropRuler();
        setGlassDrop(0);
        var minDrop = Math.max(0, Math.round(+p.minDrop || 0)), m = p.clear ? measureGlass(h.width) : null, drop = Math.max(minDrop, m ? m.need : 0);
        h.at = m ? m.at : T;
        if (h.size < SOCIAL.heroSize) notes.push(label + ": event name set at " + h.size + " px to fit" + (h.size < SOCIAL.heroMin ? ". That is small: a shorter name would read better" : ""));
        if (p.clear && !m) notes.push(label + ": couldn't measure the glass element, so check it against the event name");
        if (drop) {
            var ok = setGlassDrop(drop);
            if (ok) { var was = glassPos.valueAtTime(T, true), is = glassPos.valueAtTime(T, false); if (Math.abs((is[1] - was[1]) - drop) > 1) ok = false; }
            notes.push(label + (ok ? ": glass element lowered " + drop + " px" : ": the glass element couldn't be lowered, so check it against the event name"));
        }
        return h;
    }
    function jobName(job) { return slug(job.name || String(job.hero).replace(/\s+/g, " ")); }

    // ----- apply only: leave the first post in the comp
    if (what === "apply") {
        var an = [], ah;
        app.beginUndoGroup("Nscale event social");
        try { jobs[0].name = jobName(jobs[0]); ah = applyJob(jobs[0], an); dark.setValue(MODES[0].dark); }
        catch (eA) { dropRuler(); app.endUndoGroup(); return "WARN:Stopped: " + eA.toString(); }
        app.endUndoGroup();
        try { comp.openInViewer(); } catch (eV) {}
        return "SOCIAL:" + js({ what: "apply", notes: an, made: [], files: [], folder: "" });
    }

    // ----- preview stills or renders, then put the comp back
    var rq = app.project.renderQueue, parked = [], r;
    function renderOne(fileName) {
        var item = rq.items.add(comp), om = item.outputModule(1), names = om.templates, pick = null, a, b, prefs = [/H\.264.*15 ?Mbps/i, /H\.264.*40 ?Mbps/i, /H\.264/i];
        for (a = 0; a < prefs.length && !pick; a++) for (b = 0; b < names.length; b++) if (prefs[a].test(names[b])) { pick = names[b]; break; }
        if (!pick) { item.remove(); throw new Error("No H.264 output template in this After Effects."); }
        om.applyTemplate(pick);
        item.timeSpanStart = comp.workAreaStart; item.timeSpanDuration = comp.workAreaDuration;
        om.file = new File(outFolder.fsName + "/" + fileName + ".mp4");
        var err = null;
        try { rq.render(); } catch (e) { err = e; }
        var ok = false; try { ok = item.status === RQItemStatus.DONE; } catch (e5) {}
        try { item.remove(); } catch (e6) {}
        if (err) throw err;
        if (!ok) throw new Error("the render stopped before it finished.");
    }
    if (what === "render") for (r = 1; r <= rq.numItems; r++) { var ri = rq.item(r); if (ri.status === RQItemStatus.QUEUED) { try { ri.render = false; parked.push(ri); } catch (e4) {} } }

    // Media Encoder: save this (temporary) project with the filled comp and one queued item, hand it to AME, carry on.
    // AME takes its own copy of the project at hand-off, so the next job can change the comp straight away.
    function queueOne(fileName) {
        var item = rq.items.add(comp), om = item.outputModule(1), names = om.templates, pick = null, a, b, prefs = [/H\.264.*15 ?Mbps/i, /H\.264.*40 ?Mbps/i, /H\.264/i];
        for (a = 0; a < prefs.length && !pick; a++) for (b = 0; b < names.length; b++) if (prefs[a].test(names[b])) { pick = names[b]; break; }
        if (!pick) { item.remove(); throw new Error("No H.264 output template in this After Effects."); }
        om.applyTemplate(pick);
        item.timeSpanStart = comp.workAreaStart; item.timeSpanDuration = comp.workAreaDuration;
        om.file = new File(outFolder.fsName + "/" + fileName + ".mp4");
        var proj = new File(p.ameDir + "/" + fileName + ".aep");
        app.project.save(proj);
        var err = null;
        try { rq.queueInAME(true); } catch (e) { err = e; }
        try { item.remove(); } catch (e6) {}
        if (err) throw new Error("Media Encoder didn't take the job: " + err.toString());
    }

    var made = [], files = [], notes = [], failed = "", list = what === "preview" ? [jobs[0]] : jobs, used = {};
    try {
        for (var j = 0; j < list.length && !failed; j++) {
            var job = list[j]; job.name = jobName(job);
            if (used[job.name]) { var n = 2; while (used[job.name + "-" + n]) n++; job.name = job.name + "-" + n; }
            used[job.name] = true;
            var h = applyJob(job, notes);
            for (var m2 = 0; m2 < MODES.length; m2++) {
                dark.setValue(MODES[m2].dark);
                var fn = job.name + MODES[m2].suffix;
                try {
                    if (what === "preview") { var pf = new File(outFolder.fsName + "/" + fn + ".png"); if (pf.exists) pf.remove(); comp.saveFrameToPng(h.at, pf); files.push(pf.fsName); }
                    else if (what === "ame") { queueOne(fn); made.push(fn + ".mp4"); }
                    else { renderOne(fn); made.push(fn + ".mp4"); }
                } catch (eR) { failed = fn + ": " + eR.toString(); break; }
            }
        }
    } catch (err2) { failed = err2.toString() + (err2.line ? " (line " + err2.line + ")" : ""); }
    dropRuler();
    restoreAll();
    for (r = 0; r < parked.length; r++) try { parked[r].render = true; } catch (e7) {}
    return "SOCIAL:" + js({ what: what, notes: notes, made: made, files: files, failed: failed, folder: outFolder ? outFolder.fsName : "", total: list.length * MODES.length });
}

// ---------- Social via Media Encoder: works in a temp copy of the bundled template project, then reopens yours ----------
// Why a copy: After Effects writes Auto-Save files next to whatever it opens, and nothing may be written inside
// the signed extension folder. Why reopen: AME reads the project from disk, so the filled comp has to be saved
// somewhere, and that somewhere should never be the user's own project.
function socialTemplateFile(p) {
    if (p.templateFile) { var f0 = new File(p.templateFile); if (f0.exists) return f0; }
    if (!NSM_EXT) return null;
    var f = new File(NSM_EXT.fsName + "/assets/social-templates.aep");
    return f.exists ? f : null;
}
function socialListTemplates() {
    var out = [];
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i); if (!(it instanceof CompItem)) continue;
        try { if (it.layer("Theme \u00b7 controls")) out.push(it.name); } catch (e) {}
    }
    return out;
}
function socialInTemplate(p, body) {
    var tpl = socialTemplateFile(p);
    if (!tpl) return "WARN:The social template project isn't in this panel (assets/social-templates.aep). Reinstall, or Choose a template file.";

    // the user's project: save it so we can come back to it
    var mine = app.project.file, hadItems = app.project.numItems > 0;
    if (!mine && hadItems) return "WARN:Save your project first, so it can be reopened after the hand-off.";
    if (mine) { try { app.project.save(); } catch (eS) { return "WARN:Couldn't save your project: " + eS.toString(); } }

    // a working copy of the template, in the temp folder
    var work = new Folder(Folder.temp.fsName + "/nscale-social-ame"); if (!work.exists) work.create();
    var copy = new File(work.fsName + "/template-" + Date.now() + ".aep");
    if (!tpl.copy(copy)) return "WARN:Couldn't copy the template project to " + work.fsName;
    p.ameDir = work.fsName;

    var result;
    try {
        app.open(copy);
        result = body(p);
    } catch (eR) { result = "WARN:" + eR.toString() + (eR.line ? " (line " + eR.line + ")" : ""); }
    // back to the user's project (a new empty one if they had none)
    try { if (mine) app.open(mine); else app.newProject(); } catch (eB) { result += " \u00b7 and your project didn't reopen: " + eB.toString(); }
    return result;
}
function socialScan(p) {
    nsmSetExt(p);
    return socialInTemplate(p, function () {
        var names = socialListTemplates();
        setSetting("socialTemplates", names.join("|"));
        return "SOCIAL:" + js({ what: "scan", templates: names });
    });
}
// Generic template comp: every job field is set on the text layer of the same name; "Dark mode" is the light/dark switch.
// Used for any template comp that doesn't have the event layout (Heading + two Subheadings + chips).
function socialIsEventComp(c) { try { return !!(c.layer("Heading") && c.layer("chip-date")); } catch (e) { return false; } }
function socialGenericRun(p) {
    var jobs = p.jobs || [], i, j, m;
    var MODES = []; if (p.light) MODES.push({ suffix: "_light", dark: 0 }); if (p.dark) MODES.push({ suffix: "_dark", dark: 1 });
    if (!MODES.length) return "WARN:Tick Light, Dark or both.";
    var comp = null;
    for (i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === p.template) { comp = it; break; } }
    if (!comp) return "WARN:No comp called \u201c" + p.template + "\u201d in the template project.";
    var dark = null; try { dark = comp.layer("Theme \u00b7 controls").property("ADBE Effect Parade").property("Dark mode").property(1); } catch (e0) {}
    var outFolder = p.folder ? new Folder(p.folder) : socialFolder();
    if (!outFolder) return "WARN:Choose a save folder first.";
    if (!outFolder.exists && !outFolder.create()) return "WARN:Couldn't create " + outFolder.fsName;
    function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "post"; }
    function setText(L, text) { var tp = L.property("ADBE Text Properties").property("ADBE Text Document"); var d = tp.value; d.text = String(text).replace(/\r\n|\n/g, "\r"); tp.setValue(d); }
    var rq = app.project.renderQueue, made = [], notes = [], failed = "", used = {};
    for (j = 0; j < jobs.length && !failed; j++) {
        var job = jobs[j], fields = job.fields || {}, name = slug(job.name || job.label || job.hero || "post");
        if (used[name]) { var n = 2; while (used[name + "-" + n]) n++; name = name + "-" + n; } used[name] = true;
        var unset = [];
        for (var k in fields) { if (!fields.hasOwnProperty(k)) continue; var L = null; try { L = comp.layer(k); } catch (eL) {} if (L && L instanceof TextLayer) setText(L, fields[k]); else unset.push(k); }
        if (unset.length) notes.push(name + ": no text layer called " + unset.join(", ") + " in " + comp.name);
        for (m = 0; m < MODES.length; m++) {
            if (dark) dark.setValue(MODES[m].dark);
            var fn = name + MODES[m].suffix;
            try {
                var item = rq.items.add(comp), om = item.outputModule(1), names = om.templates, pick = null, a, b, prefs = [/H\.264.*15 ?Mbps/i, /H\.264.*40 ?Mbps/i, /H\.264/i];
                for (a = 0; a < prefs.length && !pick; a++) for (b = 0; b < names.length; b++) if (prefs[a].test(names[b])) { pick = names[b]; break; }
                if (!pick) { item.remove(); throw new Error("No H.264 output template in this After Effects."); }
                om.applyTemplate(pick); item.timeSpanStart = comp.workAreaStart; item.timeSpanDuration = comp.workAreaDuration;
                om.file = new File(outFolder.fsName + "/" + fn + ".mp4");
                app.project.save(new File(p.ameDir + "/" + fn + ".aep"));
                var err = null; try { rq.queueInAME(true); } catch (eQ) { err = eQ; }
                try { item.remove(); } catch (e6) {}
                if (err) throw new Error("Media Encoder didn't take the job: " + err.toString());
                made.push(fn + ".mp4");
            } catch (eR) { failed = fn + ": " + eR.toString(); break; }
        }
    }
    return "SOCIAL:" + js({ what: "ame", notes: notes, made: made, files: [], failed: failed, folder: outFolder.fsName, total: jobs.length * MODES.length });
}
function socialAME(p) {
    nsmSetExt(p);
    return socialInTemplate(p, function (q) {
        var names = socialListTemplates(); setSetting("socialTemplates", names.join("|"));
        if (!names.length) return "WARN:The template project has no comp with a \u201cTheme \u00b7 controls\u201d layer.";
        if (q.template && !has(names, q.template)) q.template = names[0];
        if (!q.template) q.template = names[0];
        q.what = "ame";
        // group the jobs by the template comp they ask for (a Notion row can name one); one socialRun per group
        var groups = {}, order = [], gi;
        for (gi = 0; gi < q.jobs.length; gi++) { var tn = (q.jobs[gi].template && has(names, q.jobs[gi].template)) ? q.jobs[gi].template : q.template; if (!groups[tn]) { groups[tn] = []; order.push(tn); } groups[tn].push(q.jobs[gi]); }
        var all = { what: "ame", notes: [], made: [], files: [], failed: "", folder: "", total: 0, templates: names, template: q.template };
        for (gi = 0; gi < order.length && !all.failed; gi++) {
            var sub = {}; for (var k in q) if (q.hasOwnProperty(k)) sub[k] = q[k];
            sub.template = order[gi]; sub.jobs = groups[order[gi]];
            var tc = null; for (var ci = 1; ci <= app.project.numItems; ci++) { var cit = app.project.item(ci); if (cit instanceof CompItem && cit.name === sub.template) { tc = cit; break; } }
            var r = (tc && socialIsEventComp(tc)) ? socialRun(sub) : socialGenericRun(sub);
            if (r.indexOf("SOCIAL:") !== 0) { all.failed = r.replace(/^WARN:/, ""); break; }
            try { var o = eval("(" + r.slice(7) + ")"); all.notes = all.notes.concat(o.notes || []); all.made = all.made.concat(o.made || []); all.folder = o.folder || all.folder; all.total += o.total || 0; if (o.failed) all.failed = o.failed; } catch (eJ) { all.failed = "couldn't read the result"; }
        }
        return "SOCIAL:" + js(all);
    });
    function has(arr, v) { for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true; return false; }
}

// ---------- Dispatcher: the HTML panel calls nsm_run(action, payload) ----------
// Returns "OK:message", "WARN:message", "PATH:folder", "STEP:key|message", "SENT:name|what|problems",
// "CURVE:x1,y1,x2,y2|where|frames", "THEME:{json}", "NOTES:{json}", "COMP:id|name", "TEMPLATES:[json]" or "SOCIAL:{json}".
function nsm_run(action, p) {
    try {
        if (action === "chooseScripts") { var sd = Folder.selectDialog("Choose the Scripts folder in Google Drive (Motion / Scripts)"); return sd ? "PATH:" + sd.fsName : "WARN:No folder chosen."; }
        if (action === "runLatest") return runLatestScript(p.folder);
        if (action === "buildMogrts") return nsmBuildPremiereTemplates(true);
        if (action === "runBundled") return runBundled(p.name);
        if (action === "social") return socialRun(p);
        if (action === "chooseFile") { var cf = File.openDialog(p.title || "Choose a file"); return cf ? "PATH:" + cf.fsName : "WARN:No file chosen."; }
        if (action === "socialAME") return socialAME(p);
        if (action === "socialScan") return socialScan(p);
        if (action === "socialTemplates") { var st = getSetting("socialTemplates", ""); return "SOCIAL:" + js({ what: "list", templates: st ? st.split("|") : [] }); }
        if (action === "chooseInbox") { var fd = Folder.selectDialog("Choose the Claude inbox folder in Google Drive"); return fd ? "PATH:" + fd.fsName : "WARN:No folder chosen."; }
        if (action === "chooseFolder") return chooseFolder(p.title);
        if (action === "activeComp") return activeCompId();
        if (action === "notesGet") return notesGet();
        if (action === "notesSet") return notesSet(p);
        if (action === "openComp") return openComp(p.id);
        if (action === "themeMode" && p.scope === "all") { app.beginUndoGroup("Nscale theme mode"); try { return themeSetMode(!!p.dark, "all"); } finally { app.endUndoGroup(); } }
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) return "WARN:Open a composition first.";
        var issues = [], msg = "";
        if (action === "anchor") { app.beginUndoGroup("Nscale anchor point"); try { return setAnchor(comp, p.point || "c"); } finally { app.endUndoGroup(); } }
        if (action === "readCurve") return readCurve(comp);
        if (action === "textMove") { app.beginUndoGroup("Nscale text move"); try { return textMove(comp, p); } finally { app.endUndoGroup(); } }
        if (action === "review") { app.beginUndoGroup("Nscale review box"); try { return makeReview(comp, p); } finally { app.endUndoGroup(); } }
        if (action === "reviewRemove") { app.beginUndoGroup("Nscale remove review box"); try { return removeReview(comp); } finally { app.endUndoGroup(); } }
        if (action === "themeState") return themeState(comp);
        if (action === "themeLink") { app.beginUndoGroup("Nscale link theme colours"); try { return themeLink(comp); } finally { app.endUndoGroup(); } }
        if (action === "themeMode") { app.beginUndoGroup("Nscale theme mode"); try { return themeSetMode(!!p.dark, "comp"); } finally { app.endUndoGroup(); } }
        if (action === "themeToken") { app.beginUndoGroup("Nscale theme colour"); try { return themeSetToken(comp, p); } finally { app.endUndoGroup(); } }
        if (action === "renderTemplates") return renderTemplates();
        if (action === "render") return renderPreset(comp, p);
        if (action === "step" || action === "stepBy" || action === "curve") {
            var targets = getTargets(comp);
            if (!targets.length) return "WARN:Select at least two keyframes on a property.";
            var key = p.step;
            app.beginUndoGroup("Nscale " + action);
            try {
                if (action === "stepBy") {
                    var cur = currentSpacing(targets[0]);
                    key = STEP_ORDER[Math.max(0, Math.min(STEP_ORDER.length - 1, nearestStepIndex(cur, p.mode) + p.dir))];
                }
                if (action !== "curve") {
                    var secs = stepSeconds(comp, key, p.mode, p.snap);
                    for (var t = 0; t < targets.length; t++) retime(targets[t], secs, issues);
                    msg = key + " " + Math.round(secs / comp.frameDuration) + "f \u00b7 " + p.curveName;
                } else msg = "Curve only \u00b7 " + p.curveName;
                if (p.bez) for (var u = 0; u < targets.length; u++) if (applyCurve(targets[u], p.bez, issues) && p.colour) labelSelectedSegments(targets[u], p.label);
                msg = targetSummary(targets) + " \u00b7 " + msg;
            } finally { app.endUndoGroup(); }
            return (action === "curve" ? "OK:" : "STEP:" + key + "|") + msg + (issues.length ? " \u00b7 " + issues.join(" ") : "");
        }
        if (action === "beat") {
            var bt = beatTargets(comp);
            if (!bt.length) return "WARN:Select a keyframe where the beat should start.";
            var bsecs = stepSeconds(comp, p.step, p.mode, true), bn = 0;
            app.beginUndoGroup("Nscale add beat");
            try { for (var b = 0; b < bt.length; b++) if (addBeat(bt[b], bsecs)) bn++; } finally { app.endUndoGroup(); }
            return "OK:Beat " + p.step + " " + Math.round(bsecs / comp.frameDuration) + "f added on " + targetSummary(bt) + " \u00b7 press again to add another";
        }
        if (action === "null") {
            app.beginUndoGroup("Nscale null");
            try { return makeNull(comp, p.parent !== false); } finally { app.endUndoGroup(); }
        }
        if (action === "clone") {
            app.beginUndoGroup("Nscale clone keyframes" + (p.kind && p.kind !== "simple" ? " (" + p.kind + ")" : ""));
            try { return cloneKeys(comp, p); } finally { app.endUndoGroup(); }
        }
        if (action === "stagger") {
            var layers = []; for (var i = 0; i < comp.selectedLayers.length; i++) layers.push(comp.selectedLayers[i]);
            if (layers.length < 2) return "WARN:Select two or more layers.";
            var how = { "Selection": "selection", "Layer stack": "stack", "Left to right": "ltr", "Right to left": "rtl", "Centre out": "centre" }[p.order] || "selection";
            var ordered = orderLayers(layers, how, comp); if (p.rev) ordered.reverse();
            var stepS = stepSeconds(comp, p.step, p.mode, true), offs = staggerOffsets(ordered.length, stepS, String(p.spacing).toLowerCase(), p.mode, comp, p.bez);
            app.beginUndoGroup("Nscale stagger");
            try {
                if (p.apply === "layers") {
                    var base = p.start === "playhead" ? comp.time - (ordered[0].inPoint - ordered[0].startTime) : ordered[0].startTime;
                    for (var j = 0; j < ordered.length; j++) ordered[j].startTime = base + offs[j];
                } else for (var k = 1; k < ordered.length; k++) shiftSelectedKeys(ordered[k], offs[k]);
            } finally { app.endUndoGroup(); }
            return "OK:Staggered " + ordered.length + " layers \u00b7 " + p.step + " " + Math.round(stepS / comp.frameDuration) + "f \u00b7 " + String(p.spacing).toLowerCase();
        }
        if (action === "send") {
            var folder = p.inbox ? new Folder(p.inbox) : null;
            if (!folder || !folder.exists) return "WARN:Choose the inbox folder first.";
            EDITS = p.edits || {};
            var baseName = slug(p.name || comp.name), v = nextVersion(folder, baseName), name = baseName + "_v" + pad2(v), stem = folder.fsName + "/" + name, sent = [], problems = [];
            if (p.json) { var f = new File(stem + ".json"); f.encoding = "UTF-8"; if (f.open("w")) { f.write(lookJSON(comp, p.notes, p.mode)); f.close(); sent.push("json"); } else problems.push("can't write files: switch on 'Allow Scripts to Write Files and Access Network'"); }
            if (p.sheet) { if (contactSheet(comp, p.sheet, new File(stem + "_sheet.png"))) sent.push("sheet"); else problems.push("contact sheet failed"); }
            if (p.mp4) { var r = renderDraft(comp, new File(stem + ".mp4")); if (r) problems.push("draft: " + r); else sent.push("mp4"); }
            cleanTemp(folder, name);
            var report = name + "\n" + new Date().toString() + "\n\nNOTES\n" + (p.notes || "(none)") + "\n";
            if (problems.length) report += "\nSEND PROBLEMS\n- " + problems.join("\n- ") + "\n";
            if (LAST_ERRORS.length) { report += "\nEXPRESSION ERRORS (" + LAST_ERRORS.length + ")\n"; for (var x = 0; x < LAST_ERRORS.length; x++) report += "- " + LAST_ERRORS[x].layer + " > " + LAST_ERRORS[x].property + ": " + LAST_ERRORS[x].error + "\n"; }
            if (LAST_WARNINGS.length) report += "\nWARNINGS\n- " + LAST_WARNINGS.join("\n- ") + "\n";
            var latest = new File(folder.fsName + "/latest.txt"); latest.encoding = "UTF-8"; if (latest.open("w")) { latest.write(report); latest.close(); }
            if (LAST_ERRORS.length) problems.push(LAST_ERRORS.length + " expression error" + (LAST_ERRORS.length === 1 ? "" : "s") + " included for Claude");
            return "SENT:" + name + "|" + sent.join(" \u00b7 ") + "|" + (problems.length ? problems.join("; ") : "");
        }
        return "WARN:Unknown action " + action;
    } catch (err) { return "WARN:Error: " + err.toString() + (err.line ? " (line " + err.line + ")" : ""); }
}
