import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {env} from 'cloudflare:workers';
import {getStudent} from './api.mjs';
import {loginPath} from './return-path.mjs';
export async function requireStudent(destination = '/') {
  const jar=await cookies();
  const student=await getStudent(env.DB,jar.toString());
  if(!student) redirect(loginPath(destination));
  return student;
}
