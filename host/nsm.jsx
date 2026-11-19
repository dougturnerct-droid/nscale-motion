/*
  Nscale Motion — After Effects host script (ExtendScript).

  This file runs INSIDE After Effects. The panel (panel/index.html) calls the
  functions below through evalScript and reads back a string in the form
  "KIND:message". The panel already understands these KINDs:

    OK:<message>          shown in the status bar, green dot
    WARN:<message>        shown in the status bar, orange dot
    STEP:<key>|<message>  updates the step buttons, then shows the message
    PATH:<path>           result of a folder picker
    SENT, THEME, NOTES, COMP, CURVE, TEMPLATES  — data replies, handled per feature

  ExtendScript is an old dialect of JavaScript (ES3): no const/let, no arrow
  functions, no JSON object, no Array.forEach. Keep it plain.

  STATUS: packaging pass. Every action is a stub that reports "not built yet".
  Fill in the functions in NSM_ACTIONS one at a time; the dispatcher stays as is.
*/

var NSM_VERSION = "0.1.0";

/* ---------------------------------------------------------------- state
   Shared state between the main panel and the bar, kept for the AE session.
   The panel sends a JSON string; we store and return it untouched. */
$.global.__nsmState = $.global.__nsmState || "";

function nsm_stateSet(json) {
  $.global.__nsmState = String(json || "");
  return "OK:";
}

function nsm_stateGet() {
  return $.global.__nsmState || "";
}

/* ----------------------------------------------------------------- ping
   Called once when the panel opens. Proves the host script loaded. */
function nsm_ping() {
  return "OK:Nscale Motion " + NSM_VERSION + " · After Effects " + app.version;
}

/* --------------------------------------------------------------- helpers */
function nsm_comp() {
  var c = app.project && app.project.activeItem;
  return (c && c instanceof CompItem) ? c : null;
}

function nsm_stub(action) {
  return "WARN:" + action + " isn't built yet (host stub)";
}

/* --------------------------------------------------------------- actions
   One function per panel action. Each receives the payload object the
   panel sent and returns a "KIND:message" string. */
var NSM_ACTIONS = {

  /* Home ------------------------------------------------------------ */
  step:        function (p) { return nsm_stub("step"); },         // p.mode, p.bez, p.curveName, p.snap, p.colour, p.label, p.step
  curve:       function (p) { return nsm_stub("curve"); },        // apply curve to selected keys
  readCurve:   function (p) { return nsm_stub("readCurve"); },    // reply CURVE:<json> from selected keys
  beat:        function (p) { return nsm_stub("beat"); },         // p.mode, p.beat
  stagger:     function (p) { return nsm_stub("stagger"); },      // p.steps, p.order, p.spacing, p.apply, p.start

  /* Quick tools ----------------------------------------------------- */
  "null":      function (p) { return nsm_stub("null"); },         // p.parent, p.centre …
  anchor:      function (p) { return nsm_stub("anchor"); },       // p.pos (tl/t/tr/l/c/r/bl/b/br)
  clone:       function (p) { return nsm_stub("clone"); },        // p.kind (simple/step/mirror), p.count, p.gap …

  /* Text ------------------------------------------------------------ */
  textMove:    function (p) { return nsm_stub("textMove"); },     // p.part (word/line/rise/type), p.at, p.cursor

  /* Theme ----------------------------------------------------------- */
  themeToken:  function (p) { return nsm_stub("themeToken"); },   // p.light, p.dark, p.name
  themeMode:   function (p) { return nsm_stub("themeMode"); },    // p.mode, p.scope (all/comp)
  themeLink:   function (p) { return nsm_stub("themeLink"); },

  /* Review box ------------------------------------------------------ */
  review:      function (p) { return nsm_stub("review"); },       // p.name, p.version, p.corner, p.size, p.show
  reviewRemove:function (p) { return nsm_stub("reviewRemove"); },

  /* Scripts --------------------------------------------------------- */
  chooseScripts: function (p) { return nsm_pickFolder("Choose the Scripts folder"); },
  runLatest:   function (p) { return nsm_stub("runLatest"); },    // p.folder — newest .jsx, $.evalFile

  /* Notes ----------------------------------------------------------- */
  chooseFolder: function (p) { return nsm_pickFolder("Choose a folder"); },

  /* Render / Send --------------------------------------------------- */
  renderTemplates: function (p) { return nsm_stub("renderTemplates"); }, // reply TEMPLATES:<json>
  render:      function (p) { return nsm_stub("render"); },       // p.name, p.still, p.now, p.range, p.res
  chooseInbox: function (p) { return nsm_pickFolder("Choose the inbox folder"); },
  send:        function (p) { return nsm_stub("send"); }          // reply SENT:<path>
};

/* A real one, because the panel can't test anything without folder paths. */
function nsm_pickFolder(prompt) {
  var f = Folder.selectDialog(prompt);
  if (!f) return "WARN:No folder chosen";
  return "PATH:" + f.fsName;
}

/* ------------------------------------------------------------ dispatcher
   Every panel call goes through here. Wraps the action in an undo group
   so one Cmd-Z reverts whatever it did. */
function nsm_run(action, payload) {
  var fn = NSM_ACTIONS[action];
  if (!fn) return "WARN:Unknown action: " + action;
  payload = payload || {};
  app.beginUndoGroup("Nscale Motion: " + action);
  try {
    return String(fn(payload));
  } catch (e) {
    return "WARN:" + action + " failed — " + (e.message || e) + (e.line ? " (line " + e.line + ")" : "");
  } finally {
    app.endUndoGroup();
  }
}
