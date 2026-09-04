export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function bindCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") ?? "";
      const original = btn.textContent ?? "copy";
      const done = () => {
        btn.classList.add("copied");
        btn.textContent = "copied";
        window.setTimeout(() => {
          btn.classList.remove("copied");
          btn.textContent = original;
        }, 1400);
      };
      try {
        await navigator.clipboard.writeText(text);
        done();
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          done();
        } finally {
          document.body.removeChild(ta);
        }
      }
    });
  });
}

export function onHeroScroll(onProgress: (t: number) => void): () => void {
  const hero = document.querySelector<HTMLElement>(".hero");
  if (!hero) return () => {};
  let raf = 0;
  const update = () => {
    raf = 0;
    const h = hero.offsetHeight || 1;
    const t = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / h));
    onProgress(t);
  };
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(update);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    if (raf) cancelAnimationFrame(raf);
  };
}
