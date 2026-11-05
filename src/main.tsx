import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { getUiPrefs, subscribeUiPrefs } from "./lib/prefs";
import { applyTheme } from "./lib/theme/apply";

// The theme is applied outside React: it is a property of the document, and a
// switch should restyle the page without re-rendering a single component.
let applied = "";
const syncTheme = () => {
  const id = getUiPrefs().theme;
  if (id !== applied) { applied = id; applyTheme(id); }
};
syncTheme();
subscribeUiPrefs(syncTheme);

createRoot(document.getElementById("root")!).render(<App />);
