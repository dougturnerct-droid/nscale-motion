// Card 02, on the open comp: wires the metrics without rebuilding.
//  - adds sliders Racks, Racks total, MW, MW total to "Theme - controls" (keeps Reveal and any keys)
//  - "Racks live" becomes derived: round(72 * Racks / Racks total)
//  - "Metric racks" / "Metric MW" text reads the sliders (thousands separators)
(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the card comp first."); return; }
    var ctl = null; try { ctl = comp.layer("Theme \u00b7 controls"); } catch (e) {}
    if (!ctl) { alert("No Theme \u00b7 controls layer here."); return; }
    app.beginUndoGroup("Card 02: wire metrics");
    var fx = ctl.property("ADBE Effect Parade");
    var sl = [["Racks", 43], ["Racks total", 72], ["MW", 40], ["MW total", 60]];
    for (var i = 0; i < sl.length; i++) if (!fx.property(sl[i][0])) { fx.addProperty("ADBE Slider Control").name = sl[i][0]; fx.property(sl[i][0]).property(1).setValue(sl[i][1]); }
    if (!fx.property("Racks live")) fx.addProperty("ADBE Slider Control").name = "Racks live";
    fx.property("Racks live").property(1).expression = 'var v = effect("Racks")("Slider"), t = effect("Racks total")("Slider"); t > 0 ? Math.round(72 * Math.min(v, t) / t) : 0';
    function wire(name, slider) {
        var L = null; try { L = comp.layer(name); } catch (e2) {}
        if (!L) return;
        L.property("ADBE Text Properties").property("ADBE Text Document").expression =
            'var v = Math.round(thisComp.layer("Theme \\u00b7 controls").effect("' + slider + '")("Slider")); String(v).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",")';
    }
    wire("Metric racks", "Racks"); wire("Metric MW", "MW");
    app.endUndoGroup();
    alert("Wired: Racks / Racks total / MW / MW total on Theme \u00b7 controls drive the grid and the two metrics.");
})();
