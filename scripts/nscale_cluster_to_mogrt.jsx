// Nscale: export the cluster handover cards (and the end card) as Premiere templates (.mogrt), 1:1.
// Run from the Nscale panel (Text tab > Build cluster cards) with assets/templates.aep open, or File > Scripts > Run Script File.
// Works on copies in the folder "Nscale cluster mogrts"; the template comps are not touched. Run again any time to rebuild.
//
// For each card: the catalogue's fields become Essential Graphics controls (text layers as text, Theme - controls as
// sliders / checkboxes). Animated counts keep counting: a keyframed field slider is frozen at its final value (the
// count-up reads it), and on the stat cards the count runs 0 -> 100 % of whatever number is typed into Stat.
// In and Out are protected regions, so stretching the clip in Premiere only lengthens the hold.
(function () {
    var FOLDER = "Nscale cluster mogrts", made = [], failed = [], notes = [];
    function compNamed(n) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === n) return it; } return null; }
    function folderNamed(n) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof FolderItem && it.name === n) return it; } return null; }
    function layerNamed(comp, name) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === name) return comp.layer(i); return null; }
    function readJSON(f) { if (!f.exists) return null; f.encoding = "UTF-8"; f.open("r"); var s = f.read(); f.close(); try { return eval("(" + s + ")"); } catch (e) { return null; } }
    // the catalogue sits next to the template project, or inside the panel
    var cat = null, tries = [];
    try { if (app.project.file) tries.push(new File(app.project.file.parent.fsName + "/templates.json")); } catch (e0) {}
    try { tries.push(new File(File($.fileName).parent.parent.fsName + "/assets/templates.json")); } catch (e1) {}
    try { if (typeof NSM_ROOT !== "undefined" && NSM_ROOT) tries.push(new File(NSM_ROOT.fsName + "/assets/templates.json")); } catch (e2) {}
    for (var t = 0; t < tries.length && !cat; t++) cat = readJSON(tries[t]);
    if (!cat) { alert("Couldn't read templates.json (next to the template project, or in the panel's assets).", "Nscale cluster mogrts"); return; }
    var list = [];
    (function walk(fs) { for (var i = 0; i < fs.length; i++) { var f = fs[i]; if (f.templates) for (var j = 0; j < f.templates.length; j++) if (!f.templates[j].kind) list.push(f.templates[j]); if (f.folders) walk(f.folders); } })(cat.folders || []);
    var out = Folder.selectDialog("Where should the cluster .mogrt files go? (the repo's premiere/Mogrts folder ships them with the panel)");
    if (!out) return;
    var EXIT_LABEL = 1;
    function keyTimes(comp) {   // enter end (last non-red key) and exit start (first red key)
        var enterEnd = 0, exitStart = Infinity;
        function walkP(g) { for (var i = 1; i <= g.numProperties; i++) { var p = g.property(i); if (p.propertyType === PropertyType.PROPERTY) { if (!p.canVaryOverTime) continue; for (var k = 1; k <= p.numKeys; k++) { var lb = 0; try { lb = p.keyLabel(k); } catch (e) {} var tk = p.keyTime(k); if (lb === EXIT_LABEL) exitStart = Math.min(exitStart, tk); else enterEnd = Math.max(enterEnd, tk); } } else walkP(p); } }
        for (var L = 1; L <= comp.numLayers; L++) walkP(comp.layer(L));
        return { enterEnd: enterEnd, exitStart: exitStart };
    }
    app.beginUndoGroup("Nscale cluster mogrts");
    var folder = folderNamed(FOLDER) || app.project.items.addFolder(FOLDER), built = [];
    for (var i = 0; i < list.length; i++) {
        var T = list[i], src = compNamed(T.comp);
        if (!src) { failed.push(T.name + ": no comp called \"" + T.comp + "\" in this project"); continue; }
        var name = "Nscale \u00b7 " + T.name + " \u00b7 1:1", file = "Nscale - " + T.name.replace(/[\/:]/g, "-") + " - 1x1.mogrt";
        try {
            var old = compNamed(name); if (old) old.remove();
            var c = src.duplicate(); c.name = name; c.parentFolder = folder;
            var ctl = layerNamed(c, "Theme \u00b7 controls"), fx = ctl ? ctl.property("ADBE Effect Parade") : null;
            // stat cards: count 0 -> 100 % of the typed number
            var sc = layerNamed(c, "Stat \u00b7 count"), cnt = fx && fx.property("Count") ? fx.property("Count").property(1) : null;
            if (sc && cnt && cnt.numKeys >= 2) {
                cnt.setValueAtKey(cnt.numKeys, 100);
                sc.property("ADBE Text Properties").property("ADBE Text Document").expression =
                    'var t = String(thisComp.layer("Stat").text.sourceText); var m = t.match(/^([0-9,\\.\\s]*)(.*)$/); var sep = m[1].indexOf(",") >= 0; ' +
                    'var N = parseFloat(m[1].replace(/[,\\s]/g, "")) || 0; var n = String(Math.round(N * thisComp.layer("Theme \\u00b7 controls").effect("Count")("Slider") / 100)); ' +
                    'if (sep) n = n.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ","); n + m[2]';
            }
            // fields -> Essential Graphics
            var fields = T.fields || [], exposed = 0;
            for (var f = 0; f < fields.length; f++) {
                var F = fields[f], ty = F.type || "text";
                if (ty === "text") { var TL = layerNamed(c, F.layer); if (!TL) { notes.push(T.name + ": no layer " + F.layer); continue; }
                    TL.property("ADBE Text Properties").property("ADBE Text Document").addToMotionGraphicsTemplateAs(c, F.name); exposed++; continue; }
                var ef = fx ? fx.property(F.layer) : null; if (!ef) { notes.push(T.name + ": no control " + F.layer); continue; }
                var pr = ef.property(1);
                if (pr.numKeys) { var v = pr.keyValue(pr.numKeys); while (pr.numKeys) pr.removeKey(1); pr.setValue(v); }   // frozen at the final value; the count-up reads it
                pr.addToMotionGraphicsTemplateAs(c, F.name); exposed++;
            }
            var dark = fx ? fx.property("Dark mode") : null; if (dark) { try { dark.property(1).addToMotionGraphicsTemplateAs(c, "Dark mode"); exposed++; } catch (eD) {} }
            // timing: trim to the work area, protect the in and the out
            var end = c.workAreaStart + c.workAreaDuration; if (end > 0.5) c.duration = end; else end = c.duration;
            var kt = keyTimes(c), inEnd = Math.min(end, kt.enterEnd || end * 0.4), outStart = isFinite(kt.exitStart) ? kt.exitStart : end;
            for (var mk = c.markerProperty.numKeys; mk >= 1; mk--) c.markerProperty.removeKey(mk);
            var mIn = new MarkerValue("In"); mIn.duration = inEnd; var mOut = new MarkerValue("Out"); mOut.duration = Math.max(0, end - outStart);
            try { mIn.protectedRegion = true; mOut.protectedRegion = true; } catch (eP) { notes.push("protected regions need After Effects 2019 or later"); }
            c.markerProperty.setValueAtTime(0, mIn); if (outStart < end) c.markerProperty.setValueAtTime(outStart, mOut);
            c.motionGraphicsTemplateName = name;
            built.push({ name: name, file: file, fields: exposed });
        } catch (e3) { failed.push(T.name + ": " + e3.toString() + (e3.line ? " (line " + e3.line + ")" : "")); }
    }
    app.endUndoGroup();
    for (var b = 0; b < built.length; b++) {
        var B = built[b], cc = compNamed(B.name); if (!cc) { failed.push(B.name + ": comp lost before export"); continue; }
        var ok = false; try { ok = cc.exportAsMotionGraphicsTemplate(true, out.fsName + "/" + B.file); } catch (e4) { failed.push(B.name + ": " + e4.toString()); continue; }
        if (ok) made.push(B.file + " (" + B.fields + " fields)"); else failed.push(B.name + ": export refused (save the project, then run again)");
    }
    alert((made.length ? "Exported to " + out.fsName + ":\n- " + made.join("\n- ") : "Nothing exported.") + (failed.length ? "\n\nProblems:\n- " + failed.join("\n- ") : "") + (notes.length ? "\n\nNotes:\n- " + notes.join("\n- ") : "") + "\n\nThe comps are in the project folder \"" + FOLDER + "\".", "Nscale cluster mogrts");
})();
