import {randomUUID} from 'node:crypto';
import {seedDatabase} from '../lib/seed.mjs';
import {hashPassword} from '../lib/security.mjs';

const passwords = {alina: randomUUID(), mark: randomUUID()};
const hashes = await Promise.all(Object.entries(passwords).map(async ([login, password]) =>
  [login, await hashPassword(password)]));

export const testCredentials = login => ({login, password: passwords[login]});

export async function prepareTestAccounts(db) {
  await seedDatabase(db);
  await db.batch(hashes.map(([login, hash]) => db.prepare(
    'UPDATE credentials SET password_hash=? WHERE student_id=(SELECT id FROM students WHERE login=?)'
  ).bind(hash, login)));
}
