"use client";

import { useEffect, useState } from "react";

type BookingPayload = {
  booking: { renderedClientTime: string; renderedIstTime?: string };
  persistenceRevision: number | null;
};

export function BookingResponseClient({ token }: { token: string }) {
  const [data, setData] = useState<BookingPayload>();
  const [message, setMessage] = useState("Loading appointment…");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const response = await fetch(`/api/public/booking/${encodeURIComponent(token)}`, { cache: "no-store", referrerPolicy: "no-referrer" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "This booking response is unavailable.");
      setData(result);
      setMessage("Choose one response. No availability calendar is exposed.");
    } catch (error) {
      setData(undefined);
      setMessage(error instanceof Error ? error.message : "This booking response is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function respond(action: "CONFIRM_THIS_TIME" | "REQUEST_ANOTHER_TIME") {
    if (!data || busy || completed) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/public/booking/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ action, expectedRevision: data.persistenceRevision })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your response was not recorded. Reload and try again.");
      setCompleted(true);
      setMessage(action === "CONFIRM_THIS_TIME"
        ? "Time confirmed. Private Zoom details follow only after secure meeting setup succeeds."
        : "Another time requested. Yogesh will assign a new slot.");
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "Your response was not recorded."} Your selection remains unchanged; reload and try again.`);
    } finally {
      setBusy(false);
    }
  }

  return <main className="public-token-page"><section className="booking-response" aria-busy={busy}>
    <span className="eyebrow">Private Review Call</span><h1>Review the proposed time</h1>
    {data ? <><p><strong>{data.booking.renderedClientTime}</strong></p>{data.booking.renderedIstTime ? <p>India time: {data.booking.renderedIstTime}</p> : null}<p>30 minutes · Zoom</p>
      {!completed ? <div><button type="button" className="button" disabled={busy} onClick={() => void respond("CONFIRM_THIS_TIME")}>{busy ? "Recording…" : "Confirm this time"}</button><button type="button" className="button-secondary" disabled={busy} onClick={() => void respond("REQUEST_ANOTHER_TIME")}>Request another time</button></div> : null}</> : null}
    <p role="status" aria-live="polite">{message}</p>
    {!data && !busy ? <button type="button" className="button-secondary" onClick={() => void load()}>Retry securely</button> : null}
  </section></main>;
}
