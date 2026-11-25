// cluster-03: every border line draws from its centre to full length, starting at frame 9 and taking 8 frames.
// Frame top / bottom / left / right and Frame - split. Shape "Size" keyed (position stays centred so it grows both ways),
// line curve (momentum), yellow labels. Nothing else is touched. Re-run replaces.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the card comp first."); return; }
    var F = 1 / comp.frameRate, T0 = 9 * F, DUR = 8 * F;
    var LINE = [0.6, 0, 0.8, 0.5], YELLOW = 2;
    var NAMES = ["Frame \u00b7 top", "Frame \u00b7 bottom", "Frame \u00b7 left", "Frame \u00b7 right", "Frame \u00b7 split"];
    function ease(prop, k1, k2, c, delta, T) {
        var d = Math.abs(delta) || 1, oi = Math.min(100, Math.max(0.1, c[0] * 100)), os = (c[1] / c[0]) * d / T;
        var ii = Math.min(100, Math.max(0.1, (1 - c[2]) * 100)), is = ((1 - c[3]) / (1 - c[2])) * d / T;
        var n = prop.value.length || 1, a = [], b = [], z = [];
        for (var i = 0; i < n; i++) { a.push(new KeyframeEase(os, oi)); b.push(new KeyframeEase(is, ii)); z.push(new KeyframeEase(0, 0.1)); }
        prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        try { prop.setTemporalContinuousAtKey(k1, false); prop.setTemporalAutoBezierAtKey(k1, false); prop.setTemporalContinuousAtKey(k2, false); prop.setTemporalAutoBezierAtKey(k2, false); } catch (e) {}
        prop.setTemporalEaseAtKey(k1, z, a); prop.setTemporalEaseAtKey(k2, b, z);
        try { prop.setLabelAtKey(k1, YELLOW); prop.setLabelAtKey(k2, YELLOW); } catch (e2) {}
    }
    function findRect(g) {
        for (var i = 1; i <= g.numProperties; i++) {
            var p = g.property(i);
            if (p.matchName === "ADBE Vector Shape - Rect") return p;
            if (p.propertyType !== PropertyType.PROPERTY) { var r = findRect(p); if (r) return r; }
        }
        return null;
    }
    app.beginUndoGroup("Draw border lines");
    var done = 0;
    for (var n = 0; n < NAMES.length; n++) {
        var L; try { L = comp.layer(NAMES[n]); } catch (e) { continue; }
        if (!L) continue;
        var rect = findRect(L.property("ADBE Root Vectors Group")); if (!rect) continue;
        var size = rect.property("ADBE Vector Rect Size"), full = size.numKeys ? size.keyValue(size.numKeys) : size.value;
        while (size.numKeys) size.removeKey(1);
        var horizontal = full[0] >= full[1];
        var from = horizontal ? [0, full[1]] : [full[0], 0];
        size.setValueAtTime(T0, from); size.setValueAtTime(T0 + DUR, full);
        ease(size, 1, 2, LINE, horizontal ? full[0] : full[1], DUR);
        done++;
    }
    app.endUndoGroup();
    alert(done + " lines drawing from frame 9 over 8 frames.");
})();
