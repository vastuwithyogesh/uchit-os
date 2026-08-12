import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

const drawer = source("components/unified-leads-workspace.tsx");
const sheet = source("components/lead-communication-sheet.tsx");
const form = source("components/qualification-form-client.tsx");
const booking = source("components/booking-response-client.tsx");
const css = source("app/globals.css");

test("lead drawer is read-only by default with allowlisted Founder edit workflow",()=>{assert.match(drawer,/Edit profile/);for(const field of ["fullName","email","phone","city","country","timeZone","serviceInterest"])assert.match(drawer,new RegExp(field));assert.match(drawer,/Private change reason/);});
test("drawer exposes three guided actions and leaves stage mutation on canonical pipeline",()=>{for(const label of ["Send VSL","Send deliverable brochure","Send qualification form"])assert.match(drawer,new RegExp(label));assert.match(drawer,/Pipeline transitions remain on Lead Pipeline/);assert.doesNotMatch(sheet,/SENT|DELIVERED|FAILED|RETRY/);});
test("manual compose sheet renders both channels and claims PREPARED or OPENED only",()=>{assert.match(sheet,/WhatsApp.*NOT PREPARED/s);assert.match(sheet,/Email.*NOT PREPARED/s);assert.match(sheet,/Open WhatsApp/);assert.match(sheet,/Open Email/);assert.match(sheet,/Yogesh must review and press Send manually/);});
test("secure public forms provide save-resume, final submit and exactly two booking responses",()=>{assert.match(form,/Save and resume later/);assert.match(form,/Submit qualification/);assert.match(form,/APPROVED_CROSS_SERVICE_COPY/);assert.match(booking,/CONFIRM_THIS_TIME/);assert.match(booking,/REQUEST_ANOTHER_TIME/);});
test("communication and public flows retain 44px mobile-safe controls",()=>{assert.match(css,/profile-edit-trigger[\s\S]*min-height:44px/);assert.match(css,/lead-communication-sheet[\s\S]*@media\(max-width:640px\)/);assert.match(css,/public-token-page/);});
