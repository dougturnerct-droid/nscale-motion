// Builds the "End card (generic sign-off)" card from the Figma layout as a 1080x1080 comp.
// Run in After Effects: File > Scripts > Run Script File...
// Figma: Design-work, node 15187:75456. Coordinates are the Figma frame's minus 1px (frame is 1082, comp is 1080).
// Static layout only. Motion comes next. Layer names are the future mogrt field names.

(function () {
    var W = 1080, H = 1080, FPS = 60, DUR = 6;
    var C = { blue: [15 / 255, 65 / 255, 243 / 255], midnight: [4 / 255, 14 / 255, 39 / 255], chalk: [253 / 255, 255 / 255, 248 / 255], mint: [0, 223 / 255, 153 / 255], white: [1, 1, 1] };
    var FONT_BLACK = "DMSans-Black", FONT_REG = "DMSans-Regular";
    // DM Sans vertical metrics (per em). Figma centres the glyph box (ascent+descent) in the line box, so the
    // first baseline sits at  top + (lineHeight - (asc+desc)*size)/2 + asc*size.  Tweak here if text sits off.
    var ASC = 0.992, DESC = 0.310;

    app.beginUndoGroup("Build end card");
    for (var pi = app.project.numItems; pi >= 1; pi--) { var it = app.project.item(pi); if (it instanceof CompItem && it.name === "end card") it.remove(); }
    var comp = app.project.items.addComp("end card", W, H, 1, DUR, FPS);
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
        if (d.font !== font) { if (!$.global.__nsmFontWarned) $.global.__nsmFontWarned = {}; if (!$.global.__nsmFontWarned[font]) { $.global.__nsmFontWarned[font] = 1; alert("Font not installed: " + font + "\nLayer \u201c" + name + "\u201d is using " + d.font + ". Activate it (Adobe Fonts) and re-run."); } }
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

    // ---- 1. background: this card is solid Nscale blue (no photo hole)
    shapeRect("Background", C.blue, W, H, 0, 0);

    // ---- 2. logo: Figma 760x81 at 160,499 (centred). PNG from assets/logo; swap for the vector logo comp to animate letters.
    (function () {
        var here = File($.fileName).parent.parent, png = new File(here.fsName + "/assets/logo/nscale-logo-chalk.png");
        var item = null;
        for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof FootageItem && it.name === "nscale-logo-chalk.png") { item = it; break; } }
        if (!item && png.exists) item = app.project.importFile(new ImportOptions(png));
        if (!item) { alert("assets/logo/nscale-logo-chalk.png not found"); return; }
        var L = comp.layers.add(item); L.name = "Logo";
        var sc = 760 / item.width * 100; L.property("ADBE Transform Group").property("ADBE Scale").setValue([sc, sc]);
        L.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, 499 + 81 / 2]);   // anchor stays at the image centre
    })();

    // ---- 3. controls (Dark mode swaps the background blue -> Midnight)
    var ctl = comp.layers.addNull(); ctl.name = "Theme \u00b7 controls"; ctl.label = 11;
    ctl.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control").name = "Dark mode";
    ctl.moveToBeginning();
    comp.layer("Background").property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(2).property("ADBE Vector Fill Color").expression =
        'var d = thisComp.layer("Theme \\u00b7 controls").effect("Dark mode")("Checkbox"); d == 1 ? [4/255, 14/255, 39/255, 1] : [15/255, 65/255, 243/255, 1]';

    // ---- 4. frame lines + corners
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

    comp.openInViewer();
    app.endUndoGroup();
})();
