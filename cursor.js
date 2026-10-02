/* Subtle custom cursor: small dot + trailing ring that grows over links.
   Disabled on touch devices and when the user prefers reduced motion. */
(function () {
  var fine = window.matchMedia("(pointer: fine)").matches;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduced) return;

  var dot = document.getElementById("cursor-dot");
  var ring = document.getElementById("cursor-ring");
  if (!dot || !ring) return;

  var mx = -100, my = -100, rx = -100, ry = -100;
  var active = false;

  document.addEventListener("mousemove", function (e) {
    mx = e.clientX;
    my = e.clientY;
    if (!active) {
      active = true;
      document.body.classList.add("cursor-active", "custom-cursor");
      rx = mx;
      ry = my;
    }
    dot.style.transform = "translate(" + (mx - 3) + "px," + (my - 3) + "px)";
  });

  document.addEventListener("mouseleave", function () {
    active = false;
    document.body.classList.remove("cursor-active", "custom-cursor");
  });

  // Trailing ring via rAF lerp.
  function tick() {
    if (active) {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      var half = ring.offsetWidth / 2;
      ring.style.transform = "translate(" + (rx - half) + "px," + (ry - half) + "px)";
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Grow the ring over interactive elements.
  document.addEventListener("mouseover", function (e) {
    var t = e.target;
    if (t && t.closest && t.closest("a, button, input, textarea")) {
      document.body.classList.add("cursor-hover");
    }
  });
  document.addEventListener("mouseout", function (e) {
    var t = e.target;
    if (t && t.closest && t.closest("a, button, input, textarea")) {
      document.body.classList.remove("cursor-hover");
    }
  });
})();
