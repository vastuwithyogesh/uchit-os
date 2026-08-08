import{a as e,n as t}from"./auth-ColFi1I5.js";import{n}from"./server-B9ZOT4Md.js";import{t as r}from"./chart-asset-definitions-B6AEJCxV.js";import{extname as i,join as a}from"node:path";import{constants as o}from"node:fs";import{access as s,mkdir as c,readFile as l,writeFile as u}from"node:fs/promises";var d=a(process.cwd(),`data`,`chart-assets.json`),f=a(process.cwd(),`public`,`chart-assets`);async function p(){try{await s(d,o.F_OK)}catch{await c(a(process.cwd(),`data`),{recursive:!0}),await u(d,JSON.stringify([],null,2),`utf8`)}}async function m(){let t=e();if(t.DB)return await t.DB.prepare(`
      CREATE TABLE IF NOT EXISTS chart_assets (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        file_name TEXT NOT NULL,
        url TEXT NOT NULL,
        uploaded_at TEXT NOT NULL
      )
    `).run(),(await t.DB.prepare(`SELECT key, label, file_name, url, uploaded_at FROM chart_assets ORDER BY uploaded_at DESC`).all()).results??[];await p();let n=await l(d,`utf8`);return JSON.parse(n)}async function h(t){let n=e();return n.DB?(await n.DB.batch([n.DB.prepare(`
        CREATE TABLE IF NOT EXISTS chart_assets (
          key TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          file_name TEXT NOT NULL,
          url TEXT NOT NULL,
          uploaded_at TEXT NOT NULL
        )
      `),n.DB.prepare(`DELETE FROM chart_assets`)]),t.length>0&&await n.DB.batch(t.map(e=>n.DB.prepare(`INSERT INTO chart_assets (key, label, file_name, url, uploaded_at) VALUES (?, ?, ?, ?, ?)`).bind(e.key,e.label,e.fileName,e.url,e.uploadedAt))),t):(await p(),await u(d,JSON.stringify(t,null,2),`utf8`),t)}async function g(){return await c(f,{recursive:!0}),f}function _(e){return r.find(t=>t.key===e)}function v(e){return`/chart-assets/${e}`}function y(e){return e.replace(/[^a-zA-Z0-9._-]/g,`_`)}function b(e,t){let n=i(t)||`.png`;return`${e}-${Date.now()}${n}`}async function x(t,n){let r=e();return r.R2?(await r.R2.put(`chart-assets/${t}`,n),{fileName:t,url:`/chart-assets/${t}`}):(await g(),await u(a(f,t),n),{fileName:t,url:v(t)})}async function S(e){let i=await t(e,`CONSULTANT`);if(!i.ok)return i.response;let a=await m(),o=new Set(a.map(e=>e.key));return n.json({assets:a,definitions:r,summary:{required:r.length,uploaded:a.length,pending:r.length-a.length,complete:r.length>0&&a.length===r.length,missingKeys:r.filter(e=>!o.has(e.key)).map(e=>e.key)}})}async function C(e){let r=await t(e,`CONSULTANT`);if(!r.ok)return r.response;let i=await e.formData(),a=String(i.get(`key`)??``),o=i.get(`file`);if(!_(a))return n.json({ok:!1,error:`Unknown chart key.`},{status:400});if(!(o instanceof File))return n.json({ok:!1,error:`Missing chart image file.`},{status:400});let s=b(a,y(o.name||`${a}.png`));await x(s,new Uint8Array(await o.arrayBuffer()));let c=(await m()).filter(e=>e.key!==a),l=_(a),u={key:l.key,label:l.label,fileName:s,url:v(s),uploadedAt:new Date().toISOString()};return await h([u,...c]),n.json({ok:!0,asset:u})}export{S as GET,C as POST};