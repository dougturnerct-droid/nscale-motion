// Builds the "03 - Powered by" card from the Figma layout as a 1080x1080 comp.
// Run in After Effects: File > Scripts > Run Script File...
// Figma: Design-work, node 15193:75491. Coordinates are the Figma frame's minus 1px (frame is 1082, comp is 1080).
// Static layout only. Motion comes next. Layer names are the future mogrt field names.

(function () {
    var W = 1080, H = 1080, FPS = 25, DUR = 6;
    var C = { blue: [15 / 255, 65 / 255, 243 / 255], midnight: [4 / 255, 14 / 255, 39 / 255], chalk: [253 / 255, 255 / 255, 248 / 255], mint: [0, 223 / 255, 153 / 255], white: [1, 1, 1] };
    var FONT_BLACK = "DMSans-Black", FONT_REG = "DMSans-Regular", FONT_MONO = "DMMono-Regular";
    // DM Sans vertical metrics (per em). Figma centres the glyph box (ascent+descent) in the line box, so the
    // first baseline sits at  top + (lineHeight - (asc+desc)*size)/2 + asc*size.  Tweak here if text sits off.
    var ASC = 0.992, DESC = 0.310;

    app.beginUndoGroup("Build cluster card 03");
    for (var pi = app.project.numItems; pi >= 1; pi--) { var it = app.project.item(pi); if (it instanceof CompItem && it.name === "cluster-03 \u00b7 spec table") it.remove(); }
    var comp = app.project.items.addComp("cluster-03 \u00b7 spec table", W, H, 1, DUR, FPS);
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

    // ---- 2. panels: blue top 1014x514, chalk bottom 1014x500, both inset 33
    shapeRect("Panel \u00b7 top", C.blue, 1014, 514, 33, 33);
    shapeRect("Panel \u00b7 bottom", C.chalk, 1014, 500, 33, 547);

    // ---- 3. headline: DM Sans Black 160 / 1.0 / -3%
    pointText("Headline", "NVIDIA\rGB300", FONT_BLACK, 160, 1.0, -3, C.chalk, 71, 183, 860);

    // ---- 4. tag (chalk on blue)
    var tagTxt = pointText("Tag label", "Powered by", FONT_BLACK, 28, 1.25, -3, C.midnight, 79 + 15, 88 + 15, 155);
    var tagBg = comp.layers.addShape(); tagBg.name = "Tag background";
    var tg = tagBg.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); tg.name = "Rect";
    tg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    tg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    var tgc = tagBg.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
    tgc.property(2).property("ADBE Vector Fill Color").setValue(C.chalk.concat([1]));
    anchor0(tagBg); pos(tagBg, 79, 88);
    tgc.property(1).property("ADBE Vector Rect Size").expression = 'var t = thisComp.layer("Tag label"); var r = t.sourceRectAtTime(time, false); [r.width + 30, 65]';
    tgc.property(1).property("ADBE Vector Rect Position").expression = 'var s = content(1).content(1).size; [s[0] / 2, s[1] / 2]';
    tagBg.moveAfter(tagTxt);

    // ---- 5. spec table: rows start at x 84 / y 589, 913 wide, 76.5 tall (label DM Sans 26, value DM Mono 32 right-aligned)
    var TX = 84, TY = 589, TW = 913, RH = 76.5;
    var rows = [["GPUs", "18,000"], ["Platform", "NVIDIA GB300"], ["Location", "United States"], ["Fabric", "[InfiniBand / Spectrum-X]"]];
    function rightText(name, text, font, size, lh, trackingPct, col, xRight, top) {
        var L = pointText(name, text, font, size, lh, trackingPct, col, xRight, top, 0);
        var tp = L.property("ADBE Text Properties").property("ADBE Text Document"), d = tp.value; d.justification = ParagraphJustification.RIGHT_JUSTIFY; tp.setValue(d);
        return L;
    }
    for (var i = 0; i < rows.length; i++) {
        var top = TY + i * RH, n = i + 1;
        pointText("Row " + n + " label", rows[i][0], FONT_REG, 26, 24 / 26, 0, C.midnight, TX, top + 26, 300);
        rightText("Row " + n + " value", rows[i][1], FONT_MONO, 32, 1.0, 0, C.midnight, TX + TW, top + 22);
        shapeRect("Row " + n + " divider", C.blue, TW, 0.5, TX, Math.round(top + RH));
    }
    // status row: label + Spearmint tag, right-aligned to the table edge
    var sTop = TY + 4 * RH;
    pointText("Status label", "Status", FONT_REG, 26, 24 / 26, 0, C.midnight, TX, sTop + 42.5, 300);
    var stTxt = pointText("Status", "Live", FONT_BLACK, 28, 1.25, -3, [0, 0, 0], TX + TW - 15, sTop + 22 + 15, 54);
    var stp = stTxt.property("ADBE Text Properties").property("ADBE Text Document"), std = stp.value; std.justification = ParagraphJustification.RIGHT_JUSTIFY; stp.setValue(std);
    var stBg = comp.layers.addShape(); stBg.name = "Status background";
    var sg = stBg.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); sg.name = "Rect";
    sg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    sg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    var sgc = stBg.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
    sgc.property(2).property("ADBE Vector Fill Color").setValue(C.mint.concat([1]));
    anchor0(stBg); pos(stBg, TX + TW, sTop + 22);   // anchored at the table's right edge; the rect grows leftwards
    sgc.property(1).property("ADBE Vector Rect Size").expression = 'var t = thisComp.layer("Status"); var r = t.sourceRectAtTime(time, false); [r.width + 30, 65]';
    sgc.property(1).property("ADBE Vector Rect Position").expression = 'var s = content(1).content(1).size; [-s[0] / 2, s[1] / 2]';
    stBg.moveAfter(stTxt);

    // ---- 6. controls
    var ctl = comp.layers.addNull(); ctl.name = "Theme \u00b7 controls"; ctl.label = 11;
    ctl.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control").name = "Dark mode";
    ctl.moveToBeginning();
    // Dark mode: top panel blue -> Midnight (placeholder until the dark colourway is designed)
    comp.layer("Panel \u00b7 top").property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(2).property("ADBE Vector Fill Color").expression =
        'var d = thisComp.layer("Theme \\u00b7 controls").effect("Dark mode")("Checkbox"); d == 1 ? [4/255, 14/255, 39/255, 1] : [15/255, 65/255, 243/255, 1]';

    // ---- 7. frame lines + corners, plus the panel-split line at 547
    var fr = [
        shapeRect("Frame \u00b7 left",   C.white, 0.5, H, 33, 0),
        shapeRect("Frame \u00b7 right",  C.white, 0.5, H, 1046, 0),
        shapeRect("Frame \u00b7 top",    C.white, W, 0.5, 0, 33),
        shapeRect("Frame \u00b7 bottom", C.white, W, 0.5, 0, 1046),
        shapeRect("Frame \u00b7 split",  C.white, W, 0.5, 0, 547),
        shapeRect("Corner \u00b7 top left",     C.white, 5, 5, 31, 31),
        shapeRect("Corner \u00b7 top right",    C.white, 5, 5, 1044, 31),
        shapeRect("Corner \u00b7 bottom left",  C.white, 5, 5, 31, 1044),
        shapeRect("Corner \u00b7 bottom right", C.white, 5, 5, 1044, 1044)
    ];
    for (var fi = 0; fi < fr.length; fi++) { fr[fi].label = 9; fr[fi].moveToBeginning(); }
    bg.locked = false; bg.moveToEnd(); bg.locked = true;

    comp.openInViewer();
    app.endUndoGroup();
})();
