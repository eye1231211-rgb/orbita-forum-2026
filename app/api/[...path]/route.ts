import {env} from 'cloudflare:workers';
import {handleApi} from '@/lib/api.mjs';
export const dynamic='force-dynamic';
// Переменные окружения Worker'а несут режимы входа и ведомости: по ним
// lib/sources.mjs решает, работает «Орбита» на демонстрационных данных
// или на подключении университета.
const settings = () => env as unknown as Record<string,string|undefined>;
export async function GET(request:Request) { return handleApi(request,env.DB,new Date(),settings()); }
export async function POST(request:Request) { return handleApi(request,env.DB,new Date(),settings()); }
