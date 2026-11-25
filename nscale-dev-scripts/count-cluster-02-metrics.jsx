// cluster-02: counts the metric numbers up and keeps the unit word fixed while the number's width changes.
//  - Metric racks: keeps your position/opacity keys. Adds a "Count" slider on the layer itself (Theme - controls untouched),
//    keyed 0 -> 100 over the same span as your position keys, enter curve, green labels. The number shows round(Racks * Count/100).
//  - Metric MW: made right-justified (x shifted so the final layout doesn't move), your racks keys copied across
//    (same times, same rise, same eases), same Count treatment.
//  - Unit words: positioned off the number's FINAL width, so they don't drift while the count runs.
// Re-run safe. Lines, corners, panel, grid and Theme - controls are not touched.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the card comp first."); return; }
    var FPS = comp.frameRate, F = 1 / FPS;
    var ENTER = [0.3, 0.3, 0.15, 1], GREEN = 9;
    function layer(n) { try { return comp.layer(n); } catch (e) { return null; } }
    function tr(L) { return L.property("ADBE Transform Group"); }
    function clearKeys(p) { while (p.numKeys) p.removeKey(1); }
    function ease1D(prop, k1, k2, c, delta, T) {
        var d = Math.abs(delta) || 1, oi = Math.min(100, Math.max(0.1, c[0] * 100)), os = (c[1] / c[0]) * d / T;
        var ii = Math.min(100, Math.max(0.1, (1 - c[2]) * 100)), is = ((1 - c[3]) / (1 - c[2])) * d / T;
        prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        try { prop.setTemporalContinuousAtKey(k1, false); prop.setTemporalAutoBezierAtKey(k1, false); prop.setTemporalContinuousAtKey(k2, false); prop.setTemporalAutoBezierAtKey(k2, false); } catch (e) {}
        prop.setTemporalEaseAtKey(k1, [new KeyframeEase(0, 0.1)], [new KeyframeEase(os, oi)]);
        prop.setTemporalEaseAtKey(k2, [new KeyframeEase(is, ii)], [new KeyframeEase(0, 0.1)]);
        try { prop.setLabelAtKey(k1, GREEN); prop.setLabelAtKey(k2, GREEN); } catch (e2) {}
    }
    // copy every key of src onto dst, shifting the value by a function
    function copyKeys(src, dst, mapV) {
        clearKeys(dst);
        for (var k = 1; k <= src.numKeys; k++) {
            dst.setValueAtTime(src.keyTime(k), mapV(src.keyValue(k)));
            dst.setInterpolationTypeAtKey(k, src.keyInInterpolationType(k), src.keyOutInterpolationType(k));
            try { dst.setTemporalContinuousAtKey(k, false); dst.setTemporalAutoBezierAtKey(k, false); } catch (e) {}
            try { dst.setTemporalEaseAtKey(k, src.keyInTemporalEase(k), src.keyOutTemporalEase(k)); } catch (e2) {}
            try { dst.setLabelAtKey(k, src.keyLabel(k)); } catch (e3) {}
        }
    }
    function fmt() { return 'String(v).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",")'; }
    function countUp(numName, unitName, slider, t0, t1) {
        var num = layer(numName), unit = layer(unitName); if (!num) return;
        var fx = num.property("ADBE Effect Parade");
        if (!fx.property("Count")) fx.addProperty("ADBE Slider Control").name = "Count";
        var cnt = fx.property("Count").property(1);
        clearKeys(cnt); cnt.setValueAtTime(t0, 0); cnt.setValueAtTime(t1, 100); ease1D(cnt, 1, 2, ENTER, 100, t1 - t0);
        num.property("ADBE Text Properties").property("ADBE Text Document").expression =
            'var c = effect("Count")("Slider"); var v = Math.round(thisComp.layer("Theme \\u00b7 controls").effect("' + slider + '")("Slider") * c / 100); ' + fmt();
        if (unit) unit.property("ADBE Transform Group").property("ADBE Position").expression =
            'var v = thisComp.layer("' + numName + '"); var s = v.effect("Count")("Slider"); var tEnd = time; for (var i = 1; i <= s.numKeys; i++) { if (s.key(i).value >= 100) { tEnd = s.key(i).time; break; } } ' +
            'var r = v.sourceRectAtTime(tEnd, false); [v.position[0] + r.left + r.width, v.position[1]]';
    }
    app.beginUndoGroup("Count cluster-02 metrics");
    var racks = layer("Metric racks"), mw = layer("Metric MW");
    if (!racks) { alert("Metric racks not found."); app.endUndoGroup(); return; }
    var rPos = tr(racks).property("ADBE Position"), rOp = tr(racks).property("ADBE Opacity");
    var t0 = rPos.numKeys ? rPos.keyTime(1) : 0.2, t1 = rPos.numKeys > 1 ? rPos.keyTime(rPos.numKeys) : t0 + Math.round(0.917 * FPS) * F;
    countUp("Metric racks", "Metric racks \u00b7 unit", "Racks", t0, t1);
    if (mw) {
        var doc = mw.property("ADBE Text Properties").property("ADBE Text Document"), td = doc.value;
        if (td.justification !== ParagraphJustification.RIGHT_JUSTIFY) {
            var r = mw.sourceRectAtTime(t1, false), mPos = tr(mw).property("ADBE Position"), base = mPos.numKeys ? mPos.keyValue(mPos.numKeys) : mPos.value;
            td.justification = ParagraphJustification.RIGHT_JUSTIFY; doc.setValue(td);
            var r2 = mw.sourceRectAtTime(t1, false);      // right edge stays where the old right edge was
            var nx = base[0] + (r.left + r.width) - (r2.left + r2.width);
            clearKeys(mPos); mPos.setValue([nx, base[1]]);
        }
        var mPos2 = tr(mw).property("ADBE Position"), mx = mPos2.value[0], my = mPos2.value[1], rEnd = rPos.numKeys ? rPos.keyValue(rPos.numKeys) : rPos.value;
        if (rPos.numKeys > 1) copyKeys(rPos, mPos2, function (v) { return [mx, my + (v[1] - rEnd[1])]; });
        if (rOp.numKeys > 1) copyKeys(rOp, tr(mw).property("ADBE Opacity"), function (v) { return v; });
        countUp("Metric MW", "Metric MW \u00b7 unit", "MW", t0, t1);
    }
    app.endUndoGroup();
})();
