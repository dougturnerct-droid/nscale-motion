// cluster-02: moves the count-up sliders onto Theme - controls, as "Racks count" and "MW count" (0 -> 100),
// keeping each layer's keys. The figure and unit expressions are repointed, and the per-layer Count effects removed.
// If a layer's Count has no enter pair (keys before 2 s), the new slider is keyed 0 -> 100 over 0.17-1.09 s instead.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the cluster-02 comp first."); return; }
    var ENTER = [0.3, 0.3, 0.15, 1], GREEN = 9;
    function layer(n) { try { return comp.layer(n); } catch (e) { return null; } }
    var ctl = layer("Theme \u00b7 controls"); if (!ctl) { alert("No Theme \u00b7 controls layer."); return; }
    var fxRoot = ctl.property("ADBE Effect Parade");
    function ease(prop, k1, k2, c, d, T) {
        prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        try { prop.setTemporalContinuousAtKey(k1, false); prop.setTemporalAutoBezierAtKey(k1, false); prop.setTemporalContinuousAtKey(k2, false); prop.setTemporalAutoBezierAtKey(k2, false); } catch (e) {}
        prop.setTemporalEaseAtKey(k1, [new KeyframeEase(0, 0.1)], [new KeyframeEase((c[1] / c[0]) * d / T, c[0] * 100)]);
        prop.setTemporalEaseAtKey(k2, [new KeyframeEase(((1 - c[3]) / (1 - c[2])) * d / T, (1 - c[2]) * 100)], [new KeyframeEase(0, 0.1)]);
        try { prop.setLabelAtKey(k1, GREEN); prop.setLabelAtKey(k2, GREEN); } catch (e2) {}
    }
    function fmt() { return 'String(v).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",")'; }
    function move(numName, unitName, srcSlider, dstName) {
        var num = layer(numName); if (!num) return "no " + numName;
        var dst = fxRoot.property(dstName); if (!dst) { dst = fxRoot.addProperty("ADBE Slider Control"); dst.name = dstName; dst = fxRoot.property(dstName); }
        var ds = dst.property(1); while (ds.numKeys) ds.removeKey(1);
        var old = num.property("ADBE Effect Parade").property("Count"), copied = 0;
        if (old) {
            var os = old.property(1), ks = [];
            for (var k = 1; k <= os.numKeys; k++) if (os.keyTime(k) < 2) ks.push(k);          // the enter pair only
            if (ks.length >= 2) {
                for (var i = 0; i < ks.length; i++) ds.setValueAtTime(os.keyTime(ks[i]), os.keyValue(ks[i]));
                for (var j = 0; j < ks.length; j++) { var d = ds.nearestKeyIndex(os.keyTime(ks[j])), sidx = ks[j];
                    try { ds.setInterpolationTypeAtKey(d, os.keyInInterpolationType(sidx), os.keyOutInterpolationType(sidx)); ds.setTemporalContinuousAtKey(d, false); ds.setTemporalAutoBezierAtKey(d, false); ds.setTemporalEaseAtKey(d, os.keyInTemporalEase(sidx), os.keyOutTemporalEase(sidx)); } catch (e3) {}
                    try { ds.setLabelAtKey(d, GREEN); } catch (e4) {} }
                copied = ks.length;
            }
            old.remove();
        }
        if (copied < 2) { ds.setValueAtTime(0.1667, 0); ds.setValueAtTime(1.0833, 100); ease(ds, 1, 2, ENTER, 100, 1.0833 - 0.1667); }
        var ctlRef = 'thisComp.layer("Theme \\u00b7 controls")';
        num.property("ADBE Text Properties").property("ADBE Text Document").expression =
            'var c = ' + ctlRef + '; var v = Math.round(c.effect("' + srcSlider + '")("Slider") * c.effect("' + dstName + '")("Slider") / 100); ' + fmt();
        var unit = layer(unitName);
        if (unit) unit.property("ADBE Transform Group").property("ADBE Position").expression =
            'var v = thisComp.layer("' + numName + '"); var s = ' + ctlRef + '.effect("' + dstName + '")("Slider"); var tEnd = time; ' +
            'for (var i = 1; i <= s.numKeys; i++) { if (s.key(i).value >= 100) { tEnd = s.key(i).time; break; } } ' +
            'var r = v.sourceRectAtTime(tEnd - v.startTime, false); [v.position[0] + r.left + r.width, v.position[1]]';
        return dstName + ": " + (copied >= 2 ? "keys moved" : "keyed 0.17-1.09 s");
    }
    app.beginUndoGroup("Counts onto Theme - controls");
    var a = move("Metric racks", "Metric racks \u00b7 unit", "Racks", "Racks count");
    var b = move("Metric MW", "Metric MW \u00b7 unit", "MW", "MW count");
    app.endUndoGroup();
    alert(a + "\n" + b);
})();
