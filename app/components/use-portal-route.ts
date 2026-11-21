"use client";
import { useEffect, useState } from "react";
import { api, clearPrivateData } from "./portal-client";
import { publicRoutes } from "../../lib/return-path.mjs";

const pages = /^\/(?:schedule|grades|profile|vibe|notifications|requests(?:\/[\w-]+)?)?$/;
const locationKey = () => location.pathname + location.search + location.hash;

function internalLink(target: EventTarget | null) {
  const anchor = target instanceof Element ? target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") ||
      (anchor.target && anchor.target !== "_self") || anchor.getAttribute("href")?.startsWith("#")) return;
  const url = new URL(anchor.href);
  return url.origin === location.origin && pages.test(url.pathname) ? url : undefined;
}

export function usePortalRoute(initialPath: string) {
  const [address, setAddress] = useState(initialPath);
  const route = address.split(/[?#]/)[0] || "/";
  useEffect(() => {
    const sessionChanged = (event: StorageEvent) => {
      if (event.key === "orbita-session-change") { clearPrivateData(); location.reload(); }
    };
    function restore(event: PageTransitionEvent) {
      if (event.persisted) { clearPrivateData(); location.reload(); }
    }
    window.addEventListener("storage", sessionChanged);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("storage", sessionChanged);
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  useEffect(() => {
    /* Открытые страницы живут вне клиентского роутера. Иначе ссылка «Личный
       кабинет» подменялась внутренним переходом: адрес менялся на /, сервер
       сессию не проверял, а кабинет оставался в бесконечной загрузке, потому
       что данные на открытой странице не запрашиваются. */
    if (publicRoutes.includes(initialPath)) return;
    setAddress(locationKey());
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const url = internalLink(event.target);
      if (!url) return;
      event.preventDefault();
      const key = url.pathname + url.search + url.hash;
      if (key === locationKey()) return;
      history.pushState(history.state, "", key);
      setAddress(key);
      window.scrollTo({ top: 0, behavior: "instant" });
      document.getElementById("main")?.focus({preventScroll:true});
    };
    const back = () => setAddress(locationKey());
    const warm = (event: Event) => {
      const url = internalLink(event.target);
      if (url?.pathname.startsWith("/requests/") && url.pathname !== "/requests/new") {
        void api("/api" + url.pathname).catch(() => {});
      }
    };
    document.addEventListener("click", navigate);
    document.addEventListener("focusin", warm);
    document.addEventListener("pointerover", warm);
    window.addEventListener("popstate", back);
    return () => {
      document.removeEventListener("click", navigate);
      document.removeEventListener("focusin", warm);
      document.removeEventListener("pointerover", warm);
      window.removeEventListener("popstate", back);
    };
  }, [initialPath]);
  return {route, address};
}
