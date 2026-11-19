// Nscale: build the centred title ("Title_01_v2") as Premiere templates (.mogrt) in five sizes.
// Run in After Effects with the project open (File > Scripts > Run Script File, or Nscale panel > Run latest script).
// Works on copies of "Title_01_v2"; the original comp is not touched. Run it again any time to rebuild.
//
// Fields in Premiere: "Line 1" and "Line 2" (leave Line 2 empty for a one-line title). Each line keeps its own
//   animation, as in the comp.
// Type: as set in the comp (DM Sans Black 124, centred). Nothing about the type is changed.
// Height: one line or two, the block stays centred on the frame. The top and bottom lines (and the small squares at
//   their ends) keep the comp's distance from the text.
// Width: the top and bottom lines follow the wider of the two text lines, with the comp's margin either side, so they
//   get shorter for short titles and longer for long ones; they stop 80 px (x scale) short of the frame edges.
// Versions: 16:9 1920 x 1080 \u00b7 16:9 4K 3840 x 2160 (x2) \u00b7 1:1 1080 x 1080 \u00b7 4:5 1080 x 1350 \u00b7 9:16 1080 x 1920, all centred.
// Timing: in (0\u20131.07 s) and out (4.72\u20136.03 s) are protected regions, so stretching the clip only lengthens the hold.
// Background: the Blue Solid becomes a guide layer (seen in AE, not in Premiere). The Title_01.png reference is removed.

