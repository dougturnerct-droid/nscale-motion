// Nscale: build the lower third as Premiere templates (.mogrt) in five sizes, with the width following the text.
// Run in After Effects with the project open (Nscale panel > Run latest script, or File > Scripts > Run Script File).
// Works on copies of "Lower_Thirds_01_v2"; the original comp is not touched. Run it again any time to rebuild.
//
// Type: Name DM Sans Black 72, \u22123% tracking, 110% leading. Role as in the comp (DM Sans Regular 30, \u22123%).
//   Only the alignment changes, from centred to left (left edge kept), so longer text grows to the right.
//   Same px at 1920 and 1080 wide; 4K doubles everything.
// Spacing: exactly as in the comp (top line to name, name to role, role to the bottom edge).
// Versions
//   16:9 1920 x 1080 \u00b7 16:9 4K 3840 x 2160 (everything x2) \u00b7 1:1 1080 x 1080 \u00b7 4:5 1080 x 1350
//   9:16 1080 x 1920: lifted 384 px (20%) off the bottom to clear platform UI (Reels, TikTok, Shorts)
// Width: the gradient fade and the top line grow right by however much the longer of Name / Role is wider than
//   "Nidhi Chappell"; never narrower than the design; the top line stops 24 px (x scale) short of the frame edge.
// Timing: 4.5 s. In (0\u20131.02 s) and out (3.62\u20134.5 s) are protected regions: stretching the clip only lengthens the hold.
// Background: the Blue Solid becomes a guide layer (seen in AE, not in Premiere). Missing reference footage removed.

