export function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.classList.add("fade-out");
  const cleanup = () => splash.remove();
  splash.addEventListener("transitionend", cleanup, { once: true });
  setTimeout(cleanup, 600);
}