(function () {
    var SRC = "Title_01_v2", FOLDER = "Nscale titles", BASE_NAME = "Nscale title (base)";
    var IN_END = 1.0667, OUT_START = 4.7167, OUT_END = 6.0333, T = 2.5, EDGE = 80;   // T: a time when everything is fully in
    var VERSIONS = [
        { tag: "16:9", file: "16x9", w: 1920, h: 1080, s: 1 },
        { tag: "16:9 4K", file: "16x9 4K", w: 3840, h: 2160, s: 2 },
        { tag: "1:1", file: "1x1", w: 1080, h: 1080, s: 1 },
        { tag: "4:5", file: "4x5", w: 1080, h: 1350, s: 1 },
        { tag: "9:16", file: "9x16", w: 1080, h: 1920, s: 1 }
    ];
    var notes = [], made = [], failed = [], built = [];

    function compNamed(n) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === n) return it; } return null; }
    function folderNamed(n) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof FolderItem && it.name === n) return it; } return null; }
    function layerNamed(comp, name) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === name) return comp.layer(i); return null; }
    function tf(L, m) { return L.property("ADBE Transform Group").property(m); }
    function findIn(group, match) {
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i); if (p.matchName === match) return p;
            if (p.numProperties) { var f = findIn(p, match); if (f) return f; }
        }
        return null;
    }
    function vgroup(L) { return findIn(L.property("ADBE Root Vectors Group"), "ADBE Vector Group"); }

    var src = compNamed(SRC);
    if (!src) { alert("Couldn't find the comp \"" + SRC + "\". Open the project that has it and run this again.", "Nscale titles"); return; }
    var out = Folder.selectDialog("Where should the title .mogrt files go? (for the team: Google Drive / Motion / Premiere text)");
    if (!out) return;

    app.beginUndoGroup("Nscale titles to mogrt");
    try {
        var folder = folderNamed(FOLDER) || app.project.items.addFolder(FOLDER);
        for (var j = folder.numItems; j >= 1; j--) { var fi = folder.item(j); if (fi instanceof CompItem && (fi.name === BASE_NAME || fi.name.indexOf("Nscale \u00b7 Title \u00b7 ") === 0)) fi.remove(); }

        // ---------- base (1920 x 1080 design coords) ----------
        var base = src.duplicate(); base.name = BASE_NAME; base.parentFolder = folder;
        var bg = layerNamed(base, "Blue Solid 8"); if (bg) { bg.guideLayer = true; bg.name = "Background (guide, not in Premiere)"; }
        var ref = layerNamed(base, "Title_01.png"); if (ref) ref.remove();

        // text: the upper line is Line 1
        var texts = [];
        for (var i = 1; i <= base.numLayers; i++) if (base.layer(i) instanceof TextLayer && base.layer(i).enabled) texts.push(base.layer(i));
        if (texts.length < 2) throw new Error("expected two text layers, found " + texts.length);
        texts.sort(function (a, b) { return tf(a, "ADBE Position").value[1] - tf(b, "ADBE Position").value[1]; });
        var L1 = texts[0], L2 = texts[1]; L1.name = "Line 1"; L2.name = "Line 2";

        var NUL = layerNamed(base, "line-position"), LT = layerNamed(base, "line-top"), LB = layerNamed(base, "line-bottom");
        var ST = layerNamed(base, "rectangle-top"), SB = layerNamed(base, "rectangle-bottom");
        if (!NUL || !LT || !LB) throw new Error("couldn't find line-position, line-top or line-bottom");

        // design measurements
        var np = tf(NUL, "ADBE Position").value, na = tf(NUL, "ADBE Anchor Point").value;
        var NX = np[0] - na[0], NY = np[1] - na[1];                              // null space = comp - (NX, NY)
        function lineInfo(L) {
            var g = vgroup(L), rect = findIn(g.property("ADBE Vectors Group"), "ADBE Vector Shape - Rect");
            var gp = g.property("ADBE Vector Transform Group").property("ADBE Vector Position");
            var w = rect.property("ADBE Vector Rect Size").value[0], p = tf(L, "ADBE Position").value, a = tf(L, "ADBE Anchor Point").value;
            var left = p[0] + (gp.value[0] - w / 2 - a[0]), y = p[1] + (gp.value[1] - a[1]);
            return { rect: rect, gp: gp, w: w, ax: a[0], left: left, right: left + w, y: y };
        }
        var top = lineInfo(LT), bot = lineInfo(LB);
        var W0 = top.w, CXN = (top.left + top.right) / 2;                        // line centre in null space
        var p1 = tf(L1, "ADBE Position").value[1], p2 = tf(L2, "ADBE Position").value[1];
        var PITCH = p2 - p1, DTOP = (top.y + NY) - p1, DBOT = (bot.y + NY) - p2;  // comp-space offsets from the text
        var C = ((top.y + NY) + (bot.y + NY)) / 2;                               // block centre (kept)
        var tw = function (L) { return L.sourceRectAtTime(T, false).width; };
        var MARGIN = (W0 - Math.max(tw(L1), tw(L2))) / 2;
        var stp = ST ? tf(ST, "ADBE Position").value : null, sbp = SB ? tf(SB, "ADBE Position").value : null;
        var OTX = ST ? stp[0] - top.right : 0, OTY = ST ? stp[1] - top.y : 0, OBX = SB ? sbp[0] - bot.left : 0, OBY = SB ? sbp[1] - bot.y : 0;

        // live layout (design comp coords); __MAXW__ is set per version
        var LAY = "// Nscale title: one or two lines, centred; the top and bottom lines follow the text\n" +
            "var T = " + T + ", C = " + C.toFixed(2) + ", PITCH = " + PITCH.toFixed(2) + ", DTOP = " + DTOP.toFixed(2) + ", DBOT = " + DBOT.toFixed(2) + ";\n" +
            "var NX = " + NX.toFixed(2) + ", NY = " + NY.toFixed(2) + ", CXN = " + CXN.toFixed(2) + ", MARGIN = " + MARGIN.toFixed(2) + ", MAXW = __MAXW__;\n" +
            "function txt(n) { var v = thisComp.layer(n).text.sourceText.value; return (v && v.text !== undefined) ? String(v.text) : String(v); }\n" +
            "var two = txt(\"Line 2\").replace(/\\s/g, \"\").length > 0;\n" +
            "var p1 = two ? C - (DTOP + PITCH + DBOT) / 2 : C - (DTOP + DBOT) / 2;\n" +
            "var topY = p1 + DTOP - NY, botY = (two ? p1 + PITCH : p1) + DBOT - NY;\n" +
            "function wid(n) { return thisComp.layer(n).sourceRectAtTime(T, false).width; }\n" +
            "var W = Math.min(MAXW, Math.max(2 * MARGIN + 200, Math.max(wid(\"Line 1\"), two ? wid(\"Line 2\") : 0) + 2 * MARGIN));\n";
        tf(L1, "ADBE Position").expression = LAY + "[value[0], p1];";
        tf(L2, "ADBE Position").expression = LAY + "[value[0], p1 + PITCH];";
        // top line grows from its left end, bottom line from its right end (as in the comp)
        top.rect.property("ADBE Vector Rect Size").expression = LAY + "[W, value[1]];";
        top.gp.expression = LAY + "[" + top.ax.toFixed(4) + " + W / 2, value[1]];";
        tf(LT, "ADBE Position").expression = LAY + "[CXN - W / 2, topY];";
        bot.rect.property("ADBE Vector Rect Size").expression = LAY + "[W, value[1]];";
        bot.gp.expression = LAY + "[" + bot.ax.toFixed(4) + " - W / 2, value[1]];";
        tf(LB, "ADBE Position").expression = LAY + "[CXN + W / 2, botY];";
        if (ST) tf(ST, "ADBE Position").expression = LAY + "[CXN + W / 2 + " + OTX.toFixed(2) + ", topY + " + OTY.toFixed(2) + "];";
        if (SB) tf(SB, "ADBE Position").expression = LAY + "[CXN - W / 2 + " + OBX.toFixed(2) + ", botY + " + OBY.toFixed(2) + "];";

        // timing and protected regions
        base.duration = OUT_END; base.workAreaStart = 0; base.workAreaDuration = OUT_END;
        var mIn = new MarkerValue("In"); mIn.duration = IN_END;
        var mOut = new MarkerValue("Out"); mOut.duration = OUT_END - OUT_START;
        try { mIn.protectedRegion = true; mOut.protectedRegion = true; } catch (e) { notes.push("protected regions need After Effects 2019 (16.1) or later"); }
        base.markerProperty.setValueAtTime(0, mIn); base.markerProperty.setValueAtTime(OUT_START, mOut);
    } catch (err) {
        app.endUndoGroup();
        alert("Stopped while preparing: " + err.toString() + (err.line ? " (line " + err.line + ")" : "") + "\nUndo (Cmd+Z) removes what was made.", "Nscale titles");
        return;
    }

    // ---------- versions: Essential Graphics and export reset the script's links, so look comps up by name each time ----------
    for (var va = 0; va < VERSIONS.length; va++) {
        try { var dup = compNamed(BASE_NAME).duplicate(); dup.name = "Nscale \u00b7 Title \u00b7 " + VERSIONS[va].tag; dup.parentFolder = folderNamed(FOLDER); }
        catch (eA) { failed.push(VERSIONS[va].tag + ": copy failed: " + eA.toString()); }
    }
    var EXPR_LAYERS = ["Line 1", "Line 2", "line-top", "line-bottom", "rectangle-top", "rectangle-bottom"];
    for (var vi = 0; vi < VERSIONS.length; vi++) {
        var V = VERSIONS[vi], name = "Nscale \u00b7 Title \u00b7 " + V.tag, file = "Nscale - Title - " + V.file + ".mogrt";
        try {
            var c = compNamed(name); if (!c) continue;
            c.width = V.w; c.height = V.h;
            // layout null: scale, then centre the 1920 x 1080 design in the frame
            var lay = c.layers.addNull(); lay.name = "Layout (" + V.tag + ")"; lay.enabled = false;
            tf(lay, "ADBE Anchor Point").setValue([0, 0, 0]); tf(lay, "ADBE Position").setValue([0, 0, 0]);
            for (var li = 1; li <= c.numLayers; li++) { var L = c.layer(li); if (L === lay || L.parent || L.guideLayer) continue; L.parent = lay; }
            tf(lay, "ADBE Scale").setValue([V.s * 100, V.s * 100, 100]);
            tf(lay, "ADBE Position").setValue([V.w / 2 - 960 * V.s, V.h / 2 - 540 * V.s, 0]);
            // widest the lines may go in this frame (design units)
            var maxw = (V.w / V.s - 2 * EDGE).toFixed(1);
            for (var ei = 0; ei < EXPR_LAYERS.length; ei++) {
                var EL = layerNamed(c, EXPR_LAYERS[ei]); if (!EL) continue;
                var props = [tf(EL, "ADBE Position")];
                if (EL.property("ADBE Root Vectors Group")) {
                    var g2 = vgroup(EL);
                    if (g2) { props.push(findIn(g2.property("ADBE Vectors Group"), "ADBE Vector Shape - Rect").property("ADBE Vector Rect Size")); props.push(g2.property("ADBE Vector Transform Group").property("ADBE Vector Position")); }
                }
                for (var pi = 0; pi < props.length; pi++) if (props[pi] && props[pi].expression) props[pi].expression = props[pi].expression.replace("__MAXW__", maxw);
            }
            built.push({ name: name, file: file, tag: V.tag });
        } catch (e4) { failed.push(V.tag + ": " + e4.toString() + (e4.line ? " (line " + e4.line + ")" : "")); }
    }
    for (var ci = 0; ci < built.length; ci++) {
        var Bc = built[ci];
        try {
            var c1 = compNamed(Bc.name); layerNamed(c1, "Line 1").property("ADBE Text Properties").property("ADBE Text Document").addToMotionGraphicsTemplateAs(c1, "Line 1");
            var c2 = compNamed(Bc.name); layerNamed(c2, "Line 2").property("ADBE Text Properties").property("ADBE Text Document").addToMotionGraphicsTemplateAs(c2, "Line 2");
            var c3 = compNamed(Bc.name); c3.motionGraphicsTemplateName = Bc.name;
        } catch (eC) { failed.push(Bc.tag + ": Essential Graphics: " + eC.toString() + (eC.line ? " (line " + eC.line + ")" : "")); Bc.skip = true; }
    }
    try { var bx = compNamed(BASE_NAME); if (bx) bx.remove(); } catch (e5) {}
    app.endUndoGroup();

    for (var bi = 0; bi < built.length; bi++) {
        var B = built[bi]; if (B.skip) continue; var cc = compNamed(B.name);
        if (!cc) { failed.push(B.tag + ": comp not found for export"); continue; }
        var ok = false;
        try { ok = cc.exportAsMotionGraphicsTemplate(true, out.fsName + "/" + B.file); } catch (e3) { failed.push(B.tag + ": " + e3.toString()); continue; }
        if (ok) made.push(B.file); else failed.push(B.tag + ": export refused (save the project, then run this again)");
    }

    alert((made.length ? "Exported to " + out.fsName + ":\n- " + made.join("\n- ") : "Nothing exported.") +
        (failed.length ? "\n\nProblems:\n- " + failed.join("\n- ") : "") +
        "\n\nThe comps are in the project folder \"" + FOLDER + "\". Test in Essential Graphics: empty Line 2 (the block re-centres and the lines close in), a short title (the lines shorten) and a long one (they lengthen)." +
        (notes.length ? "\n\nNotes:\n- " + notes.join("\n- ") : ""), "Nscale titles");
})();
