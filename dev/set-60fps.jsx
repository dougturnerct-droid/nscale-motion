// Sets comps to 60 fps and keeps every keyframe where it is in time (AE stores keys in seconds, so changing the
// frame rate never changes timing). Keys that landed between 60 fps frames are then nudged to the nearest frame
// (at most 8 ms) so they sit on whole frames in the timeline; values, eases, interpolation, hold and labels kept.
// Runs on the comps selected in the Project panel, or the open comp if none are selected. Re-run safe.
(function () {
    var TARGET = 60, comps = [];
    for (var i = 0; i < app.project.selection.length; i++) if (app.project.selection[i] instanceof CompItem) comps.push(app.project.selection[i]);
    if (!comps.length && app.project.activeItem instanceof CompItem) comps.push(app.project.activeItem);
    if (!comps.length) { alert("Select comps in the Project panel, or open one."); return; }
    var moved = 0, F = 1 / TARGET, skipped = [];

    function snapKeys(p) {
        if (!p.canVaryOverTime || !p.numKeys) return;
        var keys = [], k;
        for (k = 1; k <= p.numKeys; k++) {
            var key = { t: p.keyTime(k), v: p.keyValue(k), inI: p.keyInInterpolationType(k), outI: p.keyOutInterpolationType(k) };
            try { key.inE = p.keyInTemporalEase(k); key.outE = p.keyOutTemporalEase(k); } catch (e) {}
            try { key.cont = p.keyTemporalContinuous(k); key.auto = p.keyTemporalAutoBezier(k); } catch (e2) {}
            try { if (p.isSpatial) { key.inT = p.keyInSpatialTangent(k); key.outT = p.keyOutSpatialTangent(k); } } catch (e3) {}
            try { key.label = p.keyLabel(k); } catch (e4) {}
            keys.push(key);
        }
        var offGrid = false;
        for (k = 0; k < keys.length; k++) { var r = keys[k].t / F; if (Math.abs(r - Math.round(r)) > 0.001) { offGrid = true; break; } }
        if (!offGrid) return;
        if (p.matchName === "ADBE Marker" || p.propertyValueType === PropertyValueType.NO_VALUE) return;
        try { while (p.numKeys) p.removeKey(1); } catch (eR) { skipped.push(p.propertyGroup(p.propertyDepth - 1).name + " > " + p.name); return; }
        for (k = 0; k < keys.length; k++) {
            var src = keys[k], t = Math.round(src.t / F) * F;
            // never let two keys collapse onto one frame
            if (k > 0 && t <= keys[k - 1].t) t = keys[k - 1].t + F;
            keys[k].t = t;
            p.setValueAtTime(t, src.v);
            var idx = p.nearestKeyIndex(t);
            try { p.setInterpolationTypeAtKey(idx, src.inI, src.outI); } catch (e5) {}
            if (src.inE && src.outE) { try { p.setTemporalContinuousAtKey(idx, false); p.setTemporalAutoBezierAtKey(idx, false); p.setTemporalEaseAtKey(idx, src.inE, src.outE); } catch (e6) {} }
            try { if (src.cont !== undefined) { p.setTemporalContinuousAtKey(idx, src.cont); p.setTemporalAutoBezierAtKey(idx, src.auto); } } catch (e7) {}
            try { if (src.inT) { p.setSpatialTangentsAtKey(idx, src.inT, src.outT); } } catch (e8) {}
            try { if (src.label !== undefined) p.setLabelAtKey(idx, src.label); } catch (e9) {}
            moved++;
        }
    }
    function walk(g) { for (var i = 1; i <= g.numProperties; i++) { var p = g.property(i); if (p.propertyType === PropertyType.PROPERTY) snapKeys(p); else walk(p); } }

    app.beginUndoGroup("Comps to 60 fps");
    for (var c = 0; c < comps.length; c++) {
        var comp = comps[c];
        comp.frameRate = TARGET;
        for (var L = 1; L <= comp.numLayers; L++) {
            var lay = comp.layer(L), locked = lay.locked; if (locked) lay.locked = false;
            walk(lay);
            if (locked) lay.locked = true;
        }
    }
    app.endUndoGroup();
    alert(comps.length + " comp(s) set to 60 fps. " + moved + " keyframes nudged onto whole frames (max 8 ms)." + (skipped.length ? "\nCould not re-time: " + skipped.join(", ") : ""));
})();
