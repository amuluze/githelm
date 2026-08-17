/**
 * Theme bridge: keep the live DOM in sync with the resolved theme from
 * the Zustand store. Separated from the store so components can call it
 * during effect setup without depending on zustand types.
 */

export type ResolvedTheme = "light" | "dark";

export const applyThemeToDocument = (theme: ResolvedTheme) => {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
};