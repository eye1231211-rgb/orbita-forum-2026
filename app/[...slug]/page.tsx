import Dashboard from "../components/Dashboard";
import { requireStudent } from "@/lib/guard";
import { publicRoutes } from "@/lib/return-path.mjs";
export const dynamic = "force-dynamic";
type PageProps = {
  params: Promise<{slug:string[]}>;
  searchParams: Promise<Record<string,string|string[]|undefined>>;
};

/* Открытые страницы попадают в поиск и в мессенджеры, поэтому у них свой
   заголовок и описание. Закрытые разделы остаются с общим заголовком
   приложения: их содержимое индексировать незачем. */
const PAGE_META: Record<string,{title:string; description:string}> = {
  "/timetable": {
    title: "Расписание любой группы РЭУ — Орбита",
    description: "Живое расписание РЭУ им. Г. В. Плеханова: выберите группу из справочника и смотрите неделю без входа в кабинет.",
  },
  "/login": {
    title: "Вход в кабинет — Орбита",
    description: "Студенческий портал «Орбита» для РЭУ им. Г. В. Плеханова: расписание, успеваемость и обращения в деканат.",
  },
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  return PAGE_META[`/${slug.join("/")}`] ?? {};
}
export default async function Page({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const route = `/${slug.join("/")}`;
  if (!publicRoutes.includes(route)) {
    const query = new URLSearchParams();
    for (const [key,value] of Object.entries(await searchParams)) {
      if (typeof value === "string") query.set(key,value);
    }
    await requireStudent(route + (query.size ? "?" + query.toString() : ""));
  }
  return <Dashboard route={route} />;
}
