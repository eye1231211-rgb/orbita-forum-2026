import { loginPath } from "../../lib/return-path.mjs";

type ApiError = Error & { fields?: Record<string, string>; status?: number };
type Entry = { value: unknown; saved: number };
const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let generation = 0;
const freshFor = 60_000;

export function clearPrivateData() {
  generation++;
  entries.clear();
  inflight.clear();
}

export function cached<T>(url: string): T | undefined {
  const entry = entries.get(url);
  if (entry && Date.now() - entry.saved < freshFor) return entry.value as T;
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
      ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const result = await response.json() as {error?:string; fields?:Record<string,string>};
    if (!response.ok) {
      if (response.status === 401 && url !== "/api/login") {
        clearPrivateData();
        location.replace(loginPath(location.pathname + location.search + location.hash));
      }
      throw Object.assign(new Error(result.error || "Не удалось выполнить действие."), { status: response.status, fields: result.fields }) as ApiError;
    }
    return result as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Сервер не ответил вовремя. Попробуйте ещё раз.");
    if (error instanceof TypeError) throw new Error("Проверьте соединение и повторите действие.");
    throw error;
  } finally { clearTimeout(timer); }
}

export function api<T>(url: string, body?: unknown): Promise<T> {
  if (body !== undefined) return request<T>(url, body).then(result => {
    clearPrivateData();
    if (url === "/api/login" || url === "/api/logout") {
      try { localStorage.setItem("orbita-session-change", String(Date.now())); } catch { /* Storage is optional. */ }
    }
    return result;
  });
  const value = cached<T>(url);
  if (value !== undefined) return Promise.resolve(value);
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;
  const started = generation;
  const next = request<T>(url).then(result => {
    if (started === generation) {
      if (entries.size >= 32) entries.delete(entries.keys().next().value!);
      entries.set(url, { value: result, saved: Date.now() });
    }
    return result;
  }).finally(() => { if (inflight.get(url) === next) inflight.delete(url); });
  inflight.set(url, next);
  return next;
}
