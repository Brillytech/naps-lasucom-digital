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
  });
}

window.addEventListener("load", () => {
  setTimeout(() => {
    document.body.classList.add("app-loaded");
  }, 750);
});