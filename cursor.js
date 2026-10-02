/* Custom cursor: blue arrow that morphs into a pulsing ring over links.
   Disabled on touch devices; pulse animation off for prefers-reduced-motion. */
(function () {
  "use strict";
  var fine = window.matchMedia("(pointer: fine)").matches;
  if (!fine) return;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var arrow = document.querySelector(".cursor-arrow");
  var ring = document.querySelector(".cursor-ring");
  if (!arrow || !ring) return;

  var mx = -100, my = -100;   // mouse
  var ax = -100, ay = -100;   // arrow (snappy)
  var rx = -100, ry = -100;   // ring (laggy)
  var hovering = false;

  document.addEventListener("mousemove", function (e) {
    mx = e.clientX; my = e.clientY;
    var t = e.target;
    var hot = t && t.closest && t.closest("a, button, input, textarea, .nav-item");
    var now = !!hot;
    if (now !== hovering) {
      hovering = now;
      document.body.classList.toggle("cursor-hover", now);
    }
  }, { passive: true });

  document.addEventListener("mouseleave", function () {
    mx = my = ax = ay = rx = ry = -100;
  });

  function frame() {
    if (reduced) {
      ax = mx; ay = my; rx = mx; ry = my;
    } else {
      ax += (mx - ax) * 0.55;
      ay += (my - ay) * 0.55;
      rx += (mx - rx) * 0.22;
      ry += (my - ry) * 0.22;
    }
    arrow.style.transform = "translate(" + (ax - 2) + "px," + (ay - 2) + "px)";
    // ring is centered via CSS translate(-50%,-50%) on an inner offset:
    ring.style.left = rx + "px";
    ring.style.top = ry + "px";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
