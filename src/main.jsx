import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
  navigator.serviceWorker
    .register("/service-worker.js")
    .then(() => {
      console.log("NAPS LASUCOM service worker registered");
    })
    .catch((error) => {
      console.log("Service worker registration failed:", error);
    });

  const splash = document.getElementById("app-splash");

  if (!splash) return;

  // Animate content in
  setTimeout(() => {
    splash.classList.add("show");
  }, 120);

  // Keep splash visible longer
  setTimeout(() => {
    splash.style.opacity = "0";

    // Smooth fade before removing
    setTimeout(() => {
      splash.remove();
    }, 700);
  }, 2500);
});
}
