// On the open card comp: lets "Stat - count" be keyframed in Y. Its position expression keeps X on the right edge
// of the hidden "Stat" field and passes Y through from your keyframes (value[1]). Nothing else is touched.
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the card comp first."); return; }
    var CL = null, stat = null;
    try { CL = comp.layer("Stat \u00b7 count"); stat = comp.layer("Stat"); } catch (e) {}
    if (!CL || !stat) { alert("No Stat \u00b7 count / Stat layers here."); return; }
    app.beginUndoGroup("Stat count: free Y");
    var x0 = stat.property("ADBE Transform Group").property("ADBE Position").value[0];
    var p = CL.property("ADBE Transform Group").property("ADBE Position");
    try { p.dimensionsSeparated = false; } catch (e2) {}
    p.expression = 'var r = thisComp.layer("Stat").sourceRectAtTime(time, false); [' + x0 + ' + r.left + r.width, value[1]]';
    app.endUndoGroup();
    alert("Stat \u00b7 count: keyframe its Position Y now; X stays on the right edge.");
})();
