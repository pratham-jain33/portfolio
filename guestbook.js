/* Signature guestbook backed by Firebase Realtime Database.
 *
 * Visitors draw their signature on a canvas and enter their name.
 * All signatures are shown scattered on a wall; hovering one shows the name.
 *
 * SETUP (one time):
 * 1. Paste your Firebase web API key below (Firebase console -> Project
 *    settings -> General -> "Your apps" -> Web app -> API key). API keys are
 *    public by design; security comes from the database rules, not the key.
 * 2. In the Firebase console -> Realtime Database -> Rules, paste the rules
 *    from firebase-rules.json in this repo and publish.
 */
(function () {
  "use strict";

  var FIREBASE_API_KEY = "AIzaSyCVOgAx5YKSonVzHNxSD1ntzb6V0_ZHJAg";

  var form = document.getElementById("guestbook-form");
  var canvas = document.getElementById("gb-canvas");
  var nameInput = document.getElementById("guestbook-name");
  var clearBtn = document.getElementById("gb-clear");
  var status = document.getElementById("guestbook-status");
  var wall = document.getElementById("gb-wall");
  var tip = document.getElementById("gb-tip");
  var emptyNote = document.getElementById("guestbook-empty");

  var MAX_NAME = 40;
  var RATE_LIMIT_MS = 60 * 1000;
  var MAX_STROKES = 150;
  var MAX_POINTS = 400;
  var MAX_PAYLOAD = 60000; // chars of JSON, sanity cap per signature

  var ctx = canvas.getContext("2d");
  var strokes = [];   // array of strokes; each stroke = array of [x, y] in 0..1
  var current = null;
  var drawing = false;

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function fmtDate(ts) {
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric"
      });
    } catch (e) { return ""; }
  }

  /* ---------- signature pad ---------- */

  function fitCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    redraw();
  }

  function drawStroke(s) {
    if (!s || !s.length) return;
    var w = canvas.width, h = canvas.height;
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc(s[0][0] * w, s[0][1] * h, ctx.lineWidth / 2, 0, 7);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(s[0][0] * w, s[0][1] * h);
    for (var i = 1; i < s.length; i++) ctx.lineTo(s[i][0] * w, s[i][1] * h);
    ctx.stroke();
  }

  function redraw() {
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, w / 300);
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--ink").trim() || "#1a1a1a";
    strokes.forEach(drawStroke);
    if (current) drawStroke(current);
  }

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    ];
  }

  function round3(n) { return Math.round(n * 1000) / 1000; }

  canvas.addEventListener("pointerdown", function (e) {
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    current = [pos(e).map(round3)];
    redraw();
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!drawing || !current) return;
    var pts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (var i = 0; i < pts.length; i++) {
      if (current.length >= MAX_POINTS) break;
      var p = pos(pts[i]).map(round3);
      var last = current[current.length - 1];
      if (p[0] === last[0] && p[1] === last[1]) continue;
      current.push(p);
    }
    redraw();
  });

  function endStroke() {
    if (!drawing) return;
    drawing = false;
    if (current && current.length && strokes.length < MAX_STROKES) {
      strokes.push(current);
    }
    current = null;
    redraw();
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  clearBtn.addEventListener("click", function () {
    strokes = [];
    current = null;
    redraw();
    setStatus("");
    canvas.focus();
  });

  window.addEventListener("resize", function () { fitCanvas(); });

  /* ---------- scattered wall ---------- */

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sigSVG(strokeList) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 34");
    svg.setAttribute("aria-hidden", "true");
    strokeList.forEach(function (s) {
      if (!s || s.length < 2) return;
      var d = "M" + s.map(function (p) {
        return (p[0] * 100).toFixed(1) + " " + (p[1] * 34).toFixed(1);
      }).join(" L");
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(
    function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          animateSig(en.target);
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.6, rootMargin: "-12% 0px -12% 0px" }) : null;

  function animateSig(el) {
    if (reduceMotion) return;
    var paths = el.querySelectorAll("path");
    var delay = 0;
    for (var i = 0; i < paths.length; i++) {
      (function (p, d) {
        var len;
        try { len = p.getTotalLength(); } catch (e) { return; }
        if (!len) return;
        p.style.strokeDasharray = String(len);
        p.style.strokeDashoffset = String(len);
        // force layout so the transition runs
        void p.getBoundingClientRect();
        p.style.transition = "stroke-dashoffset " +
          Math.min(0.9, 0.25 + len / 900).toFixed(2) + "s ease " + d.toFixed(2) + "s";
        p.style.strokeDashoffset = "0";
      })(paths[i], delay);
      delay += 0.14;
    }
  }

  var wallItems = []; // {key, el, entry} in chronological order
  var animatedKeys = {}; // keys whose draw-in animation already ran

  function showTip(item, anchorEl) {
    tip.textContent = (item.entry.name || "anonymous") +
      (item.entry.ts ? " · " + fmtDate(item.entry.ts) : "");
    tip.hidden = false;
    var wr = wall.getBoundingClientRect();
    var ar = anchorEl.getBoundingClientRect();
    var x = ar.left - wr.left + ar.width / 2;
    var y = ar.top - wr.top;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip() { tip.hidden = true; }

  function renderWall(entries) {
    while (wall.firstChild) wall.removeChild(wall.firstChild);
    wall.appendChild(tip);
    wallItems = [];
    var keys = Object.keys(entries || {}).sort(function (a, b) {
      return (entries[b].ts || 0) - (entries[a].ts || 0); // newest first
    });
    keys.forEach(function (k) {
      var entry = entries[k];
      var el = document.createElement("div");
      el.className = "gb-sig";
      el.tabIndex = 0;
      var item = { key: k, el: el, entry: entry };
      if (entry.strokes && entry.strokes.length) {
        el.appendChild(sigSVG(entry.strokes));
      } else {
        // legacy text entry fallback
        var legacy = document.createElement("div");
        legacy.className = "gb-legacy";
        var nm = document.createElement("div");
        nm.className = "gb-legacy-name";
        nm.textContent = entry.name || "anonymous";
        var ms = document.createElement("div");
        ms.textContent = entry.message || "";
        legacy.appendChild(nm);
        legacy.appendChild(ms);
        el.appendChild(legacy);
      }
      el.setAttribute("aria-label",
        "Signature of " + (entry.name || "anonymous"));
      el.addEventListener("mouseenter", function () { showTip(item, el); });
      el.addEventListener("mouseleave", hideTip);
      el.addEventListener("focus", function () { showTip(item, el); });
      el.addEventListener("blur", hideTip);
      wall.appendChild(el);
      wallItems.push(item);
      if (io && !animatedKeys[k]) {
        animatedKeys[k] = true;
        io.observe(el);
      }
    });
    if (emptyNote) emptyNote.style.display = keys.length ? "none" : "";
    layoutWall();
  }

  var resizeT = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(layoutWall, 150);
  });

  function layoutWall() {
    if (!wallItems.length) { wall.style.height = ""; return; }
    var wallW = wall.clientWidth;
    if (!wallW) return;
    var cols = wallW < 460 ? 2 : 3;
    var cellW = wallW / cols;
    var sigW = Math.min(cellW * 0.82, 230);
    var cellH = sigW * 0.52 + 26;
    var rows = Math.ceil(wallItems.length / cols);
    wallItems.forEach(function (item, i) {
      var col = i % cols, row = Math.floor(i / cols);
      var rnd = mulberry32(hashStr(item.key));
      var jx = (rnd() - 0.5) * cellW * 0.3;
      var jy = (rnd() - 0.5) * cellH * 0.45;
      var rot = (rnd() - 0.5) * 18;
      var el = item.el;
      el.style.width = sigW + "px";
      el.style.left = (col * cellW + (cellW - sigW) / 2 + jx) + "px";
      el.style.top = (row * cellH + jy) + "px";
      el.style.transform = "rotate(" + rot.toFixed(1) + "deg)";
    });
    wall.style.height = (rows * cellH + 10) + "px";
    hideTip();
  }

  /* ---------- firebase wiring ---------- */

  // Bail out gracefully if Firebase isn't configured yet.
  if (FIREBASE_API_KEY === "PASTE_YOUR_FIREBASE_API_KEY" ||
      typeof firebase === "undefined" || !firebase.database) {
    setStatus("Guestbook is being wired up — check back soon.");
    if (form) form.style.display = "none";
    if (wall) wall.style.display = "none";
    return;
  }

  try {
    firebase.initializeApp({
      apiKey: FIREBASE_API_KEY,
      authDomain: "portfolio-b0516.firebaseapp.com",
      databaseURL: "https://portfolio-b0516-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "portfolio-b0516",
      storageBucket: "portfolio-b0516.firebasestorage.app",
      messagingSenderId: "10002392412",
      appId: "1:10002392412:web:430d978e08fa6a1fed0d99"
    });
  } catch (e) {
    setStatus("Guestbook is unavailable right now.");
    if (form) form.style.display = "none";
    return;
  }

  var db = firebase.database();
  var ref = db.ref("guestbook");

  ref.orderByChild("ts").limitToLast(60).on("value", function (snap) {
    renderWall(snap.val());
  }, function () {
    setStatus("Couldn't load signatures. Check your connection.");
  });

  fitCanvas();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = nameInput.value.trim().slice(0, MAX_NAME);
    var totalPts = strokes.reduce(function (n, s) { return n + s.length; }, 0);
    if (!name) {
      setStatus("Add your name so people know whose mark this is.");
      return;
    }
    if (totalPts < 4) {
      setStatus("Draw your signature first — a squiggle counts.");
      return;
    }
    var payload = JSON.stringify(strokes);
    if (payload.length > MAX_PAYLOAD) {
      setStatus("That signature is a bit too elaborate — try a shorter one.");
      return;
    }

    var last = 0;
    try { last = parseInt(localStorage.getItem("gb_last_post") || "0", 10); } catch (err) {}
    if (Date.now() - last < RATE_LIMIT_MS) {
      setStatus("Easy — one signature per minute.");
      return;
    }

    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    setStatus("Signing…");

    ref.push({
      name: name,
      strokes: strokes,
      ts: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      try { localStorage.setItem("gb_last_post", String(Date.now())); } catch (err) {}
      nameInput.value = "";
      strokes = [];
      current = null;
      redraw();
      setStatus("Signed. Your mark is on the wall.");
    }).catch(function () {
      setStatus("Couldn't save that — try again in a bit.");
    }).finally(function () {
      btn.disabled = false;
    });
  });
})();
