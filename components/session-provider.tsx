"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppUser, UserRole, roles } from "@/lib/domain";

type SessionPayload = {
  version: 1;
  ok: true;
  actor: AppUser;
  availableUsers: AppUser[];
  isLocalDemo: boolean;
};

type SessionErrorCode = "UNAUTHENTICATED" | "UNAUTHORIZED" | "SESSION_UNAVAILABLE";

const SESSION_REQUEST_TIMEOUT_MS = 12_000;

class SessionRequestError extends Error {
  readonly code: SessionErrorCode;

  constructor(code: SessionErrorCode, message: string) {
    super(message);
    this.name = "SessionRequestError";
    this.code = code;
  }
}

type SessionContextValue = {
  activeUser: AppUser;
  setActiveRole: (role: UserRole) => void;
  setActiveUser: (userId: string) => void;
  availableUsers: AppUser[];
  isLocalDemo: boolean;
  sessionStatus: "loading" | "ready" | "error";
  sessionError: string | null;
  retrySession: () => void;
};

const failClosedUser: AppUser = {
  id: "session-unavailable",
  fullName: "Session unavailable",
  email: "",
  role: "CLIENT",
  color: "#6d5d4d"
};
const SessionContext = createContext<SessionContextValue | null>(null);

function isAppUser(value: unknown): value is AppUser {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppUser>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.fullName === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.color === "string" &&
    roles.includes(candidate.role as UserRole)
  );
}

async function fetchSession() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/session", { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      let responseCode: unknown;
      try {
        const failure = (await response.json()) as { error?: { code?: unknown } };
        responseCode = failure.error?.code;
      } catch {
        // The UI deliberately ignores server details and presents a safe message.
      }

      if (response.status === 401 || responseCode === "UNAUTHENTICATED") {
        throw new SessionRequestError("UNAUTHENTICATED", "Your sign-in could not be verified. Please sign in again.");
      }
      if (response.status === 403 || responseCode === "UNAUTHORIZED") {
        throw new SessionRequestError("UNAUTHORIZED", "Your account does not have access to this workspace.");
      }
      throw new SessionRequestError("SESSION_UNAVAILABLE", "The secure session service is temporarily unavailable.");
    }
    const payload = (await response.json()) as Partial<SessionPayload>;
    if (payload.version !== 1 || payload.ok !== true || !isAppUser(payload.actor) || !Array.isArray(payload.availableUsers) || typeof payload.isLocalDemo !== "boolean") {
      throw new Error("The server returned an invalid session.");
    }
    if (!payload.availableUsers.every(isAppUser)) {
      throw new Error("The server returned an invalid user list.");
    }
    return payload as SessionPayload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new SessionRequestError("SESSION_UNAVAILABLE", "Session verification timed out. Check your connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeUser, setActiveUserState] = useState<AppUser>(failClosedUser);
  const [availableUsers, setAvailableUsers] = useState<AppUser[]>([]);
  const [isLocalDemo, setIsLocalDemo] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionContextValue["sessionStatus"]>("loading");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionErrorCode, setSessionErrorCode] = useState<SessionErrorCode | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      setSessionStatus("loading");
      setSessionError(null);
      setSessionErrorCode(null);
      try {
        const payload = await fetchSession();
        if (cancelled) {
          return;
        }

        setActiveUserState(payload.actor);
        setAvailableUsers(payload.availableUsers);
        setIsLocalDemo(payload.isLocalDemo);

        if (payload.isLocalDemo) {
          const storedUserId = window.localStorage.getItem("uchit-vastu-user-id");
          const storedRole = window.localStorage.getItem("uchit-vastu-role") as UserRole | null;
          const nextUser =
            payload.availableUsers.find((user) => user.id === storedUserId) ??
            payload.availableUsers.find((user) => user.role === storedRole) ??
            payload.actor;
          setActiveUserState(nextUser);
        }
        setSessionStatus("ready");
      } catch (error) {
        if (!cancelled) {
          setActiveUserState(failClosedUser);
          setAvailableUsers([]);
          setIsLocalDemo(false);
          setSessionStatus("error");
          setSessionError(error instanceof Error ? error.message : "Unable to verify your session.");
          setSessionErrorCode(error instanceof SessionRequestError ? error.code : "SESSION_UNAVAILABLE");
        }
      }
    }

    void hydrateSession();
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const value = useMemo<SessionContextValue>(
    () => ({
      activeUser,
      setActiveRole: (role) => {
        if (!isLocalDemo) {
          return;
        }

        const nextUser = availableUsers.find((user) => user.role === role);
        if (!nextUser) return;
        setActiveUserState(nextUser);
        window.localStorage.setItem("uchit-vastu-role", role);
        window.localStorage.setItem("uchit-vastu-user-id", nextUser.id);
      },
      setActiveUser: (userId) => {
        if (!isLocalDemo) {
          return;
        }

        const nextUser = availableUsers.find((user) => user.id === userId);
        if (!nextUser) return;
        setActiveUserState(nextUser);
        window.localStorage.setItem("uchit-vastu-role", nextUser.role);
        window.localStorage.setItem("uchit-vastu-user-id", nextUser.id);
      },
      availableUsers,
      isLocalDemo,
      sessionStatus,
      sessionError,
      retrySession: () => setRetryCount((count) => count + 1)
    }),
    [activeUser, availableUsers, isLocalDemo, sessionError, sessionStatus]
  );

  return (
    <SessionContext.Provider value={value}>
      {sessionStatus === "ready" ? children : (
        <main className="session-gate" aria-busy={sessionStatus === "loading"}>
          <section className="card" role={sessionStatus === "error" ? "alert" : "status"}>
            <div className="eyebrow">Secure workspace</div>
            <h1>{sessionStatus === "loading" ? "Verifying your session…" : "We could not verify your session"}</h1>
            <p className="subtle">
              {sessionStatus === "loading"
                ? "The workspace will open after your identity and role are confirmed."
                : `${sessionError ?? "The session service is unavailable."} No workspace data or privileged navigation has been shown.`}
            </p>
            {sessionStatus === "error" ? (
              <div className="hero-actions">
                {sessionErrorCode === "UNAUTHENTICATED" ? (
                  <a className="button" href="/signin-with-chatgpt?return_to=/">Sign in with ChatGPT</a>
                ) : null}
                <button type="button" className={sessionErrorCode === "UNAUTHENTICATED" ? "button-secondary" : "button"} onClick={() => setRetryCount((count) => count + 1)}>
                  Try again
                </button>
              </div>
            ) : null}
          </section>
        </main>
      )}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
