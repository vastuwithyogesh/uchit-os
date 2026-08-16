"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type NoticeKind = "success" | "error" | "warning" | "info";
type Notice = { id: string; kind: NoticeKind; message: string };

type ActionFeedbackValue = {
  notify: (kind: NoticeKind, message: string) => void;
};

const ActionFeedbackContext = createContext<ActionFeedbackValue | null>(null);

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const notify = useCallback((kind: NoticeKind, message: string) => {
    setNotices((current) => {
      if (current.some((notice) => notice.kind === kind && notice.message === message)) return current;
      const id = crypto.randomUUID();
      window.setTimeout(() => setNotices((latest) => latest.filter((notice) => notice.id !== id)), kind === "error" ? 7000 : 4500);
      return [...current.slice(-2), { id, kind, message }];
    });
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return <ActionFeedbackContext.Provider value={value}>
    {children}
    <div className="action-feedback-region" aria-live="polite" aria-atomic="true">
      {notices.map((notice) => <div key={notice.id} className={`action-feedback-notice action-feedback-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
        <span>{notice.message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}>Dismiss</button>
      </div>)}
    </div>
  </ActionFeedbackContext.Provider>;
}

export function useActionFeedback() {
  const value = useContext(ActionFeedbackContext);
  if (!value) throw new Error("useActionFeedback must be used inside ActionFeedbackProvider");
  return value;
}
