import { useEffect } from "react";

// One wheel notch moves the list a fixed chunk at once, which the eye reads
// as a jerk no matter how many frames per second the window is drawing. The
// wheel here only moves a *target*; an exponential ease walks the scroller
// towards it. Using a time constant rather than a per-frame fraction keeps
// the feel identical at 60, 144 or 240 Hz.

/** Time constant of the ease: ~63% of the remaining distance per TAU_MS. */
const TAU_MS = 55;
/** Below this the animation has visually arrived. */
const EPSILON_PX = 0.5;
/** Guard against a huge dt after the window was inactive. */
const MAX_DT_MS = 50;

const SCROLLERS = ".entry-list, .form, .settings, .generator, .select-menu";

function canScroll(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight > 1;
}

/** Wheel deltas come in pixels, lines or pages depending on the device. */
function deltaPx(e: WheelEvent, el: HTMLElement): number {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * el.clientHeight;
  return e.deltaY;
}

export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let el: HTMLElement | null = null;
    let target = 0;
    let raf = 0;
    let last = 0;

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el = null;
    }

    function step(now: number) {
      if (!el || !el.isConnected) return stop();
      const dt = Math.min(now - last, MAX_DT_MS);
      last = now;
      const remaining = target - el.scrollTop;
      if (Math.abs(remaining) < EPSILON_PX) {
        el.scrollTop = target;
        return stop();
      }
      el.scrollTop += remaining * (1 - Math.exp(-dt / TAU_MS));
      raf = requestAnimationFrame(step);
    }

    function onWheel(e: WheelEvent) {
      // Zoom gestures and horizontal wheels stay with the browser.
      if (e.ctrlKey || e.deltaY === 0) return;

      const node = e.target as HTMLElement | null;
      // A textarea scrolls on its own; do not steal its wheel.
      if (node instanceof HTMLTextAreaElement && canScroll(node)) return;

      const scroller = node?.closest?.(SCROLLERS) as HTMLElement | null;
      if (!scroller || !canScroll(scroller)) return;

      const max = scroller.scrollHeight - scroller.clientHeight;
      // At either end let the event through so nothing feels stuck.
      const delta = deltaPx(e, scroller);
      const atEnd =
        (delta < 0 && scroller.scrollTop <= 0) || (delta > 0 && scroller.scrollTop >= max);
      if (atEnd) return;

      e.preventDefault();
      // A fresh gesture starts from wherever the list actually is: the user
      // may have dragged the scrollbar or jumped since the last one.
      if (!raf || scroller !== el) {
        el = scroller;
        target = scroller.scrollTop;
      }
      target = Math.max(0, Math.min(max, target + delta));
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    }

    document.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("wheel", onWheel);
      stop();
    };
  }, []);
}
