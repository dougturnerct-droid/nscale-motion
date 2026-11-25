// Builds the "01 - Cluster handover" card from the Figma layout as a 1080x1080 comp.
// Run in After Effects: File > Scripts > Run Script File...
// Figma: Design-work, node 15187:60688. Coordinates are the Figma frame's minus 1px (frame is 1082, comp is 1080).
// Static layout only. Motion comes next. Layer names are the future mogrt field names.

(function () {
    var W = 1080, H = 1080, FPS = 60, DUR = 6;
    var C = { blue: [15 / 255, 65 / 255, 243 / 255], midnight: [4 / 255, 14 / 255, 39 / 255], chalk: [253 / 255, 255 / 255, 248 / 255], mint: [0, 223 / 255, 153 / 255], white: [1, 1, 1] };
    var FONT_BLACK = "DMSans-Black", FONT_REG = "DMSans-Regular";
    // DM Sans vertical metrics (per em). Figma centres the glyph box (ascent+descent) in the line box, so the
    // first baseline sits at  top + (lineHeight - (asc+desc)*size)/2 + asc*size.  Tweak here if text sits off.
    var ASC = 0.992, DESC = 0.310;

    app.beginUndoGroup("Build cluster card 01");
    for (var pi = app.project.numItems; pi >= 1; pi--) { var it = app.project.item(pi); if (it instanceof CompItem && it.name === "cluster-01 \u00b7 stat card") it.remove(); }
    var comp = app.project.items.addComp("cluster-01 \u00b7 stat card", W, H, 1, DUR, FPS);
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

    // ---- 1. background hole: a guide layer the editor replaces with footage in Premiere (never renders)
    var bg = solid("Background \u00b7 replace with footage (guide)", [0.25, 0.25, 0.25], W, H, 0, 0);
    bg.guideLayer = true; bg.locked = true;

    // ---- 2. stat card
    shapeRect("Card background", C.blue, 1014, 523, 33, 278);
    shapeRect("Divider", C.white, 1014, 0.5, 33, 398);   // 0.5px on a pixel boundary = one crisp row at 50%
    pointText("Card title", "United States", FONT_BLACK, 56, 1.1, -3, C.chalk, 78, 310, 860);         // DM Sans Black 56 / 1.1 / -3%
    pointText("Stat", "18K", FONT_BLACK, 270, 1.0, -3, C.chalk, 78, 420, 686);                        // DM Sans Black 270 / 1.0 / -3%
    pointText("Stat caption", "GPUs, now handed over.", FONT_REG, 56, 1.1, -3, C.chalk, 78, 683, 629); // DM Sans Regular 56 / 1.1 / -3%
    // Logo: Figma 329x35 at 661,324. Imported from assets/logo next to this script's repo; reused if already in the project.
    (function () {
        var here = File($.fileName).parent.parent, png = new File(here.fsName + "/assets/logo/nscale-logo-chalk.png");
        var item = null;
        for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof FootageItem && it.name === "nscale-logo-chalk.png") { item = it; break; } }
        if (!item && png.exists) { item = app.project.importFile(new ImportOptions(png)); }
        if (!item) { var ph = pointText("Logo \u00b7 missing assets/logo/nscale-logo-chalk.png", "NSCALE", FONT_BLACK, 30, 1.0, 10, C.chalk, 661, 324, 329); ph.label = 2; return; }
        var L = comp.layers.add(item); L.name = "Logo"; anchor0(L);
        var sc = 329 / item.width * 100; L.property("ADBE Transform Group").property("ADBE Scale").setValue([sc, sc]);
        pos(L, 661, 324 + (35 - item.height * sc / 100) / 2);   // vertically centred in the Figma box
    })();

    // ---- 3. tag: text + a Spearmint background that fits it (padding 15, height 65)
    var tagTxt = pointText("Tag label", "Latest cluster handover", FONT_BLACK, 28, 1.25, -3, C.midnight, 78 + 15, 88 + 15, 314);
    var tagBg = comp.layers.addShape(); tagBg.name = "Tag background";
    var tg = tagBg.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); tg.name = "Rect";
    tg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    tg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    var tgc = tagBg.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
    var tr = tgc.property(1), tf = tgc.property(2);
    tf.property("ADBE Vector Fill Color").setValue(C.mint.concat([1]));
    anchor0(tagBg); pos(tagBg, 78, 88);
    tr.property("ADBE Vector Rect Size").expression =
        'var t = thisComp.layer("Tag label"); var r = t.sourceRectAtTime(time, false); [r.width + 30, 65]';
    tr.property("ADBE Vector Rect Position").expression =
        'var s = content(1).content(1).size; [s[0] / 2, s[1] / 2]';
    tagBg.moveAfter(tagTxt);   // behind the text

    // ---- 3b. frame: 0.5px lines at the Figma guide positions and 4px corner marks (these render; they are part of the look)
    // Pixel-snapped: 0.5px lines starting on integer positions render as one crisp half-strength row; 5px corner marks on integers.
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
    // frame lines and corners sit above the card (and everything else), background guide at the very bottom
    for (var fi = 0; fi < fr.length; fi++) { fr[fi].label = 9; fr[fi].moveToBeginning(); }
    bg.locked = false; bg.moveToEnd(); bg.locked = true;

    // ---- 4. a controls layer so this comp can be a social template later (Dark mode switch)
    var ctl = comp.layers.addNull(); ctl.name = "Theme \u00b7 controls"; ctl.label = 11;
    ctl.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control").name = "Dark mode";
    ctl.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control").name = "Show logo";
    ctl.property("ADBE Effect Parade").property("Show logo").property(1).setValue(1);
    ctl.moveToBeginning();
    // Dark mode: card fill swaps Nscale blue -> Midnight (adjust once the dark colourway is designed)
    var cardFill = comp.layer("Card background").property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(2).property("ADBE Vector Fill Color");
    cardFill.expression = 'var d = thisComp.layer("Theme \\u00b7 controls").effect("Dark mode")("Checkbox"); d == 1 ? [4/255, 14/255, 39/255, 1] : [15/255, 65/255, 243/255, 1]';
    // Show logo: the logo layer's opacity follows the checkbox
    try { comp.layer("Logo").property("ADBE Transform Group").property("ADBE Opacity").expression = 'thisComp.layer("Theme \\u00b7 controls").effect("Show logo")("Checkbox") == 1 ? 100 : 0'; } catch (eLogo) {}

    comp.openInViewer();
    app.endUndoGroup();
})();
