// cluster-04: enter animation copied from cluster-03 (same project), plus the test-result rig.
//  1. Every 03 layer's ENTER keys (red exit keys skipped) are copied to the 04 layer of the same name, as offsets from
//     the resting value so geometry differences don't matter. 03 "Row n label" maps to 04 "Test n"; the row's divider and
//     Result pill are parented to it and take its in-point, so the row rises as a unit like 03.
//     Excluded: Result 1-3 (+ backgrounds) and Progress fill, which have their own logic below.
//  2. Progress (Theme - controls) keyed 0 -> 100 (PROG_START / PROG_DUR below, move curve, blue). Bar + % follow it.
//  3. Results: pill starts E1EAF9 and reads "Running". When Progress crosses 35 / 75 / 100 % a Spearmint wipe rises
//     over 13 frames (Pass slider on the background layer, enter curve, green) and the text switches to the layer's own text.
// Run with the 04 comp open. Re-run safe.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the cluster-04 comp first."); return; }
    var F = 1 / comp.frameRate;
    var PROG_START = 0.8, PROG_DUR = 1.483;            // when the bar runs: after the rows are in, xl Expressive
    var THRESHOLDS = [35, 75, 100], WIPE = 13 * F;
    var MOVE = [0.5, 0.13, 0.3, 1], ENTER = [0.3, 0.3, 0.15, 1], BLUE = 8, GREEN = 9, EXIT_LABEL = 1;
    var RUNNING_BG = [0.8824, 0.9176, 0.9765, 1], MINT = [0, 223 / 255, 153 / 255, 1];   // E1EAF9 frost, Spearmint

    function layer(c, n) { try { return c.layer(n); } catch (e) { return null; } }
    function findComp(sub) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name.indexOf(sub) === 0) return it; } return null; }
    function isExit(p, i) { var lb = 0; try { lb = p.keyLabel(i); } catch (e) {} return lb === EXIT_LABEL; }
    function clearKeys(p) { while (p.numKeys) p.removeKey(1); }
    function add(a, b, s) { if (typeof a === "number") return a + (b - s); var o = []; for (var i = 0; i < a.length; i++) o.push(a[i] + (b[i] - s[i])); return o; }
    function bez(s, a, b) { var u = 1 - s; return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s; }
    function whenAt(curve, frac) { if (frac <= 0) return 0; if (frac >= 1) return 1; var lo = 0, hi = 1; for (var i = 0; i < 40; i++) { var mid = (lo + hi) / 2; if (bez(mid, curve[1], curve[3]) < frac) lo = mid; else hi = mid; } return bez((lo + hi) / 2, curve[0], curve[2]); }
    function ease1D(prop, k1, k2, c, delta, T, label) {
        var d = Math.abs(delta) || 1, oi = Math.min(100, Math.max(0.1, c[0] * 100)), os = (c[1] / c[0]) * d / T;
        var ii = Math.min(100, Math.max(0.1, (1 - c[2]) * 100)), is = ((1 - c[3]) / (1 - c[2])) * d / T;
        prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        try { prop.setTemporalContinuousAtKey(k1, false); prop.setTemporalAutoBezierAtKey(k1, false); prop.setTemporalContinuousAtKey(k2, false); prop.setTemporalAutoBezierAtKey(k2, false); } catch (e) {}
        prop.setTemporalEaseAtKey(k1, [new KeyframeEase(0, 0.1)], [new KeyframeEase(os, oi)]);
        prop.setTemporalEaseAtKey(k2, [new KeyframeEase(is, ii)], [new KeyframeEase(0, 0.1)]);
        try { prop.setLabelAtKey(k1, label); prop.setLabelAtKey(k2, label); } catch (e2) {}
    }
    function key1D(prop, t0, v0, t1, v1, curve, label) { clearKeys(prop); prop.setValueAtTime(t0, v0); prop.setValueAtTime(t1, v1); ease1D(prop, 1, 2, curve, v1 - v0, t1 - t0, label); }

    // ---- copy enter keys from one property to another, as offsets from each side's resting (last enter key) value
    function copyProp(sp, dp) {
        if (!sp.canVaryOverTime || sp.numKeys < 2 || !dp.canVaryOverTime) return 0;
        var ks = []; for (var k = 1; k <= sp.numKeys; k++) if (!isExit(sp, k)) ks.push(k);
        if (ks.length < 2) return 0;
        var srcRest = sp.keyValue(ks[ks.length - 1]), dstRest = dp.numKeys ? dp.keyValue(dp.numKeys) : dp.value;
        clearKeys(dp);
        var times = [];
        for (var i = 0; i < ks.length; i++) { var t = sp.keyTime(ks[i]); dp.setValueAtTime(t, add(dstRest, sp.keyValue(ks[i]), srcRest)); times.push(t); }
        for (var j = 0; j < ks.length; j++) {
            var s = ks[j], d = dp.nearestKeyIndex(times[j]);
            try { dp.setInterpolationTypeAtKey(d, sp.keyInInterpolationType(s), sp.keyOutInterpolationType(s)); } catch (e1) {}
            try { dp.setTemporalContinuousAtKey(d, false); dp.setTemporalAutoBezierAtKey(d, false); dp.setTemporalEaseAtKey(d, sp.keyInTemporalEase(s), sp.keyOutTemporalEase(s)); } catch (e2) {}
            try { dp.setLabelAtKey(d, sp.keyLabel(s)); } catch (e3) {}
        }
        return ks.length;
    }
    function copyGroup(sg, dg) {
        var n = 0;
        for (var i = 1; i <= sg.numProperties; i++) {
            var sp = sg.property(i), dp = null;
            try { dp = dg.property(sp.matchName) || dg.property(i); } catch (e) { dp = null; }
            if (!dp) continue;
            if (sp.propertyType === PropertyType.PROPERTY) n += copyProp(sp, dp); else n += copyGroup(sp, dp);
        }
        return n;
    }
    function copyLayer(from, to) { if (!from || !to) return 0; var wl = to.locked; if (wl) to.locked = false; to.startTime = from.startTime; var n = copyGroup(from, to); if (wl) to.locked = true; return n; }

    var src = findComp("cluster-03"); if (!src) { alert("cluster-03 comp not found in this project."); return; }
    app.beginUndoGroup("Animate cluster-04");

    // ---- 1. enter, copied from 03
    var same = ["Panel \u00b7 top", "Panel \u00b7 bottom", "Tag background", "Tag label", "Headline",
                "Frame \u00b7 top", "Frame \u00b7 bottom", "Frame \u00b7 left", "Frame \u00b7 right", "Frame \u00b7 split",
                "Corner \u00b7 top left", "Corner \u00b7 top right", "Corner \u00b7 bottom left", "Corner \u00b7 bottom right"];
    var copied = 0, i;
    for (i = 0; i < same.length; i++) copied += copyLayer(layer(src, same[i]), layer(comp, same[i]));
    for (var r = 1; r <= 3; r++) {
        var rowSrc = layer(src, "Row " + r + " label"), test = layer(comp, "Test " + r); if (!rowSrc || !test) continue;
        var kids = ["Row " + r + " divider", "Result " + r, "Result " + r + " background"];
        for (i = 0; i < kids.length; i++) { var kid = layer(comp, kids[i]); if (kid && kid.parent !== test) kid.parent = test; }
        copied += copyLayer(rowSrc, test);
        for (i = 0; i < kids.length; i++) { var kid2 = layer(comp, kids[i]); if (kid2) kid2.startTime = test.startTime; }
    }

    // ---- 2. progress 0 -> 100
    var ctl = layer(comp, "Theme \u00b7 controls"), prog = ctl ? ctl.property("ADBE Effect Parade").property("Progress") : null;
    if (prog) key1D(prog.property(1), PROG_START, 0, PROG_START + PROG_DUR, 100, MOVE, BLUE);

    // ---- 3. results: Running pill -> Spearmint wipe up + text swap at the threshold
    function rig(n, pct) {
        var bg = layer(comp, "Result " + n + " background"), tx = layer(comp, "Result " + n); if (!bg || !tx) return;
        var wl = bg.locked; if (wl) bg.locked = false;
        var root = bg.property("ADBE Root Vectors Group");
        while (root.numProperties) root.property(1).remove();                   // rebuild the pill from scratch, whatever state it's in
        function group(name, col, sizeExpr, posExpr) {
            var g = root.addProperty("ADBE Vector Group"); g.name = name;
            g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
            g.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
            var gc = root.property(name).property("ADBE Vectors Group");       // re-fetch after the adds
            gc.property(2).property("ADBE Vector Fill Color").setValue(col);
            gc.property(1).property("ADBE Vector Rect Size").expression = sizeExpr;
            gc.property(1).property("ADBE Vector Rect Position").expression = posExpr;
        }
        // frost pill: width follows the current word (+15 px each side), anchored top-right
        group("Rect", RUNNING_BG,
            'var t = thisComp.layer("' + tx.name + '"); var r = t.sourceRectAtTime(time, false); [r.width + 30, 65]',
            'var s = content("Rect").content(1).size; [-s[0] / 2, s[1] / 2]');
        // Spearmint wipe: same width, grows up from the pill's bottom edge with Pass (0 -> 1)
        group("Pass wipe", MINT,
            'var s = content("Rect").content(1).size; var p = Math.max(0, Math.min(1, effect("Pass")("Slider"))); [s[0], s[1] * p]',
            'var s = content("Rect").content(1).size; var p = Math.max(0, Math.min(1, effect("Pass")("Slider"))); [-s[0] / 2, s[1] - s[1] * p / 2]');
        root.property("Pass wipe").moveTo(1);                                    // contents render top-first: wipe over pill
        // Pass slider: 0 -> 1 over 13 frames from the moment Progress crosses the threshold
        var fx = bg.property("ADBE Effect Parade"); if (!fx.property("Pass")) fx.addProperty("ADBE Slider Control").name = "Pass";
        var pass = fx.property("Pass").property(1), tc = PROG_START + whenAt(MOVE, pct / 100) * PROG_DUR; tc = Math.round(tc / F) * F;
        key1D(pass, tc, 0, tc + WIPE, 1, ENTER, GREEN);
        // text: "Running" until the wipe starts, then whatever the layer says (so the panel's field still sets it)
        tx.property("ADBE Text Properties").property("ADBE Text Document").expression =
            'thisComp.layer("' + bg.name + '").effect("Pass")("Slider") > 0 ? value : "Running"';
        if (wl) bg.locked = true;
    }
    for (i = 0; i < 3; i++) rig(i + 1, THRESHOLDS[i]);

    app.endUndoGroup();
    alert(copied + " enter keys copied from cluster-03. Progress " + PROG_START + "s -> " + (PROG_START + PROG_DUR).toFixed(2) + "s; passes at 35/75/100%.");
})();
