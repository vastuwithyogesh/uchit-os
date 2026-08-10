import{C as e,S as t,_ as n,c as r,d as i,f as a,g as o,h as s,l as c,m as l,p as u,u as d,v as f,w as ee,x as p,y as m}from"./auth-C5jZLXBa.js";import{join as h}from"node:path";import{constants as g}from"node:fs";import{access as _,mkdir as v,readFile as y,writeFile as b}from"node:fs/promises";var x=()=>({clients:structuredClone(c),leadQualifications:structuredClone(u),commercialProposals:structuredClone(d),reviewCallBookings:[],payments:structuredClone(o),advanceVerifications:[],vastuCases:structuredClone(t),floorWorkspaces:structuredClone(a),reportVersions:structuredClone(n),evaluationSnapshots:structuredClone(i),mapping32D:structuredClone(s),mapping16D:structuredClone(l),utilityRules:structuredClone(p),shaktiSnapshots:structuredClone(f),timelineEvents:structuredClone(m),optInLeads:[],whatsappTemplates:structuredClone(ee),whatsappLogs:structuredClone(e)});function S(){return globalThis.uchitVastuState??=x(),globalThis.uchitVastuState}function C(e){return globalThis.uchitVastuState=e,globalThis.uchitVastuState}function te(){return globalThis.uchitVastuState=x(),globalThis.uchitVastuState}function w(e){let t=[],n=``,r=!1;for(let i=0;i<e.length;i+=1){let a=e[i],o=e[i+1];if(a===`"`){r&&o===`"`?(n+=`"`,i+=1):r=!r;continue}if(a===`,`&&!r){t.push(n.trim()),n=``;continue}n+=a}return t.push(n.trim()),t}function T(e){return e.trim().toLowerCase().replace(/\s+/g,``).replace(/[_-]/g,``)}function E(e){return e.trim().toLowerCase()}function D(e){return e.replace(/\D/g,``)}function O(e){let t=e.trim();if(!t)return``;let n=t.match(/^(\d{4}-\d{2}-\d{2})/);if(n)return n[1];let r=new Date(t);return Number.isNaN(r.getTime())?t:r.toISOString().slice(0,10)}function k(e){let t=E(String(e.email??``)),n=D(String(e.phone??``)),r=String(e.fullName??``).trim().toLowerCase(),i=String(e.dob??``).trim().toLowerCase(),a=String(e.city??``).trim().toLowerCase(),o=String(e.source??``).trim().toLowerCase();return t?`email:${t}`:n?`phone:${n}`:r||i||a?`profile:${[r,i,a,o].filter(Boolean).join(`|`)}`:`fallback:${[r,i,a,o].filter(Boolean).join(`|`)||`unknown`}`}function A(e){let t=2166136261;for(let n=0;n<e.length;n+=1)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return`UC-${(t>>>0).toString(36).padStart(8,`0`).slice(0,10).toUpperCase()}`}function j(e){let t=e.split(/\r?\n/).map(e=>e.trim()).filter(Boolean);if(t.length===0)return[];let n=w(t[0]).map(T);return t.slice(1).map((e,t)=>{let r=w(e),i=Object.fromEntries(n.map((e,t)=>[e,r[t]??``])),a=String(i.status??``).trim().toLowerCase(),o=O(String(i.createdat??i.created_at??``));return{fullName:String(i.fullname??i.name??`Lead ${t+1}`),email:String(i.email??``),phone:String(i.phone??i.mobile??``),dob:String(i.dob??``),city:String(i.city??``),source:String(i.source??i.utmsource??`Website opt-in`),statusLabel:String(i.status??``),utmSource:String(i.utmsource??``),utmMedium:String(i.utmmedium??``),utmCampaign:String(i.utmcampaign??``),utmTerm:String(i.utmterm??``),utmContent:String(i.utmcontent??``),landingPage:String(i.landingpage??``),referrer:String(i.referrer??``),assignedTo:String(i.assignedto??``),deletedAt:String(i.deletedat??``),score:a===`qualified`?85:a===`disqualified`?25:a===`duplicate`?40:60,message:String(i.notes??i.message??``),notes:String(i.notes??i.message??``),csvCreatedDate:o}})}var M=h(process.cwd(),`data`,`optin-leads.json`);async function N(){try{await _(M,g.F_OK)}catch{await v(h(process.cwd(),`data`),{recursive:!0}),await b(M,JSON.stringify([],null,2),`utf8`)}}function P(e,t){let n=E(String(e.email??``)),r=D(String(e.phone??``)),i=String(e.identityKey??``).trim()||k({email:n,phone:r,fullName:String(e.fullName??``),dob:String(e.dob??``),city:String(e.city??``),source:String(e.source??``)}),a=String(e.uniqueClientId??``).trim()||A(i),o=String(e.importedAt??new Date().toISOString()),s=O(String(e.firstSeenAt??o)),c=O(String(e.lastSeenAt??o));return{id:String(e.id??`inbound_${Date.now()}_${t}`),uniqueClientId:a,identityKey:i,fullName:String(e.fullName??`Lead ${t+1}`),email:n,phone:r,dob:e.dob,city:String(e.city??``),source:String(e.source??`Website opt-in`),statusLabel:e.statusLabel,utmSource:e.utmSource,utmMedium:e.utmMedium,utmCampaign:e.utmCampaign,utmTerm:e.utmTerm,utmContent:e.utmContent,landingPage:e.landingPage,referrer:e.referrer,assignedTo:e.assignedTo,deletedAt:e.deletedAt,score:typeof e.score==`number`?e.score:60,message:String(e.message??e.notes??``),notes:e.notes,status:e.status??`NEW`,importedAt:o,firstSeenAt:s,lastSeenAt:c,submissionCount:typeof e.submissionCount==`number`?e.submissionCount:1,duplicateCount:typeof e.duplicateCount==`number`?e.duplicateCount:0,isReturningLead:!!e.isReturningLead,qualifiedAt:e.qualifiedAt,convertedClientId:e.convertedClientId}}async function ne(){let e=r();return e.DB?(await e.DB.prepare(`
    CREATE TABLE IF NOT EXISTS optin_leads (
      id TEXT PRIMARY KEY,
      identity_key TEXT NOT NULL UNIQUE,
      unique_client_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `).run(),((await e.DB.prepare(`SELECT payload FROM optin_leads ORDER BY last_seen_at DESC`).all()).results??[]).map((e,t)=>P(JSON.parse(e.payload),t))):null}async function re(e){let t=r();if(!t.DB)return null;let n=t.DB;return await n.batch([n.prepare(`
      CREATE TABLE IF NOT EXISTS optin_leads (
        id TEXT PRIMARY KEY,
        identity_key TEXT NOT NULL UNIQUE,
        unique_client_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )
    `),n.prepare(`DELETE FROM optin_leads`)]),e.length>0&&await t.DB.batch(e.map(e=>n.prepare(`INSERT INTO optin_leads (id, identity_key, unique_client_id, payload, imported_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(e.id,e.identityKey,e.uniqueClientId,JSON.stringify(e),e.importedAt,e.lastSeenAt))),e}async function F(){let e=await ne();if(e)return e;await N();let t=await y(M,`utf8`);return JSON.parse(t).map((e,t)=>P(e,t))}async function I(e){return await re(e)||(await N(),await b(M,JSON.stringify(e,null,2),`utf8`),e)}var L=h(process.cwd(),`data`,`review-call-bookings.json`);async function R(){try{await _(L,g.F_OK)}catch{await v(h(process.cwd(),`data`),{recursive:!0}),await b(L,JSON.stringify([],null,2),`utf8`)}}function z(e,t){return{id:String(e.id??`booking_${Date.now()}_${t}`),clientId:String(e.clientId??``),proposalId:String(e.proposalId??``),provider:e.provider===`ZOOM`?`ZOOM`:`GOOGLE_MEET`,scheduledAt:String(e.scheduledAt??new Date().toISOString()),durationMinutes:typeof e.durationMinutes==`number`?e.durationMinutes:30,meetingLink:String(e.meetingLink??``),calendarHoldId:String(e.calendarHoldId??``),status:e.status===`SENT`||e.status===`COMPLETED`||e.status===`CANCELLED`?e.status:`BOOKED`,bookedBy:String(e.bookedBy??`System`),bookedAt:String(e.bookedAt??new Date().toISOString())}}async function B(){let e=r();return e.DB?(await e.DB.prepare(`
    CREATE TABLE IF NOT EXISTS review_call_bookings (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      meeting_link TEXT NOT NULL,
      calendar_hold_id TEXT NOT NULL,
      status TEXT NOT NULL,
      booked_by TEXT NOT NULL,
      booked_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `).run(),((await e.DB.prepare(`SELECT payload FROM review_call_bookings ORDER BY booked_at DESC`).all()).results??[]).map((e,t)=>z(JSON.parse(e.payload),t))):null}async function V(e){let t=r();if(!t.DB)return null;let n=t.DB;return await n.batch([n.prepare(`
      CREATE TABLE IF NOT EXISTS review_call_bookings (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        meeting_link TEXT NOT NULL,
        calendar_hold_id TEXT NOT NULL,
        status TEXT NOT NULL,
        booked_by TEXT NOT NULL,
        booked_at TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `),n.prepare(`DELETE FROM review_call_bookings`)]),e.length>0&&await t.DB.batch(e.map(e=>n.prepare(`INSERT INTO review_call_bookings (id, client_id, proposal_id, provider, scheduled_at, duration_minutes, meeting_link, calendar_hold_id, status, booked_by, booked_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(e.id,e.clientId,e.proposalId,e.provider,e.scheduledAt,e.durationMinutes,e.meetingLink,e.calendarHoldId,e.status,e.bookedBy,e.bookedAt,JSON.stringify(e)))),e}async function H(){let e=await B();if(e)return e;await R();let t=await y(L,`utf8`);return JSON.parse(t).map((e,t)=>z(e,t))}async function U(e){return await V(e)||(await R(),await b(L,JSON.stringify(e,null,2),`utf8`),e)}var W=h(process.cwd(),`data`,`advance-verifications.json`);async function G(){try{await _(W,g.F_OK)}catch{await v(h(process.cwd(),`data`),{recursive:!0}),await b(W,JSON.stringify([],null,2),`utf8`)}}function K(e,t){return{id:String(e.id??`advver_${Date.now()}_${t}`),clientId:String(e.clientId??``),proposalId:String(e.proposalId??``),amountInr:typeof e.amountInr==`number`?e.amountInr:0,referenceScreenshotUrl:String(e.referenceScreenshotUrl??``),referenceScreenshotFileName:String(e.referenceScreenshotFileName??``),verifiedBy:String(e.verifiedBy??`System`),verifiedAt:String(e.verifiedAt??new Date().toISOString()),paymentId:String(e.paymentId??``),caseId:e.caseId?String(e.caseId):void 0,status:e.status===`CASE_OPENED`?`CASE_OPENED`:`VERIFIED`}}async function q(){let e=r();return e.DB?(await e.DB.prepare(`
    CREATE TABLE IF NOT EXISTS advance_verifications (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      amount_inr INTEGER NOT NULL,
      reference_screenshot_url TEXT NOT NULL,
      reference_screenshot_file_name TEXT NOT NULL,
      verified_by TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      case_id TEXT,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `).run(),((await e.DB.prepare(`SELECT payload FROM advance_verifications ORDER BY verified_at DESC`).all()).results??[]).map((e,t)=>K(JSON.parse(e.payload),t))):null}async function J(e){let t=r();if(!t.DB)return null;let n=t.DB;return await n.batch([n.prepare(`
      CREATE TABLE IF NOT EXISTS advance_verifications (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        amount_inr INTEGER NOT NULL,
        reference_screenshot_url TEXT NOT NULL,
        reference_screenshot_file_name TEXT NOT NULL,
        verified_by TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        payment_id TEXT NOT NULL,
        case_id TEXT,
        status TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `),n.prepare(`DELETE FROM advance_verifications`)]),e.length>0&&await t.DB.batch(e.map(e=>n.prepare(`INSERT INTO advance_verifications (id, client_id, proposal_id, amount_inr, reference_screenshot_url, reference_screenshot_file_name, verified_by, verified_at, payment_id, case_id, status, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(e.id,e.clientId,e.proposalId,e.amountInr,e.referenceScreenshotUrl,e.referenceScreenshotFileName,e.verifiedBy,e.verifiedAt,e.paymentId,e.caseId??null,e.status,JSON.stringify(e)))),e}async function Y(){let e=await q();if(e)return e;await G();let t=await y(W,`utf8`);return JSON.parse(t).map((e,t)=>K(e,t))}async function X(e){return await J(e)||(await G(),await b(W,JSON.stringify(e,null,2),`utf8`),e)}var ie=[{version:1,statements:[`CREATE TABLE IF NOT EXISTS app_state_snapshot (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`]},{version:2,statements:[`ALTER TABLE app_state_snapshot ADD COLUMN revision INTEGER NOT NULL DEFAULT 0`]}],ae=`CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
)`;async function Z(e){await e.prepare(ae).run();let t=await e.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all(),n=new Set((t.results??[]).map(e=>e.version));for(let t of ie){if(n.has(t.version))continue;if(t.version===2&&((await e.prepare(`PRAGMA table_info(app_state_snapshot)`).all()).results??[]).some(e=>e.name===`revision`)){await e.prepare(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)`).bind(t.version,new Date().toISOString()).run();continue}let r=new Date().toISOString(),i=t.statements.map(t=>e.prepare(t));i.push(e.prepare(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)`).bind(t.version,r)),await e.batch(i)}}var oe=[`clients`,`leadQualifications`,`commercialProposals`,`reviewCallBookings`,`payments`,`advanceVerifications`,`vastuCases`,`floorWorkspaces`,`reportVersions`,`evaluationSnapshots`,`mapping32D`,`mapping16D`,`utilityRules`,`shaktiSnapshots`,`timelineEvents`,`optInLeads`,`whatsappTemplates`,`whatsappLogs`];function se(e,t){let n={...e,...t},r=t;for(let t of oe)Array.isArray(r[t])||(n[t]=e[t]);return n}var Q=class extends Error{constructor(){super(`The saved state changed before this write completed. Reload and retry the operation.`),this.name=`PersistenceConflictError`}};async function ce(){let e=r();if(!e.DB)return null;await Z(e.DB);let t=await e.DB.prepare(`SELECT payload, revision FROM app_state_snapshot WHERE id = ?`).bind(`current`).first();return t?.payload?{state:JSON.parse(t.payload),revision:t.revision}:null}async function le(e,t){let n=r();if(!n.DB)return null;await Z(n.DB);let i=JSON.stringify(e),a=new Date().toISOString();if(t!==void 0){if((await n.DB.prepare(`UPDATE app_state_snapshot SET payload = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?`).bind(i,a,`current`,t).run()).meta.changes!==1)throw new Q}else await n.DB.prepare(`INSERT INTO app_state_snapshot (id, payload, updated_at, revision) VALUES (?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at,
       revision = app_state_snapshot.revision + 1`).bind(`current`,i,a).run();return e}async function ue(){return(await $()).state}async function $(){let e=S(),t=await ce();if(t){let n=se(e,t.state);return C(n),{state:n,revision:t.revision}}let n=e;return n.optInLeads=await F(),n.reviewCallBookings=await H(),n.advanceVerifications=await Y(),{state:n,revision:null}}async function de(e=S(),t){let n=structuredClone(e);return await le(n,t),await Promise.all([I(n.optInLeads),U(n.reviewCallBookings),X(n.advanceVerifications)]),C(n),n}export{X as a,I as c,E as d,D as f,te as h,de as i,k as l,S as m,ue as n,U as o,j as p,$ as r,F as s,Q as t,A as u};