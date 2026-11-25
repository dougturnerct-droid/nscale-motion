// cluster-02 out: the rack grid leaves with the rest (rack-null drops 24 px, grid layers fade), and the metric
// counts stop reversing (their Count exit keys are removed so the numbers hold). Re-run safe.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the cluster-02 comp first."); return; }
    var T0 = 4.32, DUR = 0.64;                        // grid exit: between the headline (4.36) and the metrics (4.28), same length as yours
    var EXIT = [0.85, 0, 0.7, 0.7], RED = 1, RISE = 24;
    function layer(n) { try { return comp.layer(n); } catch (e) { return null; } }
    function isExit(p, i) { var lb = 0; try { lb = p.keyLabel(i); } catch (e) {} return lb === RED; }
    function key(prop, t0, v0, t1, v1) {
        for (var i = prop.numKeys; i >= 1; i--) if (isExit(prop, i)) prop.removeKey(i);
        prop.setValueAtTime(t0, v0); prop.setValueAtTime(t1, v1);
        var k1 = prop.nearestKeyIndex(t0), k2 = prop.nearestKeyIndex(t1), d = Math.abs(v1 - v0) || 1, T = t1 - t0, c = EXIT;
        prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        try { prop.setTemporalContinuousAtKey(k1, false); prop.setTemporalAutoBezierAtKey(k1, false); prop.setTemporalContinuousAtKey(k2, false); prop.setTemporalAutoBezierAtKey(k2, false); } catch (e) {}
        prop.setTemporalEaseAtKey(k1, [new KeyframeEase(0, 0.1)], [new KeyframeEase((c[1] / c[0]) * d / T, c[0] * 100)]);
        prop.setTemporalEaseAtKey(k2, [new KeyframeEase(((1 - c[3]) / (1 - c[2])) * d / T, (1 - c[2]) * 100)], [new KeyframeEase(0, 0.1)]);
        try { prop.setLabelAtKey(k1, RED); prop.setLabelAtKey(k2, RED); } catch (e2) {}
    }
    app.beginUndoGroup("cluster-02 grid exit");
    // 1. counts hold: drop every Count key after the enter pair
    var mets = ["Metric racks", "Metric MW"], dropped = 0;
    for (var m = 0; m < mets.length; m++) {
        var L = layer(mets[m]); if (!L) continue;
        var fx = L.property("ADBE Effect Parade").property("Count"); if (!fx) continue;
        var sl = fx.property(1);
        while (sl.numKeys > 2) { sl.removeKey(sl.numKeys); dropped++; }
    }
    // 2. rack-null: Y down 24 px over the exit
    var nul = layer("rack-null");
    if (nul) {
        var T = nul.property("ADBE Transform Group"), pos = T.property("ADBE Position");
        try { pos.dimensionsSeparated = true; } catch (e3) {}
        var py = T.property("ADBE Position_1"), base = py.numKeys ? py.keyValue(1) : py.value;
        key(py, T0, base, T0 + DUR, base + RISE);
    }
    // 3. the grid layers fade (a null's opacity doesn't reach its children; the hatch follows its matte)
    var fades = ["Rack grid \u00b7 outlines", "Rack grid \u00b7 live matte"], faded = 0;
    for (var f = 0; f < fades.length; f++) { var FL = layer(fades[f]); if (!FL) continue; key(FL.property("ADBE Transform Group").property("ADBE Opacity"), T0, 100, T0 + DUR, 0); faded++; }
    app.endUndoGroup();
    alert("Grid exits " + T0 + "-" + (T0 + DUR).toFixed(2) + " s (" + faded + " layers fade, rack-null drops " + RISE + " px). " + dropped + " Count exit keys removed; numbers now hold.");
})();
