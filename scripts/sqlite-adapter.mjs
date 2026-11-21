import {DatabaseSync} from 'node:sqlite';
const runSync=Symbol('runSync');
export function sqliteAdapter(path=':memory:') {
  const sqlite=new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  const prepare=sql=>{
    let args=[];
    const statement={
      bind(...values){args=values;return statement;},
      async first(){return sqlite.prepare(sql).get(...args)||null;},
      async all(){return {results:sqlite.prepare(sql).all(...args)};},
      async run(){return statement[runSync]();},
      [runSync](){return sqlite.prepare(sql).run(...args);}
    };return statement;
  };
  return {prepare,sqlite,async batch(statements){
    // Node's synchronous SQLite writes must stay in one JavaScript turn. An
    // await here would let another request read a partly completed transaction.
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const rows=statements.map(statement=>statement[runSync]());
      sqlite.exec('COMMIT');
      return rows;
    } catch(error) {sqlite.exec('ROLLBACK');throw error;}
  }};
}
