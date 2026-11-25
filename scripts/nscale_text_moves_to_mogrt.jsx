// Nscale: the Text tab's four moves as Premiere templates (.mogrt), one per move, in 16:9, 1:1 and 9:16.
// Run from the Nscale panel (Text tab > Build text moves): it uses the panel's own move code, so File > Scripts won't work.
// Builds comps in the folder "Nscale text mogrts" (a 6 s comp per move and size with one text layer, DM Sans Black,
// left margin 8.5 %, vertically centred), applies the move's In at the start and its Out at the end, and protects both,
// so stretching the clip in Premiere only lengthens the hold. Field in Premiere: "Text". Run again any time to rebuild.
(function () {
    if (typeof tmIn !== "function") { alert("Run this from the Nscale panel (Text tab > Build text moves); it needs the panel's move code.", "Nscale text mogrts"); return; }
    var FOLDER = "Nscale text mogrts", DUR = 6, FPS = 60, CHALK = [253 / 255, 255 / 255, 248 / 255];
    var MOVES = [["word", "Slide in by word"], ["line", "Rise by line"], ["rise", "Rise by word"], ["type", "Type"]];
    var SIZES = [["16x9", 1920, 1080], ["1x1", 1080, 1080], ["9x16", 1080, 1920]];
    var made = [], failed = [], notes = [];
    function compNamed(n) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === n) return it; } return null; }
    function folderNamed(n) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof FolderItem && it.name === n) return it; } return null; }
    var out = Folder.selectDialog("Where should the text .mogrt files go? (the repo's premiere/Mogrts folder ships them with the panel)");
    if (!out) return;
    app.beginUndoGroup("Nscale text mogrts");
    var folder = folderNamed(FOLDER) || app.project.items.addFolder(FOLDER), built = [];
    for (var m = 0; m < MOVES.length; m++) for (var s = 0; s < SIZES.length; s++) {
        var id = MOVES[m][0], label = MOVES[m][1], S = SIZES[s], W = S[1], H = S[2];
        var file = "Nscale - Text " + label + " - " + S[0], name = file;   // the export is named after the template name, so keep it file-safe
        try {
            var old = compNamed(name); if (old) old.remove();
            var c = app.project.items.addComp(name, W, H, 1, DUR, FPS); c.parentFolder = folder;
            var size = Math.round(H * (W >= H ? 0.104 : 0.07)), X = Math.round(W * 0.085);
            var L = c.layers.addText(W >= H ? "Your headline here" : "Your headline\rhere"); L.name = "Text";
            var tp = L.property("ADBE Text Properties").property("ADBE Text Document"), d = tp.value;
            d.font = "DMSans-Black"; d.fontSize = size; d.applyFill = true; d.fillColor = CHALK; d.applyStroke = false; d.tracking = -30;
            try { d.autoLeading = false; d.leading = size; } catch (eL) {}
            d.justification = ParagraphJustification.LEFT_JUSTIFY; tp.setValue(d);
            L.property("ADBE Transform Group").property("ADBE Position").setValue([X, Math.round(H * 0.55)]);
            var dIn, dOut = 0;
            if (id === "type") { var r = tmType(c, L, 0, true); dIn = r.d; dOut = 0; }
            else { dIn = tmIn(c, L, id, 0); if (id !== "rise") { dOut = tmSecs(c, id === "line" ? 55 : 34); tmOut(c, L, id, DUR - dOut); } }   // the out ends at the comp end
            var mIn = new MarkerValue("In"); mIn.duration = dIn; var mOut = new MarkerValue("Out"); mOut.duration = dOut;
            try { mIn.protectedRegion = true; mOut.protectedRegion = true; } catch (eP) { notes.push("protected regions need After Effects 2019 or later"); }
            c.markerProperty.setValueAtTime(0, mIn); if (dOut > 0) c.markerProperty.setValueAtTime(DUR - dOut, mOut);
            tp.addToMotionGraphicsTemplateAs(c, "Text");
            c.motionGraphicsTemplateName = name;
            built.push({ name: name, file: file });
        } catch (e3) { failed.push(name + ": " + e3.toString() + (e3.line ? " (line " + e3.line + ")" : "")); }
    }
    app.endUndoGroup();
    for (var b = 0; b < built.length; b++) {
        var B = built[b], cc = compNamed(B.name); if (!cc) { failed.push(B.name + ": comp lost before export"); continue; }
        var ok = false; try { ok = cc.exportAsMotionGraphicsTemplate(true, out.fsName); } catch (e4) { failed.push(B.name + ": " + e4.toString()); continue; }
        if (ok) made.push(B.file + ".mogrt"); else failed.push(B.name + ": export refused (save the project, then run again)");
    }
    alert((made.length ? "Exported to " + out.fsName + ":\n- " + made.join("\n- ") : "Nothing exported.") + (failed.length ? "\n\nProblems:\n- " + failed.join("\n- ") : "") + (notes.length ? "\n\nNotes:\n- " + notes.join("\n- ") : "") + "\n\nRise by word and Type have no Out in the panel, so those clips cut at the end.", "Nscale text mogrts");
})();
