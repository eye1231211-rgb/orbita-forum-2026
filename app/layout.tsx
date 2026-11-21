import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./edition.css";
import "./system.css";
import "./mobile.css";
import {PointerLight} from "./components/pointer-light";
import {AmbientBackground} from "./components/ambient";
export const metadata: Metadata = {
  title: "Орбита — цифровой деканат РЭУ им. Г. В. Плеханова",
  description: "Кабинет студента: расписание групп РЭУ им. Г. В. Плеханова, результаты семестра и обращения.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover"};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body>{/* Живой фон под всем интерфейсом: сияние и мерцающая сетка */}<AmbientBackground/>{children}<PointerLight/></body></html>; }
