import{c as e}from"./auth-Dc_XfOFn.js";import{dirname as t,join as n}from"node:path";import{existsSync as r,mkdirSync as i,readFileSync as a,writeFileSync as o}from"node:fs";var s={databaseUrl:``,directUrl:``,supabaseUrl:``,supabaseAnonKey:``,supabaseServiceRoleKey:``,appUrl:`http://localhost:3003`},c=n(process.cwd(),`data`,`local-settings.json`);async function l(){let t=e();if(!t.DB)return null;await t.DB.prepare(`
    CREATE TABLE IF NOT EXISTS local_settings (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();let n=await t.DB.prepare(`SELECT payload FROM local_settings WHERE id = ?`).bind(`current`).first();return n?.payload?JSON.parse(n.payload):null}async function u(t){let n=e();return n.DB?(await n.DB.prepare(`
    CREATE TABLE IF NOT EXISTS local_settings (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run(),await n.DB.prepare(`DELETE FROM local_settings WHERE id = ?`).bind(`current`).run(),await n.DB.prepare(`INSERT INTO local_settings (id, payload, updated_at) VALUES (?, ?, ?)`).bind(`current`,JSON.stringify(t),new Date().toISOString()).run(),t):null}function d(){if(!r(c))return s;try{let e=JSON.parse(a(c,`utf8`));return{...s,...e}}catch{return s}}function f(e){let n=t(c);return r(n)||i(n,{recursive:!0}),o(c,JSON.stringify(e,null,2),`utf8`),e}function p(e=d()){return{databaseUrl:!!(process.env.DATABASE_URL||e.databaseUrl),directUrl:!!(process.env.DIRECT_URL||e.directUrl),supabaseUrl:!!(process.env.NEXT_PUBLIC_SUPABASE_URL||e.supabaseUrl),supabaseAnonKey:!!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||e.supabaseAnonKey),supabaseServiceRoleKey:!!(process.env.SUPABASE_SERVICE_ROLE_KEY||e.supabaseServiceRoleKey),appUrl:!!(process.env.NEXT_PUBLIC_APP_URL||e.appUrl)}}function m(e){return{databaseUrl:``,directUrl:``,supabaseUrl:e.supabaseUrl,supabaseAnonKey:``,supabaseServiceRoleKey:``,appUrl:e.appUrl}}async function h(){return await l()??d()}async function g(e){return await u(e)||f(e)}export{g as i,h as n,m as r,p as t};