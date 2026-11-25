// cluster-04: match cut from cluster-03. Card 04 takes over at card 03's frame 339, so its two panels start with the
// same move card 03's panels are making at that moment (the last position segment on "Panel - top" / "Panel - bottom"
// in the 03 comp), shifted by -339 frames. Same values, same eases, same speed. Keys before 0 are fine - AE still evaluates them.
// Content is parented to its panel first (world positions kept) so it rides with the move.
// Run with the 04 comp open; the 03 comp must be in the same project. Re-run replaces the panel keys only.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the cluster-04 comp first."); return; }
    var F = 1 / comp.frameRate, TAKEOVER = 339 * F;
    function layer(c, n) { try { return c.layer(n); } catch (e) { return null; } }
    function findComp(sub) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name.indexOf(sub) === 0) return it; } return null; }
    var src = findComp("cluster-03");
    if (!src) { alert("cluster-03 comp not found in this project."); return; }

    var TOP = "Panel \u00b7 top", BOT = "Panel \u00b7 bottom";
    var PARENT = {};
    PARENT[TOP] = ["Tag label", "Tag background", "Headline", "Progress fill", "Progress value"];
    PARENT[BOT] = ["Test 1", "Test 2", "Test 3", "Result 1", "Result 2", "Result 3", "Result 1 background", "Result 2 background", "Result 3 background", "Row 1 divider", "Row 2 divider"];

    function copyTail(name) {
        var from = layer(src, name), to = layer(comp, name); if (!from || !to) return 0;
        var sp = from.property("ADBE Transform Group").property("ADBE Position"), dp = to.property("ADBE Transform Group").property("ADBE Position");
        if (sp.numKeys < 2) return 0;
        var kA = sp.numKeys - 1, kB = sp.numKeys;                       // the segment running at the takeover
        var rest03 = sp.keyValue(kB), rest04 = dp.numKeys ? dp.keyValue(dp.numKeys) : dp.value;
        while (dp.numKeys) dp.removeKey(1);
        var ks = [kA, kB], idx = [];
        for (var i = 0; i < 2; i++) {
            var k = ks[i], t = Math.round((sp.keyTime(k) - TAKEOVER) / F) * F, v = sp.keyValue(k);
            dp.setValueAtTime(t, [rest04[0] + (v[0] - rest03[0]), rest04[1] + (v[1] - rest03[1])]);
            idx.push(dp.nearestKeyIndex(t));
        }
        for (var j = 0; j < 2; j++) {
            var k2 = ks[j], d = idx[j];
            try { dp.setInterpolationTypeAtKey(d, sp.keyInInterpolationType(k2), sp.keyOutInterpolationType(k2)); } catch (e1) {}
            try { dp.setTemporalContinuousAtKey(d, false); dp.setTemporalAutoBezierAtKey(d, false); dp.setTemporalEaseAtKey(d, sp.keyInTemporalEase(k2), sp.keyOutTemporalEase(k2)); } catch (e2) {}
            try { dp.setLabelAtKey(d, sp.keyLabel(k2)); } catch (e3) {}
        }
        return 2;
    }

    app.beginUndoGroup("Match cut from cluster-03");
    var parented = 0;
    for (var pn in PARENT) {
        if (!PARENT.hasOwnProperty(pn)) continue;
        var P = layer(comp, pn); if (!P) continue;
        for (var c = 0; c < PARENT[pn].length; c++) {
            var L = layer(comp, PARENT[pn][c]); if (!L || L.parent === P) continue;
            var wasLocked = L.locked; if (wasLocked) L.locked = false;
            L.parent = P;                                                 // AE keeps the world position
            if (wasLocked) L.locked = true; parented++;
        }
    }
    var keys = copyTail(TOP) + copyTail(BOT);
    app.endUndoGroup();
    alert(parented + " layers parented, " + keys + " panel keys copied from cluster-03 (offset -339f).");
})();
