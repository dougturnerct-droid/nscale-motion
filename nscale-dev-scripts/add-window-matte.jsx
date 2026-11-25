// Window matte: mattes the card's panel(s) with the rectangle between the four frame lines, so the panel is
// revealed as the lines move apart. Run with a card comp open. Re-running replaces the mattes.
// Reads Frame - left/right (x) and Frame - top/bottom (y) positions every frame, so any easing on the lines carries through.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open a card comp first."); return; }
    var L = "Frame \u00b7 left", R = "Frame \u00b7 right", T = "Frame \u00b7 top", B = "Frame \u00b7 bottom";
    try { comp.layer(L); comp.layer(R); comp.layer(T); comp.layer(B); } catch (e) { alert("This comp has no Frame \u00b7 left/right/top/bottom layers."); return; }
    var targets = ["Card background", "Panel", "Panel \u00b7 top", "Panel \u00b7 bottom", "Background"], made = 0;
    app.beginUndoGroup("Window matte");
    // remove earlier mattes
    for (var i = comp.numLayers; i >= 1; i--) if (/^Window matte/.test(comp.layer(i).name)) comp.layer(i).remove();
    for (var t = 0; t < targets.length; t++) {
        var target = null; try { target = comp.layer(targets[t]); } catch (e2) { continue; }
        var M = comp.layers.addShape(); M.name = "Window matte \u00b7 " + targets[t]; M.label = 9;
        var g = M.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name = "Window";
        g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        g.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        var gc = M.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
        gc.property(2).property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]);
        M.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
        M.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
        // the window: x from the left line to the right line, y from the top line to the bottom line
        gc.property(1).property("ADBE Vector Rect Size").expression =
            'var l = thisComp.layer("' + L + '").position[0], r = thisComp.layer("' + R + '").position[0];' +
            'var t = thisComp.layer("' + T + '").position[1], b = thisComp.layer("' + B + '").position[1];' +
            '[Math.max(0, r - l), Math.max(0, b - t)]';
        gc.property(1).property("ADBE Vector Rect Position").expression =
            'var l = thisComp.layer("' + L + '").position[0], r = thisComp.layer("' + R + '").position[0];' +
            'var t = thisComp.layer("' + T + '").position[1], b = thisComp.layer("' + B + '").position[1];' +
            '[(l + r) / 2, (t + b) / 2]';
        M.moveBefore(target);
        if (typeof target.setTrackMatte === "function") target.setTrackMatte(M, TrackMatteType.ALPHA); else target.trackMatteType = TrackMatteType.ALPHA;
        made++;
    }
    app.endUndoGroup();
    if (!made) alert("Nothing to matte: no Card background / Panel layer in this comp.");
})();
