import { createRoot } from "react-dom/client";
import Dashboard from "../app/components/Dashboard";
import "../app/globals.css";
import "../app/edition.css";
import "../app/system.css";
import "../app/mobile.css";
import { PointerLight } from "../app/components/pointer-light";
import { AmbientBackground } from "../app/components/ambient";

const route = window.location.pathname.replace(/\/+$/, "") || "/";
createRoot(document.getElementById("root")!).render(
  <>
    <AmbientBackground />
    <Dashboard route={route} />
    <PointerLight />
  </>
);
