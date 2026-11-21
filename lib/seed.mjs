import data from '../db/demo-data.json' with {type:'json'};
const initialized = new WeakMap();
export function seedDatabase(db) {
  if (!initialized.has(db)) {
    const pending = (async()=>{
      // INSERT OR IGNORE also fills missing fixtures after a new release.
      // Existing profiles, passwords, requests and read states are preserved.
      await applySeed(db);
    })();
    initialized.set(db,pending);
    pending.catch(()=>initialized.delete(db));
  }
  return initialized.get(db);
}
export function seedStatements(db) {
  return Object.entries(data).flatMap(([table,rows])=>rows.map(row=>{
    const columns=Object.keys(row);
    return db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...Object.values(row));
  }));
}
export async function applySeed(db) { const statements=seedStatements(db); if(statements.length) await db.batch(statements); }
