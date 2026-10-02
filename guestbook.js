/* Guestbook backed by Firebase Realtime Database.
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

  var FIREBASE_API_KEY = "PASTE_YOUR_FIREBASE_API_KEY";

  var form = document.getElementById("guestbook-form");
  var nameInput = document.getElementById("guestbook-name");
  var msgInput = document.getElementById("guestbook-message");
  var status = document.getElementById("guestbook-status");
  var list = document.getElementById("guestbook-entries");
  var emptyNote = document.getElementById("guestbook-empty");

  var MAX_NAME = 40;
  var MAX_MSG = 500;
  var RATE_LIMIT_MS = 60 * 1000;

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric"
      });
    } catch (e) { return ""; }
  }

  function renderEntry(key, entry) {
    var li = document.createElement("li");
    li.id = "gb-" + key;

    var head = document.createElement("div");

    var name = document.createElement("span");
    name.className = "guestbook-name";
    name.textContent = entry.name || "anonymous";

    var time = document.createElement("span");
    time.className = "guestbook-time";
    time.textContent = entry.ts ? fmtTime(entry.ts) : "";

    var msg = document.createElement("p");
    msg.className = "guestbook-message";
    msg.textContent = entry.message || "";

    head.appendChild(name);
    head.appendChild(time);
    li.appendChild(head);
    li.appendChild(msg);
    return li;
  }

  function renderAll(entries) {
    // entries: {key: {name, message, ts}} — newest first
    while (list.firstChild) list.removeChild(list.firstChild);
    var keys = Object.keys(entries || {}).sort(function (a, b) {
      return (entries[b].ts || 0) - (entries[a].ts || 0);
    });
    keys.forEach(function (k) {
      list.appendChild(renderEntry(k, entries[k]));
    });
    if (emptyNote) emptyNote.style.display = keys.length ? "none" : "";
  }

  // Bail out gracefully if Firebase isn't configured yet.
  if (FIREBASE_API_KEY === "PASTE_YOUR_FIREBASE_API_KEY" ||
      typeof firebase === "undefined" || !firebase.database) {
    setStatus("Guestbook is being wired up — check back soon.");
    if (form) form.style.display = "none";
    return;
  }

  try {
    firebase.initializeApp({
      apiKey: FIREBASE_API_KEY,
      authDomain: "portfolio-b0516.firebaseapp.com",
      databaseURL: "https://portfolio-b0516-default-rtdb.firebaseio.com",
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

  ref.orderByChild("ts").limitToLast(50).on("value", function (snap) {
    renderAll(snap.val());
  }, function () {
    setStatus("Couldn't load entries. Check your connection.");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = nameInput.value.trim().slice(0, MAX_NAME);
    var message = msgInput.value.trim().slice(0, MAX_MSG);
    if (!name || !message) {
      setStatus("Name and message are both required.");
      return;
    }

    var last = 0;
    try { last = parseInt(localStorage.getItem("gb_last_post") || "0", 10); } catch (err) {}
    if (Date.now() - last < RATE_LIMIT_MS) {
      setStatus("Easy — one entry per minute.");
      return;
    }

    var btn = form.querySelector("button");
    btn.disabled = true;
    setStatus("Signing…");

    ref.push({
      name: name,
      message: message,
      ts: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      try { localStorage.setItem("gb_last_post", String(Date.now())); } catch (err) {}
      nameInput.value = "";
      msgInput.value = "";
      setStatus("Signed. Thanks for stopping by.");
    }).catch(function () {
      setStatus("Couldn't save that — try again in a bit.");
    }).finally(function () {
      btn.disabled = false;
    });
  });
})();
