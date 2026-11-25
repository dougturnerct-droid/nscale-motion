// Exit = the whole enter played backwards. The enter sequence (from the first key in the comp to the last enter key)
// is mirrored as one block ending at the work-area end, so the stagger reverses: what came in last goes out first,
// what came in first (the panels) goes out last. Eases are swapped. Mirrored keys get a red label; re-running replaces them.
// Layers that entered by position only (rows, tag, headline...) also fade out over their exit move (exit curve),
// and their parented children fade with them (opacity doesn't inherit through parenting).
// Effects listed in NO_EXIT_EFFECTS (Progress, Pass) are one-way and are left alone; the layers they sit on still fade with their row.
// Set the work area to the card length first.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the card comp first."); return; }
    var OUT_END = comp.workAreaStart + comp.workAreaDuration, F = 1 / comp.frameRate;
    var EXIT_LABEL = 1, EXIT = [0.85, 0, 0.7, 0.7];
    var props = 0, added = 0, faded = 0;

    function snap(t) { return Math.round(t / F) * F; }
    function isExit(p, i) { var lb = 0; try { lb = p.keyLabel(i); } catch (e) {} return lb === EXIT_LABEL; }
    function dropExit(p) { for (var i = p.numKeys; i >= 1; i--) if (isExit(p, i)) p.removeKey(i); }
    function walk(g, fn) { for (var i = 1; i <= g.numProperties; i++) { var p = g.property(i); if (p.propertyType === PropertyType.PROPERTY) fn(p); else walk(p, fn); } }
    // effects whose keys are NOT part of the enter and must not be mirrored (one-way things: progress bars, pass wipes, counts)
    var NO_EXIT_EFFECTS = { "Progress": 1, "Pass": 1 };
    function inSkippedEffect(p) { try { var g = p.propertyGroup(1); return g && g.propertyGroup(1).matchName === "ADBE Effect Parade" && NO_EXIT_EFFECTS[g.name] === 1; } catch (e) { return false; } }
    function keyed(p) { return p.canVaryOverTime && p.numKeys >= 2 && p.matchName !== "ADBE Marker" && !inSkippedEffect(p); }

    // ---- pass 1: clear old exits, find the enter block [T0, T1] across the whole comp.
    // Keys you've set by hand for an exit are told apart from the enter by the biggest gap in the comp's key times
    // (more than GAP_MIN): anything after that gap is an existing exit, left alone and not mirrored.
    var GAP_MIN = 0.75, times = [];
    for (var L = 1; L <= comp.numLayers; L++) walk(comp.layer(L), function (p) {
        if (!p.canVaryOverTime || !p.numKeys) return;
        dropExit(p);
        if (p.numKeys < 2 || inSkippedEffect(p)) return;
        for (var k = 1; k <= p.numKeys; k++) times.push(p.keyTime(k));
    });
    if (times.length < 2) { alert("No enter keyframes found."); return; }
    times.sort(function (a, b) { return a - b; });
    var SPLIT = Infinity, bestGap = 0;
    for (var g = 1; g < times.length; g++) { var gap = times[g] - times[g - 1]; if (gap > bestGap) { bestGap = gap; if (gap > GAP_MIN) SPLIT = times[g]; } }
    var T0 = times[0], T1 = -Infinity;
    for (var q = 0; q < times.length; q++) if (times[q] < SPLIT) T1 = Math.max(T1, times[q]);
    if (T1 <= T0) { alert("No enter keyframes found."); return; }
    var ownExit = {};   // layer index -> true when it already has hand-made exit keys
    if (OUT_END - (T1 - T0) <= T1) { alert("No room: the work area ends before the enter finishes plus its mirror."); return; }
    function mirrorT(t) { return snap(OUT_END - (t - T0)); }

    // ---- pass 2: mirror every keyed property as a block
    var exitSpan = {};   // layer index -> [start, end] of its exit, for the fades
    function mirror(p, layerIdx) {
        if (!keyed(p)) return;
        for (var q = 1; q <= p.numKeys; q++) if (p.keyTime(q) >= SPLIT) { ownExit[layerIdx] = true; return; }   // has its own exit already
        var keys = [], n = p.numKeys, k;
        for (k = 1; k <= n; k++) {
            var key = { t: p.keyTime(k), v: p.keyValue(k), inI: p.keyInInterpolationType(k), outI: p.keyOutInterpolationType(k), inE: null, outE: null };
            try { key.inE = p.keyInTemporalEase(k); key.outE = p.keyOutTemporalEase(k); } catch (e2) {}
            keys.push(key);
        }
        var times = [];
        for (var j = n - 1; j >= 0; j--) { var t = mirrorT(keys[j].t); p.setValueAtTime(t, keys[j].v); times.push(t); }
        for (var m = 0; m < times.length; m++) {
            var src = keys[n - 1 - m], idx = p.nearestKeyIndex(times[m]);
            try { p.setInterpolationTypeAtKey(idx, src.outI, src.inI); } catch (e3) {}
            if (src.inE && src.outE) { try { p.setTemporalContinuousAtKey(idx, false); p.setTemporalAutoBezierAtKey(idx, false); p.setTemporalEaseAtKey(idx, src.outE, src.inE); } catch (e4) {} }
            try { p.setLabelAtKey(idx, EXIT_LABEL); } catch (e5) {}
            added++;
        }
        props++;
        var s = times[0], e = times[times.length - 1], cur = exitSpan[layerIdx];   // times[0] = mirror of the last enter key = exit start
        exitSpan[layerIdx] = cur ? [Math.min(cur[0], s), Math.max(cur[1], e)] : [s, e];
    }

    // ---- fade: opacity 100 -> 0 over [s, e] with the exit curve, red labels
    function fade(layer, s, e) {
        var op = layer.property("ADBE Transform Group").property("ADBE Opacity");
        var T = e - s, d = 100, c = EXIT;
        op.setValueAtTime(s, 100); op.setValueAtTime(e, 0);
        var k1 = op.nearestKeyIndex(s), k2 = op.nearestKeyIndex(e);
        op.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        op.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        try { op.setTemporalContinuousAtKey(k1, false); op.setTemporalAutoBezierAtKey(k1, false); op.setTemporalContinuousAtKey(k2, false); op.setTemporalAutoBezierAtKey(k2, false); } catch (e1) {}
        op.setTemporalEaseAtKey(k1, [new KeyframeEase(0, 0.1)], [new KeyframeEase((c[1] / c[0]) * d / T, c[0] * 100)]);
        op.setTemporalEaseAtKey(k2, [new KeyframeEase(((1 - c[3]) / (1 - c[2])) * d / T, (1 - c[2]) * 100)], [new KeyframeEase(0, 0.1)]);
        try { op.setLabelAtKey(k1, EXIT_LABEL); op.setLabelAtKey(k2, EXIT_LABEL); } catch (e6) {}
        faded++;
    }
    function hasEnterOpacity(layer) { var op = layer.property("ADBE Transform Group").property("ADBE Opacity"); for (var i = 1; i <= op.numKeys; i++) if (!isExit(op, i)) return true; return false; }
    function isPanelOrFrame(layer) { return /^(Panel|Frame|Corner)/.test(layer.name); }
    function descendsFrom(layer, idx) { var p = layer.parent, guard = 0; while (p && guard++ < 20) { if (p.index === idx) return true; p = p.parent; } return false; }

    app.beginUndoGroup("Exit: reverse of enter");
    var Li;
    for (Li = 1; Li <= comp.numLayers; Li++) { var lay = comp.layer(Li), wasLocked = lay.locked; if (wasLocked) lay.locked = false; walk(lay, (function (ix) { return function (p) { mirror(p, ix); }; })(Li)); if (wasLocked) lay.locked = true; }
    // fades: a layer whose transform was keyed but whose enter had no opacity keys, except panels and frame lines
    for (Li = 1; Li <= comp.numLayers; Li++) {
        var lay2 = comp.layer(Li), span = exitSpan[Li];
        if (!span || ownExit[Li] || isPanelOrFrame(lay2) || hasEnterOpacity(lay2)) continue;
        var wl = lay2.locked; if (wl) lay2.locked = false;
        fade(lay2, span[0], span[1]);
        for (var C = 1; C <= comp.numLayers; C++) { var ch = comp.layer(C); if (C !== Li && descendsFrom(ch, Li) && !exitSpan[C]) { var wc = ch.locked; if (wc) ch.locked = false; fade(ch, span[0], span[1]); if (wc) ch.locked = true; } }
        if (wl) lay2.locked = true;
    }
    app.endUndoGroup();
    var own = 0; for (var o in ownExit) if (ownExit.hasOwnProperty(o)) own++;
    alert("Exit: " + props + " properties mirrored (" + added + " keys), " + faded + " layers fade out. Enter block " + T0.toFixed(2) + "-" + T1.toFixed(2) + " s reversed to end at " + OUT_END.toFixed(2) + " s." + (own ? "\n" + own + " layers already had their own exit keys (after " + SPLIT.toFixed(2) + " s) and were left alone." : ""));
})();
