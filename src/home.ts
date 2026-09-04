import { bindCopyButtons, onHeroScroll, prefersReducedMotion } from "./lib/dom";

bindCopyButtons();

const canvas = document.querySelector<HTMLCanvasElement>("#visor-lens");
if (canvas && !prefersReducedMotion()) {
  const start = () => {
    void import("./lib/visor-lens").then(({ mountVisorLens }) => {
      const lens = mountVisorLens(canvas, { reducedMotion: false });
      if (lens) onHeroScroll((t) => lens.setHeroProgress(t));
    });
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(start, { timeout: 200 });
  } else {
    requestAnimationFrame(start);
  }
} else if (canvas) {
  void import("./lib/visor-lens").then(({ mountVisorLens }) => {
    mountVisorLens(canvas, { reducedMotion: true });
  });
}
