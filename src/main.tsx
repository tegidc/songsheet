import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { getUiPrefs, subscribeUiPrefs } from "./lib/prefs";
import { applyTheme } from "./lib/theme/apply";
import { devDarkOverride, devThemeOverride } from "./dev/demo";

// The theme is applied outside React: it is a property of the document, and a
// switch should restyle the page without re-rendering a single component.
let applied = "";
const syncTheme = () => {
  const p = getUiPrefs();
  const id = devThemeOverride ?? p.theme;
  const dark = devDarkOverride ?? p.dark;
  const key = `${id}:${dark}`;
  if (key !== applied) { applied = key; applyTheme(id, dark); }
};
syncTheme();
subscribeUiPrefs(syncTheme);

createRoot(document.getElementById("root")!).render(<App />);
