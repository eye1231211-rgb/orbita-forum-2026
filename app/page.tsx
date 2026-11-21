import Dashboard from "./components/Dashboard";
import { requireStudent } from "@/lib/guard";
export const dynamic = "force-dynamic";
export default async function Home() { await requireStudent(); return <Dashboard route="/" />; }
