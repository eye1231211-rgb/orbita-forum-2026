import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import './sites-env.mjs';
mkdirSync('.wrangler',{recursive:true});
writeFileSync('.wrangler/db-config.json',JSON.stringify({name:'orbit-local',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:'../drizzle'}]}));
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','.wrangler/db-config.json','--persist-to','.wrangler/state'],{stdio:'inherit',env:{...process.env,CI:'true'}});
if(result.status!==0) process.exit(result.status||1);
if(process.argv.includes('--seed')) {
  const data=JSON.parse(readFileSync('db/demo-data.json','utf8'));
  const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
  const sql=Object.entries(data).flatMap(([table,rows])=>rows.map(row=>`INSERT OR IGNORE INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`)).join('\n');
  writeFileSync('.wrangler/demo-seed.sql',sql);
  const seed=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','.wrangler/db-config.json','--persist-to','.wrangler/state','--file','.wrangler/demo-seed.sql'],{stdio:'inherit'});
  process.exitCode=seed.status||0;
}
