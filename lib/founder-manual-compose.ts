/**
 * Client-side compose URLs only.  These helpers never send email, invoke a
 * provider API, or retain recipients, rendered bodies, or secure links.
 */
export function normaliseManualEmail(value?: string) {
  const email = (value ?? "").trim();
  // Deliberately small, conservative validation: reject line breaks and URI
  // delimiters so an imported contact cannot add recipients or headers.
  if (!/^[^\s@,;?&#]+@[^\s@,;?&#]+\.[^\s@,;?&#]+$/u.test(email)) return "";
  return email;
}

export function buildMailtoComposeUrl(input: { email?: string; subject: string; body: string }) {
  const recipient = normaliseManualEmail(input.email);
  if (!recipient) return null;
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(input.body)}`;
}

export function buildGmailComposeUrl(input: { email?: string; subject: string; body: string }) {
  const recipient = normaliseManualEmail(input.email);
  if (!recipient) return null;
  const query = new URLSearchParams({ view: "cm", fs: "1", to: recipient, su: input.subject, body: input.body });
  return `https://mail.google.com/mail/?${query.toString()}`;
}
