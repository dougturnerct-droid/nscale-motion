// Exit = the enter reversed. For every keyframed property in the open comp, mirrors its keys so the move plays
// backwards and ends at the work-area end (set the work area to the card's length first, e.g. 4 s).
// Eases are swapped (exit is enter reversed). Mirrored keys get a red label; re-running replaces them.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the card comp first."); return; }
    var OUT_END = comp.workAreaStart + comp.workAreaDuration, F = 1 / comp.frameRate;
    var EXIT_LABEL = 1, props = 0, added = 0;

    function mirror(p) {
        if (!p.canVaryOverTime || p.numKeys < 2) return;
        // drop earlier mirrored keys
        for (var i = p.numKeys; i >= 1; i--) { var lb = 0; try { lb = p.keyLabel(i); } catch (e) {} if (lb === EXIT_LABEL) p.removeKey(i); }
        if (p.numKeys < 2) return;
        var keys = [], n = p.numKeys;
        for (var k = 1; k <= n; k++) {
            var key = { t: p.keyTime(k), v: p.keyValue(k), inI: p.keyInInterpolationType(k), outI: p.keyOutInterpolationType(k), inE: null, outE: null };
            try { key.inE = p.keyInTemporalEase(k); key.outE = p.keyOutTemporalEase(k); } catch (e2) {}
            keys.push(key);
        }
        var first = keys[0].t, last = keys[n - 1].t, span = last - first;
        if (OUT_END - span <= last) return;   // no room for an exit after the enter
        var times = [];
        for (var j = n - 1; j >= 0; j--) {
            var src = keys[j], t = OUT_END - (src.t - first);
            t = Math.round(t / F) * F;
            p.setValueAtTime(t, src.v); times.push(t);
        }
        // eases: the key that was the enter's end becomes the exit's start, and vice versa; swap in/out
        // (indices are looked up after all keys exist, since adding earlier keys shifts later ones)
        for (var m = 0; m < times.length; m++) {
            var src2 = keys[n - 1 - m], idx2 = p.nearestKeyIndex(times[m]);
            try { p.setInterpolationTypeAtKey(idx2, src2.outI, src2.inI); } catch (e3) {}
            if (src2.inE && src2.outE) { try { p.setTemporalContinuousAtKey(idx2, false); p.setTemporalAutoBezierAtKey(idx2, false); p.setTemporalEaseAtKey(idx2, src2.outE, src2.inE); } catch (e4) {} }
            try { p.setLabelAtKey(idx2, EXIT_LABEL); } catch (e5) {}
            added++;
        }
        props++;
    }
    function walk(g) {
        for (var i = 1; i <= g.numProperties; i++) {
            var p = g.property(i);
            if (p.propertyType === PropertyType.PROPERTY) mirror(p); else walk(p);
        }
    }
    app.beginUndoGroup("Exit: reverse of enter");
    for (var L = 1; L <= comp.numLayers; L++) walk(comp.layer(L));
    app.endUndoGroup();
    alert("Exit added on " + props + " properties (" + added + " keys), ending at " + OUT_END.toFixed(2) + " s (work-area end).");
})();
