// Flips the exit order of the table rows: top row leaves first, bottom row last (the mirrored enter had it the other way).
// Works on the red (exit) keys only, on each row layer and everything parented to it. Rows are "Test n" (card 04) or
// "Row n label" (card 03). Re-run safe: running twice flips it back.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the card comp first."); return; }
    var F = 1 / comp.frameRate, EXIT_LABEL = 1;
    function layer(n) { try { return comp.layer(n); } catch (e) { return null; } }
    var rows = [], n;
    for (n = 1; n <= 8; n++) { var L = layer("Test " + n) || layer("Row " + n + " label"); if (L) rows.push(L); }
    if (rows.length < 2) { alert("No rows found (Test n / Row n label)."); return; }
    function descendsFrom(l, root) { var p = l.parent, g = 0; while (p && g++ < 20) { if (p.index === root.index) return true; p = p.parent; } return false; }
    function members(root) { var m = [root]; for (var i = 1; i <= comp.numLayers; i++) { var l = comp.layer(i); if (l.index !== root.index && descendsFrom(l, root)) m.push(l); } return m; }
    function isExit(p, i) { var lb = 0; try { lb = p.keyLabel(i); } catch (e) {} return lb === EXIT_LABEL; }
    function walk(g, fn) { for (var i = 1; i <= g.numProperties; i++) { var p = g.property(i); if (p.propertyType === PropertyType.PROPERTY) fn(p); else walk(p, fn); } }
    function exitStart(ls) { var s = Infinity; for (var i = 0; i < ls.length; i++) walk(ls[i], function (p) { for (var k = 1; k <= p.numKeys; k++) if (isExit(p, k)) s = Math.min(s, p.keyTime(k)); }); return s; }
    function shift(p, d) {
        var keys = [], k;
        for (k = 1; k <= p.numKeys; k++) if (isExit(p, k)) {
            var key = { t: p.keyTime(k), v: p.keyValue(k), inI: p.keyInInterpolationType(k), outI: p.keyOutInterpolationType(k), inE: null, outE: null };
            try { key.inE = p.keyInTemporalEase(k); key.outE = p.keyOutTemporalEase(k); } catch (e) {}
            keys.push(key);
        }
        if (!keys.length) return;
        for (k = p.numKeys; k >= 1; k--) if (isExit(p, k)) p.removeKey(k);
        for (k = 0; k < keys.length; k++) {
            var t = Math.round((keys[k].t + d) / F) * F; p.setValueAtTime(t, keys[k].v);
            var idx = p.nearestKeyIndex(t);
            try { p.setInterpolationTypeAtKey(idx, keys[k].inI, keys[k].outI); } catch (e2) {}
            if (keys[k].inE && keys[k].outE) { try { p.setTemporalContinuousAtKey(idx, false); p.setTemporalAutoBezierAtKey(idx, false); p.setTemporalEaseAtKey(idx, keys[k].inE, keys[k].outE); } catch (e3) {} }
            try { p.setLabelAtKey(idx, EXIT_LABEL); } catch (e4) {}
        }
    }
    app.beginUndoGroup("Flip row exit order");
    var groups = [], starts = [], i;
    for (i = 0; i < rows.length; i++) { groups.push(members(rows[i])); starts.push(exitStart(groups[i])); }
    for (i = 0; i < rows.length; i++) {
        var target = starts[rows.length - 1 - i], d = target - starts[i];
        if (!isFinite(d) || Math.abs(d) < F / 2) continue;
        for (var m = 0; m < groups[i].length; m++) { var l = groups[i][m], wl = l.locked; if (wl) l.locked = false; walk(l, (function (dd) { return function (p) { shift(p, dd); }; })(d)); if (wl) l.locked = true; }
    }
    app.endUndoGroup();
    alert("Row exits flipped: " + rows[0].name + " now leaves first, " + rows[rows.length - 1].name + " last.");
})();