(function () {
    var SRC = "Lower_Thirds_01_v2", FOLDER = "Nscale lower thirds";
    var OUT_END = 4.5, IN_END = 1.0167, OUT_START = 3.6167, T = 2;   // T: a time when everything is fully in
    var NAME_STYLE = { font: "DMSans-Black", size: 72, lead: 1.10, tracking: -30 }, ROLE_STYLE = null;   // Name: DM Sans Black 72, -3%; Role as in the comp
    var VERSIONS = [
        { tag: "16:9", file: "16x9", w: 1920, h: 1080, s: 1, lift: 0 },
        { tag: "16:9 4K", file: "16x9 4K", w: 3840, h: 2160, s: 2, lift: 0 },
        { tag: "1:1", file: "1x1", w: 1080, h: 1080, s: 1, lift: 0 },
        { tag: "4:5", file: "4x5", w: 1080, h: 1350, s: 1, lift: 0 },
        { tag: "9:16", file: "9x16", w: 1080, h: 1920, s: 1, lift: 384 }
    ];
    var notes = [];

    function findComp() {
        var a = app.project.activeItem;
        if (a instanceof CompItem && a.name === SRC) return a;
        for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === SRC) return it; }
        return null;
    }
    function layerNamed(comp, name) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === name) return comp.layer(i); return null; }
    function tf(L, m) { return L.property("ADBE Transform Group").property(m); }
    function shiftY(prop, dy) {           // move a position property (static or keyed) by dy
        if (prop.numKeys) { for (var k = 1; k <= prop.numKeys; k++) { var v = prop.keyValue(k); v[1] += dy; prop.setValueAtKey(k, v); } }
        else { var w = prop.value; w[1] += dy; prop.setValue(w); }
    }
    // text box in design (unparented) coords at time T
    function box(L) {
        var r = L.sourceRectAtTime(T, false), p = tf(L, "ADBE Position").valueAtTime(T, true), a = tf(L, "ADBE Anchor Point").valueAtTime(T, true);
        return { left: p[0] + r.left - a[0], top: p[1] + r.top - a[1], right: p[0] + r.left + r.width - a[0], bottom: p[1] + r.top + r.height - a[1] };
    }
    function restyle(L, st) {
        var sp = L.property("ADBE Text Properties").property("ADBE Text Document"), d = sp.value, b0 = box(L);
        d.justification = ParagraphJustification.LEFT_JUSTIFY;
        if (st) {   // only when a type override is set; null keeps the After Effects file's own type
            d.font = st.font; d.fontSize = st.size; d.tracking = (st.tracking != null ? st.tracking : 0);
            try { d.autoLeading = false; d.leading = Math.round(st.size * st.lead * 10) / 10; } catch (e) {}
        }
        sp.setValue(d);
        var b1 = box(L), ap = tf(L, "ADBE Anchor Point"), a = ap.value;   // keep the left edge where it was
        ap.setValue([a[0] + (b1.left - b0.left), a[1], a.length > 2 ? a[2] : 0]);
    }
    function moveTop(L, top) { var b = box(L); shiftY(tf(L, "ADBE Position"), top - b.top); }
    function findIn(group, match) {       // first property with this matchName anywhere under a group
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i); if (p.matchName === match) return p;
            if (p.numProperties) { var f = findIn(p, match); if (f) return f; }
        }
        return null;
    }

    var src = findComp();
    if (!src) { alert("Couldn't find the comp \"" + SRC + "\". Open the project that has it and run this again.", "Nscale lower thirds"); return; }
    var out = Folder.selectDialog("Where should the lower-third .mogrt files go? (for the team: Google Drive / Motion / Premiere text)");
    if (!out) return;

    app.beginUndoGroup("Nscale lower thirds to mogrt");
    var made = [], failed = [], built = [], base = null;
    try {
        var folder = null;
        for (var f = 1; f <= app.project.numItems; f++) if (app.project.item(f) instanceof FolderItem && app.project.item(f).name === FOLDER) folder = app.project.item(f);
        if (!folder) folder = app.project.items.addFolder(FOLDER);
        // clear anything left from earlier runs (versions and old base comps)
        for (var j = folder.numItems; j >= 1; j--) { var fi = folder.item(j); if (fi instanceof CompItem && (fi.name === "Nscale lower third (base)" || fi.name.indexOf("Nscale \u00b7 Lower third \u00b7 ") === 0)) fi.remove(); }

        // ---------- base: cleaned, restyled, re-spaced (1920 x 1080 design coords) ----------
        base = src.duplicate(); base.name = "Nscale lower third (base)"; base.parentFolder = folder;
        var bg = layerNamed(base, "Blue Solid 8"); if (bg) { bg.guideLayer = true; bg.name = "Background (guide, not in Premiere)"; }
        var gone = ["Interview.mp4", "LowerThird_02.png"];
        for (var g = 0; g < gone.length; g++) { var x = layerNamed(base, gone[g]); if (x) x.remove(); }

        var texts = [];
        for (var i = 1; i <= base.numLayers; i++) if (base.layer(i) instanceof TextLayer) texts.push(base.layer(i));
        if (texts.length < 2) throw new Error("expected two text layers (name and role), found " + texts.length);
        var fsz = function (L) { return L.property("ADBE Text Properties").property("ADBE Text Document").value.fontSize; };
        texts.sort(function (a, b) { return fsz(b) - fsz(a); });
        var NAME = texts[0], ROLE = texts[1]; NAME.name = "Name"; ROLE.name = "Role";

        var TOP = layerNamed(base, "Rectangle_Top"), REV = layerNamed(base, "Rectangle_Top_Reveal_Path");
        var CUBE = layerNamed(base, "Cube_Intersection"), NUL = layerNamed(base, "NULL CONTROL"), VMAT = layerNamed(base, "Rectangle_Top 2");
        var GR = layerNamed(base, "Gradient");
        if (!TOP || !GR) throw new Error("couldn't find Rectangle_Top or Gradient");

        // gaps in the original design
        var BOTTOM = 1080, lineY0 = tf(TOP, "ADBE Position").value[1];
        var n0 = box(NAME), r0 = box(ROLE);
        var gap1 = n0.top - lineY0, gap2 = r0.top - n0.bottom, gap3 = BOTTOM - r0.bottom;

        // new type, then re-stack from the bottom edge up with the same gaps
        restyle(NAME, NAME_STYLE); restyle(ROLE, ROLE_STYLE);
        var rb = box(ROLE), nb = box(NAME);
        var roleTop = BOTTOM - gap3 - (rb.bottom - rb.top);
        var nameTop = roleTop - gap2 - (nb.bottom - nb.top);
        var lineY = nameTop - gap1, dy = lineY - lineY0;
        moveTop(ROLE, roleTop); moveTop(NAME, nameTop);
        shiftY(tf(TOP, "ADBE Position"), dy);
        if (CUBE) shiftY(tf(CUBE, "ADBE Position"), dy);
        if (NUL) shiftY(tf(NUL, "ADBE Position"), dy);

        // bar: from the top line to the bottom edge
        var grect = findIn(GR.property("ADBE Root Vectors Group"), "ADBE Vector Shape - Rect");
        if (grect) {
            var gs = grect.property("ADBE Vector Rect Size").value, gpos = tf(GR, "ADBE Position").value, gH0 = gs[1];
            var gTop0 = gpos[1] - gH0 / 2, gExtra = gTop0 - lineY0;          // bar top relative to the line (kept)
            var gTop = lineY + gExtra, gH = BOTTOM + (gpos[1] + gH0 / 2 - 1080) - gTop;
            grect.property("ADBE Vector Rect Size").setValue([gs[0], gH]);
            tf(GR, "ADBE Position").setValue([gpos[0], gTop + gH / 2, gpos.length > 2 ? gpos[2] : 0]);
        } else notes.push("gradient rectangle not found: the bar keeps its height");

        // vertical line: crop its matte at the bottom edge (matters once the block is lifted, e.g. 9:16)
        if (NUL && VMAT) {
            var vr = findIn(VMAT.property("ADBE Root Vectors Group"), "ADBE Vector Shape - Rect");
            if (vr) {
                var len = vr.property("ADBE Vector Rect Size").value, vp = tf(VMAT, "ADBE Position").value, ny = tf(NUL, "ADBE Position").value[1];
                var uTop = (vp[0] - 60) + len[0] / 2, uBottom = Math.max((vp[0] - 60) - len[0] / 2, ny - BOTTOM);
                vr.property("ADBE Vector Rect Size").setValue([uTop - uBottom, len[1]]);
                tf(VMAT, "ADBE Position").setValue([60 + (uTop + uBottom) / 2, vp[1], vp.length > 2 ? vp[2] : 0]);
            }
        }

        // timing and protected regions
        base.duration = OUT_END; base.workAreaStart = 0; base.workAreaDuration = OUT_END;
        var mIn = new MarkerValue("In"); mIn.duration = IN_END;
        var mOut = new MarkerValue("Out"); mOut.duration = OUT_END - OUT_START;
        try { mIn.protectedRegion = true; mOut.protectedRegion = true; } catch (e) { notes.push("protected regions need After Effects 2019 (16.1) or later"); }
        base.markerProperty.setValueAtTime(0, mIn); base.markerProperty.setValueAtTime(OUT_START, mOut);

        // design measurements used by the width expressions
        var RIGHT0 = Math.max(box(NAME).right, box(ROLE).right);
        var sc = tf(GR, "ADBE Scale"), finalSx = (sc.numKeys ? sc.keyValue(sc.numKeys)[0] : sc.value[0]) / 100;
        var trect = findIn(TOP.property("ADBE Root Vectors Group"), "ADBE Vector Shape - Rect");
        var LINEW = trect ? trect.property("ADBE Vector Rect Size").value[0] : 0, LINE_R = tf(TOP, "ADBE Position").value[0] + LINEW / 2;
        var gfill = findIn(GR.property("ADBE Root Vectors Group"), "ADBE Vector Graphic - G-Fill");
    } catch (err) {
        app.endUndoGroup();
        alert("Stopped while preparing: " + err.toString() + (err.line ? " (line " + err.line + ")" : "") + "\nUndo (Cmd+Z) removes what was made.", "Nscale lower thirds");
        return;
    }

    // ---------- versions ----------
    // Essential Graphics and export both reset the script's links to project items, so every step below looks
    // its comp up again by name instead of holding on to it.
    function compNamed(n) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === n) return it; } return null; }
    function folderNamed(n) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof FolderItem && it.name === n) return it; } return null; }
    var BASE_NAME = "Nscale lower third (base)";
    // A: all the copies first
    for (var va = 0; va < VERSIONS.length; va++) {
        var nm = "Nscale \u00b7 Lower third \u00b7 " + VERSIONS[va].tag;
        try { var bc = compNamed(BASE_NAME), dup = bc.duplicate(); dup.name = nm; dup.parentFolder = folderNamed(FOLDER); }
        catch (eA) { failed.push(VERSIONS[va].tag + ": copy failed: " + eA.toString()); }
    }
    // B: size, layout and width expressions
    for (var vi = 0; vi < VERSIONS.length; vi++) {
        var V = VERSIONS[vi], name = "Nscale \u00b7 Lower third \u00b7 " + V.tag, file = "Nscale - Lower third - " + V.file + ".mogrt";
        try {
            var c = compNamed(name); if (!c) continue;
            c.width = V.w; c.height = V.h;
            // layout null: scale from the top-left, then sit the 1080-tall design on the bottom edge (minus any lift)
            var lay = c.layers.addNull(); lay.name = "Layout (" + V.tag + ")"; lay.enabled = false;
            tf(lay, "ADBE Anchor Point").setValue([0, 0, 0]); tf(lay, "ADBE Position").setValue([0, 0, 0]);
            for (var li = 1; li <= c.numLayers; li++) { var L = c.layer(li); if (L === lay || L.parent || L.guideLayer) continue; L.parent = lay; }
            tf(lay, "ADBE Scale").setValue([V.s * 100, V.s * 100, 100]);
            tf(lay, "ADBE Position").setValue([0, V.h - 1080 * V.s - V.lift, 0]);

            // width follows the text (comp px), applied in each layer's own units
            var limit = Math.max(0, V.w - 24 * V.s - LINE_R * V.s);
            var GROW = "// Nscale lower third: how far the longer of Name / Role runs past the design, in comp px (never negative)\n" +
                "function R(n) { var L = thisComp.layer(n), r = L.sourceRectAtTime(time, false); return L.toComp([r.left + r.width, r.top])[0]; }\n" +
                "var grow = Math.min(" + limit.toFixed(1) + ", Math.max(0, Math.max(R(\"Name\"), R(\"Role\")) - " + (RIGHT0 * V.s).toFixed(2) + ")) / " + V.s + ";\n";
            var cg = layerNamed(c, "Gradient"), ct = layerNamed(c, "Rectangle_Top"), cr = layerNamed(c, "Rectangle_Top_Reveal_Path");
            var cgf = findIn(cg.property("ADBE Root Vectors Group"), "ADBE Vector Graphic - G-Fill");
            if (cgf) cgf.property("ADBE Vector Grad End Pt").expression = GROW + "[value[0] + grow / " + finalSx.toFixed(4) + ", value[1]];";
            var ctr = findIn(ct.property("ADBE Root Vectors Group"), "ADBE Vector Shape - Rect");
            if (ctr) {
                ctr.property("ADBE Vector Rect Size").expression = GROW + "[value[0] + grow, value[1]];";
                tf(ct, "ADBE Position").expression = GROW + "[value[0] + grow / 2, value[1]];";
                if (cr) {
                    var K = "var k = (" + LINEW.toFixed(2) + " + grow) / " + LINEW.toFixed(2) + ";\n";
                    tf(cr, "ADBE Scale").expression = GROW + K + "[value[0] * k, value[1]];";
                    tf(cr, "ADBE Position").expression = GROW + K + "[value[0] * k, value[1]];";
                }
            }
            built.push({ name: name, file: file, tag: V.tag });
        } catch (e4) { failed.push(V.tag + ": " + e4.toString() + (e4.line ? " (line " + e4.line + ")" : "")); }
    }
    // C: Essential Graphics, one field at a time, finding the comp again each time
    for (var ci = 0; ci < built.length; ci++) {
        var Bc = built[ci];
        try {
            var c1 = compNamed(Bc.name); layerNamed(c1, "Name").property("ADBE Text Properties").property("ADBE Text Document").addToMotionGraphicsTemplateAs(c1, "Name");
            var c2 = compNamed(Bc.name); layerNamed(c2, "Role").property("ADBE Text Properties").property("ADBE Text Document").addToMotionGraphicsTemplateAs(c2, "Role");
            var c3 = compNamed(Bc.name); c3.motionGraphicsTemplateName = Bc.name;
        } catch (eC) { failed.push(Bc.tag + ": Essential Graphics: " + eC.toString() + (eC.line ? " (line " + eC.line + ")" : "")); Bc.skip = true; }
    }
    try { var bx = compNamed(BASE_NAME); if (bx) bx.remove(); } catch (e5) {}
    app.endUndoGroup();

    // ---------- export: exporting resets the script's links to project items, so find each comp again by name ----------
    for (var bi = 0; bi < built.length; bi++) {
        var B = built[bi]; if (B.skip) continue; var cc = compNamed(B.name);
        if (!cc) { failed.push(B.tag + ": comp not found for export"); continue; }
        var ok = false;
        try { ok = cc.exportAsMotionGraphicsTemplate(true, out.fsName + "/" + B.file); } catch (e3) { failed.push(B.tag + ": " + e3.toString()); continue; }
        if (ok) made.push(B.file); else failed.push(B.tag + ": export refused (save the project, then run this again)");
    }

    alert((made.length ? "Exported to " + out.fsName + ":\n- " + made.join("\n- ") : "Nothing exported.") +
        (failed.length ? "\n\nProblems:\n- " + failed.join("\n- ") : "") +
        "\n\nThe comps are in the project folder \"" + FOLDER + "\". Test: type a long name into Name in Essential Graphics; the fade and the top line should run past it." +
        (notes.length ? "\n\nNotes:\n- " + notes.join("\n- ") : ""), "Nscale lower thirds");
})();
