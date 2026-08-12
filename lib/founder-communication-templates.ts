export type FounderTemplateKey = "VSL" | "BROCHURE" | "QUALIFICATION" | "ASSIGNED_REVIEW_CALL" | "CONFIRMED_REVIEW_CALL" | "REMINDER_24H" | "REMINDER_2H";

export type TemplateValues = Record<string, string>;
export type FounderTemplate = { key: FounderTemplateKey; version: 1; whatsapp: string; emailSubject: string; email: string };

const vslWhatsApp = `Hello {First Name},

Thank you for connecting with Uchit Vastu India.

Please watch the complete video here:
www.uchitvastu.com/join

The video explains our approach, process and how we work with each property.

If you feel this consultation may be relevant for you, please reply ‘Interested’. We will then send you the appropriate qualification form and arrange your Private Review Call.

Regards,
Yogesh Hora
Uchit Vastu India`;

const vslEmail = vslWhatsApp.replace("Please watch the complete video here:", "Please watch the complete introductory video using the link below:");

const brochureWhatsApp = `Hello {First Name},

As requested, please review our {Service Title} brochure:

{Secure Brochure Link}

It explains the approach, process, scope, deliverables and professional boundaries for this service.

The exact scope, timeline and commercial terms for your property will be configured separately after qualification and review.

After reviewing it, please reply ‘Interested’. We will send you the appropriate qualification form and arrange your Private Review Call.

Regards,
Yogesh Hora
Uchit Vastu India`;

const brochureEmail = brochureWhatsApp.replace("brochure:\n\n", "brochure using the secure link below:\n\n");

const qualificationWhatsApp = `Hello {First Name},

Thank you for your interest in consulting with Uchit Vastu India.

Please complete your secure {Qualification Form Title} using the link below:

Online form: {Secure Online Form Link}

You may save your progress and return to the form within 14 days.

For your reference, you may also view the approved PDF version here:

PDF form: {Secure PDF Link}

Please submit your responses through the online form so that they can be connected correctly to your consultation record.

After receiving your completed form, Yogesh will review the information and assign a 30-minute Private Review Call on Zoom. You will be able to confirm the proposed time or request another time.

Regards,
Uchit Vastu India`;

const qualificationEmail = qualificationWhatsApp
  .replace("you may also view the approved PDF version here:", "the approved PDF version is also available here:")
  .replace("Regards,\nUchit Vastu India", "Regards,\nYogesh Hora\nUchit Vastu India");

const assignedWhatsApp = `Hello {First Name},

Thank you for completing your Uchit Vastu qualification form.

Yogesh has reviewed the preliminary information and proposes the following time for your Private Review Call:

Date: {Client Local Date}
Time: {Client Local Time and Time Zone}
{Conditional IST Line}Duration: 30 minutes
Mode: Zoom

Please use the secure link below to either confirm this time or request another time:

{Secure Booking Response Link}

A request for another time can be submitted until 12 hours before the scheduled call. The private Zoom joining details will be provided after you confirm the appointment.

Regards,
Uchit Vastu India`;

const confirmedWhatsApp = `Hello {First Name},

Your Uchit Vastu Private Review Call is confirmed.

Date: {Client Local Date}
Time: {Client Local Time and Time Zone}
{Conditional IST Line}Duration: 30 minutes
Mode: Zoom

Join the meeting using this private link:

{Private Zoom Join Link}

Please keep this joining link private.

If you need another time, use the secure booking link below at least 12 hours before the scheduled call:

{Secure Booking Response Link}

Regards,
Uchit Vastu India`;

const reminder24WhatsApp = `Hello {First Name},

This is a reminder that your Uchit Vastu Private Review Call is scheduled for tomorrow.

Date: {Client Local Date}
Time: {Client Local Time and Time Zone}
{Conditional IST Line}Duration: 30 minutes
Mode: Zoom

Join using your private link:

{Private Zoom Join Link}

If you need another time, please use the secure booking link below before the 12-hour rescheduling window closes:

{Secure Booking Response Link}

Regards,
Uchit Vastu India`;

const reminder2WhatsApp = `Hello {First Name},

This is a reminder that your Uchit Vastu Private Review Call begins in approximately two hours.

Date: {Client Local Date}
Time: {Client Local Time and Time Zone}
{Conditional IST Line}Duration: 30 minutes
Mode: Zoom

Join using your private link:

{Private Zoom Join Link}

The self-service rescheduling window is now closed. If something unavoidable prevents you from attending, please contact us directly.

Regards,
Uchit Vastu India`;

const emailSignature = (body: string) => body.replace("Regards,\nUchit Vastu India", "Regards,\nYogesh Hora\nUchit Vastu India");

export const FOUNDER_COMMUNICATION_TEMPLATES: Record<FounderTemplateKey, FounderTemplate> = {
  VSL: { key: "VSL", version: 1, whatsapp: vslWhatsApp, emailSubject: "Your introduction to the Uchit Vastu process", email: vslEmail },
  BROCHURE: { key: "BROCHURE", version: 1, whatsapp: brochureWhatsApp, emailSubject: "Uchit Vastu — {Service Title}", email: brochureEmail },
  QUALIFICATION: { key: "QUALIFICATION", version: 1, whatsapp: qualificationWhatsApp, emailSubject: "Your Uchit Vastu qualification form and Review Call", email: qualificationEmail },
  ASSIGNED_REVIEW_CALL: { key: "ASSIGNED_REVIEW_CALL", version: 1, whatsapp: assignedWhatsApp, emailSubject: "Please confirm your Uchit Vastu Private Review Call", email: emailSignature(assignedWhatsApp) },
  CONFIRMED_REVIEW_CALL: { key: "CONFIRMED_REVIEW_CALL", version: 1, whatsapp: confirmedWhatsApp, emailSubject: "Confirmed — Your Uchit Vastu Private Review Call", email: emailSignature(confirmedWhatsApp) },
  REMINDER_24H: { key: "REMINDER_24H", version: 1, whatsapp: reminder24WhatsApp, emailSubject: "Reminder — Your Uchit Vastu Review Call is tomorrow", email: emailSignature(reminder24WhatsApp) },
  REMINDER_2H: { key: "REMINDER_2H", version: 1, whatsapp: reminder2WhatsApp, emailSubject: "Reminder — Your Uchit Vastu Review Call begins in two hours", email: emailSignature(reminder2WhatsApp) },
};

export function renderFounderTemplate(key: FounderTemplateKey, values: TemplateValues) {
  const template = FOUNDER_COMMUNICATION_TEMPLATES[key];
  const render = (source: string) => source.replace(/\{([^}]+)\}/g, (whole, name: string) => {
    if (!(name in values)) throw new Error(`Missing approved template value: ${name}.`);
    return values[name];
  });
  return { key, version: template.version, whatsapp: render(template.whatsapp), emailSubject: render(template.emailSubject), email: render(template.email) };
}

export const APPROVED_BROCHURE_TITLES = {
  EXISTING_SPACE: "Existing Space Vastu Audit & Optimisation",
  NEW_CONSTRUCTION: "New Construction Vastu Planning & Design Coordination",
} as const;
