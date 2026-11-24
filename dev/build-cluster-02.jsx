// Builds the "02 - The build" card from the Figma layout as a 1080x1080 comp.
// Run in After Effects: File > Scripts > Run Script File...
// Figma: Design-work, node 15187:60737. Coordinates are the Figma frame's minus 1px (frame is 1082, comp is 1080).
// Static layout only. Motion comes next. Layer names are the future mogrt field names.

(function () {
    var W = 1080, H = 1080, FPS = 25, DUR = 6;
    var C = { blue: [15 / 255, 65 / 255, 243 / 255], midnight: [4 / 255, 14 / 255, 39 / 255], chalk: [253 / 255, 255 / 255, 248 / 255], mint: [0, 223 / 255, 153 / 255], white: [1, 1, 1] };
    var FONT_BLACK = "DMSans-Black", FONT_REG = "DMSans-Regular";
    // DM Sans vertical metrics (per em). Figma centres the glyph box (ascent+descent) in the line box, so the
    // first baseline sits at  top + (lineHeight - (asc+desc)*size)/2 + asc*size.  Tweak here if text sits off.
    var ASC = 0.992, DESC = 0.310;

    app.beginUndoGroup("Build cluster card 02");
    for (var pi = app.project.numItems; pi >= 1; pi--) { var it = app.project.item(pi); if (it instanceof CompItem && it.name === "cluster-02 \u00b7 rack grid") it.remove(); }
    var comp = app.project.items.addComp("cluster-02 \u00b7 rack grid", W, H, 1, DUR, FPS);
    comp.bgColor = [0.1, 0.1, 0.1];

    function baselineY(top, size, lh) { return top + (lh * size - (ASC + DESC) * size) / 2 + ASC * size; }
    function pos(L, x, y) { L.property("ADBE Transform Group").property("ADBE Position").setValue([x, y]); }
    function anchor0(L) { L.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]); }

    function solid(name, col, w, h, x, y) {
        var L = comp.layers.addSolid(col, name, Math.round(w), Math.round(h), 1);
        anchor0(L); pos(L, x, y); return L;
    }
    // Point text whose baseline is computed the way Figma lays out its text box.
    function pointText(name, text, font, size, lh, trackingPct, col, x, top, w) {
        var L = comp.layers.addText(text); L.name = name;
        var tp = L.property("ADBE Text Properties").property("ADBE Text Document"), d = tp.value;
        try { d.font = font; } catch (e) {}
        d.fontSize = size; d.fillColor = col; d.applyFill = true; d.applyStroke = false;
        d.tracking = Math.round(trackingPct * 10);            // Figma -3% letter-spacing -> AE tracking -30 (1/1000 em)
        try { d.leading = lh * size; } catch (e2) {}            // Figma line-height factor -> AE leading in px
        d.justification = ParagraphJustification.LEFT_JUSTIFY;
        tp.setValue(d);
        pos(L, x, baselineY(top, size, lh));                   // point text: anchor = left end of the first baseline
        L.comment = "Figma box " + Math.round(w) + " wide, top " + top;
        return L;
    }
    function shapeRect(name, col, w, h, x, y) {
        var L = comp.layers.addShape(); L.name = name;
        var g = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name = "Rect";
        g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        g.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        // re-fetch after both adds: a handle taken before the second addProperty can go stale
        var gc = L.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
        var r = gc.property(1), f = gc.property(2);
        r.property("ADBE Vector Rect Size").setValue([w, h]);
        r.property("ADBE Vector Rect Position").setValue([w / 2, h / 2]);   // group 0,0 = top-left
        f.property("ADBE Vector Fill Color").setValue(col.concat([1]));
        anchor0(L); pos(L, x, y); return L;
    }

    // ---- 1. background hole (guide layer, never renders)
    var bg = solid("Background \u00b7 replace with footage (guide)", [0.25, 0.25, 0.25], W, H, 0, 0);
    bg.guideLayer = true; bg.locked = true;

    // ---- 2. panel: Midnight 1014x1014 inset 33
    shapeRect("Panel", C.midnight, 1014, 1014, 33, 33);

    // ---- 3. text
    pointText("Headline", "Every rack installed,\rcabled and powered.", FONT_BLACK, 56, 1.1, -3, C.chalk, 79, 183, 860);
    // metrics: value 90px + unit 56px on one baseline (Figma trims the box to cap height; baseline = 917 + 63 = 980)
    var m1 = pointText("Metric racks", "[XXX]", FONT_BLACK, 90, 1.1, -3, C.chalk, 79, 0, 462); pos(m1, 79, 980);
    var u1 = pointText("Metric racks \u00b7 unit", " racks", FONT_BLACK, 56, 1.1, -3, C.chalk, 79, 0, 200); pos(u1, 79, 980);
    u1.property("ADBE Transform Group").property("ADBE Position").expression = 'var v = thisComp.layer("Metric racks"); [v.position[0] + v.sourceRectAtTime(time, false).width + v.sourceRectAtTime(time, false).left, v.position[1]]';
    var m2 = pointText("Metric MW", "[XXX]", FONT_BLACK, 90, 1.1, -3, C.chalk, 602, 0, 413); pos(m2, 602, 980);
    var u2 = pointText("Metric MW \u00b7 unit", " MW", FONT_BLACK, 56, 1.1, -3, C.chalk, 602, 0, 200); pos(u2, 602, 980);
    u2.property("ADBE Transform Group").property("ADBE Position").expression = 'var v = thisComp.layer("Metric MW"); [v.position[0] + v.sourceRectAtTime(time, false).width + v.sourceRectAtTime(time, false).left, v.position[1]]';

    // ---- 4. tag: Chalk background, Midnight text (this card's colourway)
    var tagTxt = pointText("Tag label", "The build", FONT_BLACK, 28, 1.25, -3, C.midnight, 79 + 15, 88 + 15, 122);
    var tagBg = comp.layers.addShape(); tagBg.name = "Tag background";
    var tg = tagBg.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); tg.name = "Rect";
    tg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    tg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    var tgc = tagBg.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
    var tr = tgc.property(1), tf = tgc.property(2);
    tf.property("ADBE Vector Fill Color").setValue(C.chalk.concat([1]));
    anchor0(tagBg); pos(tagBg, 79, 88);
    tr.property("ADBE Vector Rect Size").expression = 'var t = thisComp.layer("Tag label"); var r = t.sourceRectAtTime(time, false); [r.width + 30, 65]';
    tr.property("ADBE Vector Rect Position").expression = 'var s = content(1).content(1).size; [s[0] / 2, s[1] / 2]';
    tagBg.moveAfter(tagTxt);

    // ---- 5. controls: Dark mode, Racks live (0-72), Reveal (0-6 rows shown; keyframe this for the row-by-row)
    var ctl = comp.layers.addNull(); ctl.name = "Theme \u00b7 controls"; ctl.label = 11;
    ctl.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control").name = "Dark mode";
    ctl.property("ADBE Effect Parade").addProperty("ADBE Slider Control").name = "Racks live";
    ctl.property("ADBE Effect Parade").property("Racks live").property(1).setValue(43);
    ctl.property("ADBE Effect Parade").addProperty("ADBE Slider Control").name = "Reveal";
    ctl.property("ADBE Effect Parade").property("Reveal").property(1).setValue(6);
    ctl.moveToBeginning();

    // ---- 6. rack grid: one shape layer, 72 groups (12 x 6), 67x66 cells on a 79/78 pitch, top-left 79,385.
    // Each group's fill opacity reads "Racks live" (index < N => live), and its overall opacity reads "Reveal" (row < Reveal => shown).
    var grid = comp.layers.addShape(); grid.name = "Rack grid"; anchor0(grid); pos(grid, 79, 385);
    var root = grid.property("ADBE Root Vectors Group");
    var CELL_W = 67, CELL_H = 66, PX = 79, PY = 78, COLS = 12, ROWS = 6;
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var idx = r * COLS + c;
        var g = root.addProperty("ADBE Vector Group"); g.name = "Rack " + (idx + 1);
        var gg = g.property("ADBE Vectors Group");
        gg.addProperty("ADBE Vector Shape - Rect");
        gg.addProperty("ADBE Vector Graphic - Fill");
        gg.addProperty("ADBE Vector Graphic - Stroke");
        var gc = root.property(idx + 1).property("ADBE Vectors Group");
        var rect = gc.property(1), fill = gc.property(2), stroke = gc.property(3);
        rect.property("ADBE Vector Rect Size").setValue([CELL_W, CELL_H]);
        rect.property("ADBE Vector Rect Position").setValue([c * PX + CELL_W / 2, r * PY + CELL_H / 2]);
        fill.property("ADBE Vector Fill Color").setValue(C.mint.concat([1]));
        fill.property("ADBE Vector Fill Opacity").expression = 'var n = thisComp.layer("Theme \\u00b7 controls").effect("Racks live")("Slider"); ' + idx + ' < n ? 35 : 0';
        stroke.property("ADBE Vector Stroke Color").setValue(C.chalk.concat([1]));
        stroke.property("ADBE Vector Stroke Width").setValue(0.5);
        root.property(idx + 1).property("ADBE Vector Transform Group").property("ADBE Vector Group Opacity").expression =
            'var rv = thisComp.layer("Theme \\u00b7 controls").effect("Reveal")("Slider"); ' + r + ' < rv ? 100 : 0';
    }

    // ---- 7. frame lines + corners (above everything), background guide at the bottom
    var fr = [
        shapeRect("Frame \u00b7 left",   C.white, 0.5, H, 33, 0),
        shapeRect("Frame \u00b7 right",  C.white, 0.5, H, 1046, 0),
        shapeRect("Frame \u00b7 top",    C.white, W, 0.5, 0, 33),
        shapeRect("Frame \u00b7 bottom", C.white, W, 0.5, 0, 1046),
        shapeRect("Corner \u00b7 top left",     C.white, 5, 5, 31, 31),
        shapeRect("Corner \u00b7 top right",    C.white, 5, 5, 1044, 31),
        shapeRect("Corner \u00b7 bottom left",  C.white, 5, 5, 31, 1044),
        shapeRect("Corner \u00b7 bottom right", C.white, 5, 5, 1044, 1044)
    ];
    for (var fi = 0; fi < fr.length; fi++) { fr[fi].label = 9; fr[fi].moveToBeginning(); }
    bg.locked = false; bg.moveToEnd(); bg.locked = true;

    // Dark mode: panel Midnight -> Nscale blue (placeholder until the dark colourway is designed)
    comp.layer("Panel").property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(2).property("ADBE Vector Fill Color").expression =
        'var d = thisComp.layer("Theme \\u00b7 controls").effect("Dark mode")("Checkbox"); d == 1 ? [15/255, 65/255, 243/255, 1] : [4/255, 14/255, 39/255, 1]';

    comp.openInViewer();
    app.endUndoGroup();
})();
