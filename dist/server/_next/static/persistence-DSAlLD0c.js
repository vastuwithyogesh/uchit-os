import{a as e,b as t,c as n,d as r,f as i,g as a,h as o,l as s,m as c,o as l,p as u,s as d,u as f,v as p,x as m,y as h}from"./auth-ColFi1I5.js";import{join as g}from"node:path";import{constants as _}from"node:fs";import{access as v,mkdir as y,readFile as b,writeFile as x}from"node:fs/promises";var S=()=>({clients:structuredClone(l),leadQualifications:structuredClone(f),commercialProposals:structuredClone(d),reviewCallBookings:[],payments:structuredClone(u),advanceVerifications:[],vastuCases:structuredClone(h),floorWorkspaces:structuredClone(s),reportVersions:structuredClone(c),evaluationSnapshots:structuredClone(n),mapping32D:structuredClone(i),mapping16D:structuredClone(r),utilityRules:structuredClone(p),shaktiSnapshots:structuredClone(o),timelineEvents:structuredClone(a),optInLeads:[],whatsappTemplates:structuredClone(m),whatsappLogs:structuredClone(t)});function C(){return globalThis.uchitVastuState??=S(),globalThis.uchitVastuState}function w(e){return globalThis.uchitVastuState=e,globalThis.uchitVastuState}function T(){return globalThis.uchitVastuState=S(),globalThis.uchitVastuState}function E(e){let t=[],n=``,r=!1;for(let i=0;i<e.length;i+=1){let a=e[i],o=e[i+1];if(a===`"`){r&&o===`"`?(n+=`"`,i+=1):r=!r;continue}if(a===`,`&&!r){t.push(n.trim()),n=``;continue}n+=a}return t.push(n.trim()),t}function ee(e){return e.trim().toLowerCase().replace(/\s+/g,``).replace(/[_-]/g,``)}function D(e){return e.trim().toLowerCase()}function O(e){return e.replace(/\D/g,``)}function k(e){let t=e.trim();if(!t)return``;let n=t.match(/^(\d{4}-\d{2}-\d{2})/);if(n)return n[1];let r=new Date(t);return Number.isNaN(r.getTime())?t:r.toISOString().slice(0,10)}function A(e){let t=D(String(e.email??``)),n=O(String(e.phone??``)),r=String(e.fullName??``).trim().toLowerCase(),i=String(e.dob??``).trim().toLowerCase(),a=String(e.city??``).trim().toLowerCase(),o=String(e.source??``).trim().toLowerCase();return t?`email:${t}`:n?`phone:${n}`:r||i||a?`profile:${[r,i,a,o].filter(Boolean).join(`|`)}`:`fallback:${[r,i,a,o].filter(Boolean).join(`|`)||`unknown`}`}function j(e){let t=2166136261;for(let n=0;n<e.length;n+=1)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return`UC-${(t>>>0).toString(36).padStart(8,`0`).slice(0,10).toUpperCase()}`}function M(e){let t=e.split(/\r?\n/).map(e=>e.trim()).filter(Boolean);if(t.length===0)return[];let n=E(t[0]).map(ee);return t.slice(1).map((e,t)=>{let r=E(e),i=Object.fromEntries(n.map((e,t)=>[e,r[t]??``])),a=String(i.status??``).trim().toLowerCase(),o=k(String(i.createdat??i.created_at??``));return{fullName:String(i.fullname??i.name??`Lead ${t+1}`),email:String(i.email??``),phone:String(i.phone??i.mobile??``),dob:String(i.dob??``),city:String(i.city??``),source:String(i.source??i.utmsource??`Website opt-in`),statusLabel:String(i.status??``),utmSource:String(i.utmsource??``),utmMedium:String(i.utmmedium??``),utmCampaign:String(i.utmcampaign??``),utmTerm:String(i.utmterm??``),utmContent:String(i.utmcontent??``),landingPage:String(i.landingpage??``),referrer:String(i.referrer??``),assignedTo:String(i.assignedto??``),deletedAt:String(i.deletedat??``),score:a===`qualified`?85:a===`disqualified`?25:a===`duplicate`?40:60,message:String(i.notes??i.message??``),notes:String(i.notes??i.message??``),csvCreatedDate:o}})}var N=g(process.cwd(),`data`,`optin-leads.json`);async function P(){try{await v(N,_.F_OK)}catch{await y(g(process.cwd(),`data`),{recursive:!0}),await x(N,JSON.stringify([],null,2),`utf8`)}}function F(e,t){let n=D(String(e.email??``)),r=O(String(e.phone??``)),i=String(e.identityKey??``).trim()||A({email:n,phone:r,fullName:String(e.fullName??``),dob:String(e.dob??``),city:String(e.city??``),source:String(e.source??``)}),a=String(e.uniqueClientId??``).trim()||j(i),o=String(e.importedAt??new Date().toISOString()),s=k(String(e.firstSeenAt??o)),c=k(String(e.lastSeenAt??o));return{id:String(e.id??`inbound_${Date.now()}_${t}`),uniqueClientId:a,identityKey:i,fullName:String(e.fullName??`Lead ${t+1}`),email:n,phone:r,dob:e.dob,city:String(e.city??``),source:String(e.source??`Website opt-in`),statusLabel:e.statusLabel,utmSource:e.utmSource,utmMedium:e.utmMedium,utmCampaign:e.utmCampaign,utmTerm:e.utmTerm,utmContent:e.utmContent,landingPage:e.landingPage,referrer:e.referrer,assignedTo:e.assignedTo,deletedAt:e.deletedAt,score:typeof e.score==`number`?e.score:60,message:String(e.message??e.notes??``),notes:e.notes,status:e.status??`NEW`,importedAt:o,firstSeenAt:s,lastSeenAt:c,submissionCount:typeof e.submissionCount==`number`?e.submissionCount:1,duplicateCount:typeof e.duplicateCount==`number`?e.duplicateCount:0,isReturningLead:!!e.isReturningLead,qualifiedAt:e.qualifiedAt,convertedClientId:e.convertedClientId}}async function I(){let t=e();return t.DB?(await t.DB.prepare(`
    CREATE TABLE IF NOT EXISTS optin_leads (
      id TEXT PRIMARY KEY,
      identity_key TEXT NOT NULL UNIQUE,
      unique_client_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `).run(),((await t.DB.prepare(`SELECT payload FROM optin_leads ORDER BY last_seen_at DESC`).all()).results??[]).map((e,t)=>F(JSON.parse(e.payload),t))):null}async function te(t){let n=e();return n.DB?(await n.DB.batch([n.DB.prepare(`
      CREATE TABLE IF NOT EXISTS optin_leads (
        id TEXT PRIMARY KEY,
        identity_key TEXT NOT NULL UNIQUE,
        unique_client_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )
    `),n.DB.prepare(`DELETE FROM optin_leads`)]),t.length>0&&await n.DB.batch(t.map(e=>n.DB.prepare(`INSERT INTO optin_leads (id, identity_key, unique_client_id, payload, imported_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(e.id,e.identityKey,e.uniqueClientId,JSON.stringify(e),e.importedAt,e.lastSeenAt))),t):null}async function L(){let e=await I();if(e)return e;await P();let t=await b(N,`utf8`);return JSON.parse(t).map((e,t)=>F(e,t))}async function R(e){return await te(e)||(await P(),await x(N,JSON.stringify(e,null,2),`utf8`),e)}var z=g(process.cwd(),`data`,`review-call-bookings.json`);async function B(){try{await v(z,_.F_OK)}catch{await y(g(process.cwd(),`data`),{recursive:!0}),await x(z,JSON.stringify([],null,2),`utf8`)}}function V(e,t){return{id:String(e.id??`booking_${Date.now()}_${t}`),clientId:String(e.clientId??``),proposalId:String(e.proposalId??``),provider:e.provider===`ZOOM`?`ZOOM`:`GOOGLE_MEET`,scheduledAt:String(e.scheduledAt??new Date().toISOString()),durationMinutes:typeof e.durationMinutes==`number`?e.durationMinutes:30,meetingLink:String(e.meetingLink??``),calendarHoldId:String(e.calendarHoldId??``),status:e.status===`SENT`||e.status===`COMPLETED`||e.status===`CANCELLED`?e.status:`BOOKED`,bookedBy:String(e.bookedBy??`System`),bookedAt:String(e.bookedAt??new Date().toISOString())}}async function H(){let t=e();return t.DB?(await t.DB.prepare(`
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
  `).run(),((await t.DB.prepare(`SELECT payload FROM review_call_bookings ORDER BY booked_at DESC`).all()).results??[]).map((e,t)=>V(JSON.parse(e.payload),t))):null}async function U(t){let n=e();return n.DB?(await n.DB.batch([n.DB.prepare(`
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
    `),n.DB.prepare(`DELETE FROM review_call_bookings`)]),t.length>0&&await n.DB.batch(t.map(e=>n.DB.prepare(`INSERT INTO review_call_bookings (id, client_id, proposal_id, provider, scheduled_at, duration_minutes, meeting_link, calendar_hold_id, status, booked_by, booked_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(e.id,e.clientId,e.proposalId,e.provider,e.scheduledAt,e.durationMinutes,e.meetingLink,e.calendarHoldId,e.status,e.bookedBy,e.bookedAt,JSON.stringify(e)))),t):null}async function W(){let e=await H();if(e)return e;await B();let t=await b(z,`utf8`);return JSON.parse(t).map((e,t)=>V(e,t))}async function G(e){return await U(e)||(await B(),await x(z,JSON.stringify(e,null,2),`utf8`),e)}var K=g(process.cwd(),`data`,`advance-verifications.json`);async function q(){try{await v(K,_.F_OK)}catch{await y(g(process.cwd(),`data`),{recursive:!0}),await x(K,JSON.stringify([],null,2),`utf8`)}}function J(e,t){return{id:String(e.id??`advver_${Date.now()}_${t}`),clientId:String(e.clientId??``),proposalId:String(e.proposalId??``),amountInr:typeof e.amountInr==`number`?e.amountInr:0,referenceScreenshotUrl:String(e.referenceScreenshotUrl??``),referenceScreenshotFileName:String(e.referenceScreenshotFileName??``),verifiedBy:String(e.verifiedBy??`System`),verifiedAt:String(e.verifiedAt??new Date().toISOString()),paymentId:String(e.paymentId??``),caseId:e.caseId?String(e.caseId):void 0,status:e.status===`CASE_OPENED`?`CASE_OPENED`:`VERIFIED`}}async function Y(){let t=e();return t.DB?(await t.DB.prepare(`
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
  `).run(),((await t.DB.prepare(`SELECT payload FROM advance_verifications ORDER BY verified_at DESC`).all()).results??[]).map((e,t)=>J(JSON.parse(e.payload),t))):null}async function X(t){let n=e();return n.DB?(await n.DB.batch([n.DB.prepare(`
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
    `),n.DB.prepare(`DELETE FROM advance_verifications`)]),t.length>0&&await n.DB.batch(t.map(e=>n.DB.prepare(`INSERT INTO advance_verifications (id, client_id, proposal_id, amount_inr, reference_screenshot_url, reference_screenshot_file_name, verified_by, verified_at, payment_id, case_id, status, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(e.id,e.clientId,e.proposalId,e.amountInr,e.referenceScreenshotUrl,e.referenceScreenshotFileName,e.verifiedBy,e.verifiedAt,e.paymentId,e.caseId??null,e.status,JSON.stringify(e)))),t):null}async function Z(){let e=await Y();if(e)return e;await q();let t=await b(K,`utf8`);return JSON.parse(t).map((e,t)=>J(e,t))}async function Q(e){return await X(e)||(await q(),await x(K,JSON.stringify(e,null,2),`utf8`),e)}var $=`
CREATE TABLE IF NOT EXISTS app_state_snapshot (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
`;async function ne(){let t=e();if(!t.DB)return null;await t.DB.prepare($).run();let n=await t.DB.prepare(`SELECT payload FROM app_state_snapshot WHERE id = ?`).bind(`current`).first();return n?.payload?JSON.parse(n.payload):null}async function re(t){let n=e();return n.DB?(await n.DB.prepare($).run(),await n.DB.prepare(`DELETE FROM app_state_snapshot WHERE id = ?`).bind(`current`).run(),await n.DB.prepare(`INSERT INTO app_state_snapshot (id, payload, updated_at) VALUES (?, ?, ?)`).bind(`current`,JSON.stringify(t),new Date().toISOString()).run(),t):null}async function ie(){let e=await ne();if(e)return w(e),e;let t=C();return t.optInLeads=await L(),t.reviewCallBookings=await W(),t.advanceVerifications=await Z(),t}async function ae(e=C()){let t=structuredClone(e);return w(t),await re(t),await Promise.all([R(t.optInLeads),G(t.reviewCallBookings),Q(t.advanceVerifications)]),t}export{L as a,j as c,M as d,C as f,G as i,D as l,w as m,ae as n,R as o,T as p,Q as r,A as s,ie as t,O as u};