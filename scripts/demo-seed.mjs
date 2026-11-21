import {readFileSync, writeFileSync} from 'node:fs';
import {hashPassword} from '../lib/security.mjs';

const file = new URL('../db/demo-data.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const passwords = {
  alina: process.env.ORBIT_ALINA_PASSWORD,
  mark: process.env.ORBIT_MARK_PASSWORD
};

if (Object.values(passwords).some(value => !value || value.length < 10 || value.length > 256)) {
  throw new Error('Set ORBIT_ALINA_PASSWORD and ORBIT_MARK_PASSWORD (10–256 characters each).');
}

for (const login of Object.keys(passwords)) {
  const student = data.students.find(record => record.login === login);
  const credentials = data.credentials.find(record => record.student_id === student?.id);
  if (!credentials) throw new Error('Missing seed credentials for ' + login);
  credentials.password_hash = await hashPassword(passwords[login]);
}
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('Updated only the two salted password hashes in the seed.');
