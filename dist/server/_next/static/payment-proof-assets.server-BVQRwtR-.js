import{a as e}from"./auth-BDp05ZPy.js";import{extname as t}from"node:path";var n={"advance-proof":`Advance proof`,"balance-proof":`Balance proof`};function r(e){return{key:String(e.key??`advance-proof`),label:String(e.label??n[`advance-proof`]),fileName:String(e.fileName??e.file_name??``),url:String(e.url??``),uploadedAt:String(e.uploadedAt??e.uploaded_at??new Date().toISOString())}}function i(e){return e===`balance-proof`?`balance-proof`:`advance-proof`}async function a(){if(globalThis.uchitVastuPaymentProofAssets?.length)return structuredClone(globalThis.uchitVastuPaymentProofAssets);let t=e();if(t.DB){await t.DB.prepare(`
      CREATE TABLE IF NOT EXISTS payment_proof_assets (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        file_name TEXT NOT NULL,
        url TEXT NOT NULL,
        uploaded_at TEXT NOT NULL
      )
    `).run();let e=((await t.DB.prepare(`SELECT key, label, file_name, url, uploaded_at FROM payment_proof_assets ORDER BY uploaded_at DESC`).all()).results??[]).map(r);return globalThis.uchitVastuPaymentProofAssets=structuredClone(e),e}return globalThis.uchitVastuPaymentProofAssets??=[],structuredClone(globalThis.uchitVastuPaymentProofAssets)}async function o(t){globalThis.uchitVastuPaymentProofAssets=structuredClone(t);let n=e();return n.DB&&(await n.DB.batch([n.DB.prepare(`
        CREATE TABLE IF NOT EXISTS payment_proof_assets (
          key TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          file_name TEXT NOT NULL,
          url TEXT NOT NULL,
          uploaded_at TEXT NOT NULL
        )
      `),n.DB.prepare(`DELETE FROM payment_proof_assets`)]),t.length>0&&await n.DB.batch(t.map(e=>n.DB.prepare(`INSERT INTO payment_proof_assets (key, label, file_name, url, uploaded_at) VALUES (?, ?, ?, ?, ?)`).bind(e.key,e.label,e.fileName,e.url,e.uploadedAt)))),t}function s(e){return e.replace(/[^a-zA-Z0-9._-]/g,`_`)}function c(e,n){let r=t(n)||`.png`;return`${e}-${Date.now()}${r}`}async function l(e,t=`advance-proof`){let r=i(t),l=c(r,s(e.name||`${r}.png`)),u=Buffer.from(await e.arrayBuffer()),d=`data:${e.type||`image/png`};base64,${u.toString(`base64`)}`,f=await a(),p={key:r,label:n[r],fileName:l,url:d,uploadedAt:new Date().toISOString()};return await o([p,...f.filter(e=>e.key!==r)]),p}export{a as n,l as r,i as t};