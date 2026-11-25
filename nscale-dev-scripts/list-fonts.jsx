// Lists installed fonts whose names contain "DM" (DM Sans, DM Mono), with the PostScript name AE wants.
// Writes dev/fonts.txt next to this script and shows the list.
(function () {
    var out = [], i;
    if (app.fonts && app.fonts.allFonts) {
        var all = app.fonts.allFonts;   // AE 24+: array of font families, each an array of fonts
        for (i = 0; i < all.length; i++) {
            var fam = all[i];
            for (var j = 0; j < fam.length; j++) {
                var f = fam[j];
                if (/DM ?(Sans|Mono)/i.test(f.familyName) || /DM(Sans|Mono)/i.test(f.postScriptName))
                    out.push(f.postScriptName + "   (" + f.familyName + " " + f.styleName + ")" + (f.technology ? "  " + f.technology : ""));
            }
        }
    } else out.push("app.fonts not available in this After Effects (needs 24.0+). Check the Character panel instead.");
    var txt = out.length ? out.join("\n") : "No DM fonts found.";
    var file = new File(File($.fileName).parent.fsName + "/fonts.txt");
    file.encoding = "UTF-8"; file.open("w"); file.write(txt); file.close();
    alert(txt);
})();
