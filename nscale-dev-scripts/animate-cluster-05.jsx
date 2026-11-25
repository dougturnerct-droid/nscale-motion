// Animates "cluster-05 - handover" exactly as card 01 (same layers, same logic). Run with the 05 comp open. Re-run replaces.
//  - Lines: l, line curve, from the centre outwards. Corners: marks (s, enter, rotate from 45deg, fade).
//  - Everything else starts 2 frames before the first line reaches its edge: rise 24px + fade, l, enter curve.
//  - Tag: label parented to its background. Divider draws (l, line). Stat counts up (l, enter), right-justified so the suffix stays put.
// Keyframe labels: green = enter curve, yellow = line curve, red = exit.
(function () {
    var MOMENT = "expressive";
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the card comp first."); return; }
    var FPS = comp.frameRate, F = 1 / FPS;
    var TOK = {
        productive: { xs: 50, s: 133, m: 217, l: 350, xl: 567, xxl: 917, enter: [0.2, 0.8, 0.3, 1], exit: [0.7, 0, 0.8, 0.2], move: [0.65, 0, 0.35, 1], line: [0.55, 0, 0.9, 0.55], rise: 24 },
        expressive: { xs: 217, s: 350, m: 567, l: 917, xl: 1483, xxl: 2400, enter: [0.3, 0.3, 0.15, 1], exit: [0.85, 0, 0.7, 0.7], move: [0.5, 0.13, 0.3, 1], line: [0.6, 0, 0.8, 0.5], rise: 24 }
    }[MOMENT];
    // keyframe label per curve, the panel's convention: green enter, red exit, blue move, yellow line
    var LABEL = { enter: 9, exit: 1, move: 8, line: 2 };
    function fr(ms) { return Math.max(1, Math.round(ms / 1000 * FPS)) * F; }   // token -> comp seconds, snapped to frames
    var L = fr(TOK.l), S = fr(TOK.s), XS = fr(TOK.xs), LEAD = 2 * F;

    // ---- bezier helpers (section 6 of the motion system)
    function bez(s, a, b) { var u = 1 - s; return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s; }
    function whenAt(curve, frac) { if (frac <= 0) return 0; if (frac >= 1) return 1; var lo = 0, hi = 1; for (var i = 0; i < 40; i++) { var mid = (lo + hi) / 2; if (bez(mid, curve[1], curve[3]) < frac) lo = mid; else hi = mid; } return bez((lo + hi) / 2, curve[0], curve[2]); }
    function curveName(c) { for (var k in LABEL) if (LABEL.hasOwnProperty(k) && TOK[k] === c) return k; return "enter"; }
    function ease(prop, k1, k2, curve, delta, T) {
        var x1 = curve[0], y1 = curve[1], x2 = curve[2], y2 = curve[3], d = Math.abs(delta) || 1;
        var oi = Math.min(100, Math.max(0.1, x1 * 100)), os = (x1 > 0 ? y1 / x1 : 0) * d / T;
        var ii = Math.min(100, Math.max(0.1, (1 - x2) * 100)), is = (x2 < 1 ? (1 - y2) / (1 - x2) : 0) * d / T;
        prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        try { prop.setTemporalContinuousAtKey(k1, false); prop.setTemporalAutoBezierAtKey(k1, false); prop.setTemporalContinuousAtKey(k2, false); prop.setTemporalAutoBezierAtKey(k2, false); } catch (e) {}
        var dims = 1; try { dims = prop.isSpatial ? 1 : (prop.value.length || 1); } catch (e2) {}
        function mk(sp, inf) { var a = []; for (var i = 0; i < dims; i++) a.push(new KeyframeEase(sp, inf)); return a; }
        prop.setTemporalEaseAtKey(k1, mk(0, 0.1), mk(os, oi));
        prop.setTemporalEaseAtKey(k2, mk(is, ii), mk(0, 0.1));
        var lb = LABEL[curveName(curve)]; try { prop.setLabelAtKey(k1, lb); prop.setLabelAtKey(k2, lb); } catch (e3) {}
    }
    function clearKeys(prop) { while (prop.numKeys) prop.removeKey(1); }
    function key1D(prop, t0, v0, t1, v1, curve) { clearKeys(prop); prop.setValueAtTime(t0, v0); prop.setValueAtTime(t1, v1); ease(prop, 1, 2, curve, v1 - v0, t1 - t0); }
    function key2D(prop, t0, v0, t1, v1, curve) { clearKeys(prop); prop.setValueAtTime(t0, v0); prop.setValueAtTime(t1, v1); var dx = v1[0] - v0[0], dy = v1[1] - v0[1]; ease(prop, 1, 2, curve, Math.sqrt(dx * dx + dy * dy), t1 - t0); }
    function layer(n) { try { return comp.layer(n); } catch (e) { return null; } }
    function tr(Lr) { return Lr.property("ADBE Transform Group"); }

    // ---- lines: from the comp centre out, l, line curve. Corners: marks, s, enter, as the lines arrive.
    var CX = comp.width / 2, CY = comp.height / 2, T_LINE = L;
    function animateFrame() {
        var lines = { top: [layer("Frame \u00b7 top"), 33], bottom: [layer("Frame \u00b7 bottom"), 1046], left: [layer("Frame \u00b7 left"), 33], right: [layer("Frame \u00b7 right"), 1046] };
        for (var k in lines) {
            if (!lines.hasOwnProperty(k) || !lines[k][0]) continue;
            var Ln = lines[k][0], end = lines[k][1], p = tr(Ln).property("ADBE Position");
            if (k === "top" || k === "bottom") key2D(p, 0, [0, CY], T_LINE, [0, end], TOK.line); else key2D(p, 0, [CX, 0], T_LINE, [end, 0], TOK.line);
        }
        var corners = [["Corner \u00b7 top left", -45], ["Corner \u00b7 top right", 45], ["Corner \u00b7 bottom left", -45], ["Corner \u00b7 bottom right", 45]], tC = Math.max(0, T_LINE - LEAD);
        for (var c = 0; c < corners.length; c++) {
            var Cl = layer(corners[c][0]); if (!Cl) continue;
            var ap = tr(Cl).property("ADBE Anchor Point"), cp = tr(Cl).property("ADBE Position"); clearKeys(cp);
            if (ap.value[0] < 1) { ap.setValue([2.5, 2.5]); cp.setValue([cp.value[0] + 2.5, cp.value[1] + 2.5]); }
            var sc = tr(Cl).property("ADBE Scale"); clearKeys(sc); sc.setValue([100, 100]);
            key1D(tr(Cl).property("ADBE Rotate Z"), tC, corners[c][1], tC + S, 0, TOK.enter);
            key1D(tr(Cl).property("ADBE Opacity"), tC, 0, tC + S, 100, TOK.enter);
        }
    }
    // when does the first line reach an element: top line for things above centre, bottom line below; straddling = 0
    function hit(top, bottom) { if (bottom <= CY) return whenAt(TOK.line, (CY - bottom) / (CY - 33)) * T_LINE; if (top >= CY) return whenAt(TOK.line, (top - CY) / (1046 - CY)) * T_LINE; return 0; }
    function startFor(top, bottom) { return Math.max(0, Math.round((hit(top, bottom) - LEAD) * FPS) * F); }
    // a unit: rise 24px + fade, l, enter, starting 2f before its line arrives
    function rise(Lr, top, bottom) {
        if (!Lr) return;
        var t0 = startFor(top, bottom), t1 = t0 + L, T = tr(Lr), pos = T.property("ADBE Position");
        try { pos.dimensionsSeparated = true; } catch (e) {}
        var py = T.property("ADBE Position_1"), base = py.value;
        key1D(py, t0, base + TOK.rise, t1, base, TOK.enter);
        key1D(T.property("ADBE Opacity"), t0, 0, t1, 100, TOK.enter);
    }
    function fade(Lr, top, bottom) { if (!Lr) return; var t0 = startFor(top, bottom); key1D(tr(Lr).property("ADBE Opacity"), t0, 0, t0 + L, 100, TOK.enter); }
    function tagUnit() { var bg = layer("Tag background"), tx = layer("Tag label"); if (bg && tx) tx.parent = bg; rise(bg, 88, 153); }

    app.beginUndoGroup("Animate card 05");

    animateFrame();
    tagUnit();
    rise(layer("Card title"), 310, 372);
    rise(layer("Logo"), 324, 359);
    rise(layer("Stat caption"), 683, 735);

    // ---- 4. divider: draws left to right, l, line curve
    var div = layer("Divider");
    if (div) {
        var dg = div.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group"), dsz = dg.property(1).property("ADBE Vector Rect Size");
        var t0d = startFor(398, 398.5), full = dsz.value[0];
        key2D(dsz, t0d, [0, dsz.value[1]], t0d + L, [full, dsz.value[1]], TOK.line);
        dg.property(1).property("ADBE Vector Rect Position").expression = 'var s = content(1).content(1).size; [s[0] / 2, s[1] / 2]';
    }

    // ---- 5. stat: counts up, l, enter curve. "Stat" stays the fillable field (hidden, holds the final text);
    // "Stat - count" is the visible layer, right-justified at the final text's right edge so the suffix (K) never moves.
    var stat = layer("Stat"), ctl = layer("Theme \u00b7 controls");
    if (stat && ctl) {
        for (var i = comp.numLayers; i >= 1; i--) { var nm = comp.layer(i).name; if (/^Stat \u00b7 (digit|suffix|window|count)/.test(nm) || /stat-matte/i.test(nm)) comp.layer(i).remove(); }
        try { if (typeof stat.setTrackMatte === "function") stat.setTrackMatte(null, TrackMatteType.NO_TRACK_MATTE); else stat.trackMatteType = TrackMatteType.NO_TRACK_MATTE; } catch (eM) {}
        tr(stat).property("ADBE Opacity").setValue(0);
        var sd = stat.property("ADBE Text Properties").property("ADBE Text Document").value;
        var sPos = tr(stat).property("ADBE Position").value, x0 = sPos[0], y0 = sPos[1];
        var fx = ctl.property("ADBE Effect Parade");
        if (!fx.property("Count")) { fx.addProperty("ADBE Slider Control").name = "Count"; }
        var count = fx.property("Count").property(1);
        var tS = startFor(420, 671);
        // Count = the number itself: keyed 0 -> N, where N is the number in the Stat field (18 for "18K")
        var N0 = parseInt(String(sd.text).replace(/[^0-9]/g, "") || "0", 10);
        key1D(count, tS, 0, tS + L, N0, TOK.enter);
        var CL = comp.layers.addText("18K"); CL.name = "Stat \u00b7 count";
        var cp2 = CL.property("ADBE Text Properties").property("ADBE Text Document"), cd = cp2.value;
        cd.font = sd.font; cd.fontSize = sd.fontSize; cd.fillColor = sd.fillColor; cd.applyFill = true; cd.applyStroke = false; cd.tracking = sd.tracking;
        try { cd.autoLeading = sd.autoLeading; cd.leading = sd.leading; } catch (e3) {}
        cd.justification = ParagraphJustification.RIGHT_JUSTIFY; cp2.setValue(cd);
        // number part counts up with Count; thousands separators kept if the final text has them; suffix untouched
        cp2.expression =
            'var t = String(thisComp.layer("Stat").text.sourceText); var m = t.match(/^([0-9,\\.\\s]*)(.*)$/); var sep = m[1].indexOf(",") >= 0; ' +
            'var n = String(Math.round(thisComp.layer("Theme \\u00b7 controls").effect("Count")("Slider"))); ' +
            'if (sep) n = n.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ","); n + m[2]';
        // right edge = where the final text ends, measured on the hidden field layer
        tr(CL).property("ADBE Position").setValue([x0, y0]); tr(CL).property("ADBE Position").expression = 'var r = thisComp.layer("Stat").sourceRectAtTime(time, false); [' + x0 + ' + r.left + r.width, value[1]]';   // Y is free to keyframe
        CL.moveBefore(stat);
    }

    app.endUndoGroup();
})();
