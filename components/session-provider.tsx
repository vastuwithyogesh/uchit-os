"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppUser, UserRole } from "@/lib/domain";
import { users } from "@/lib/seed";

type SessionPayload = {
  ok: true;
  actor: AppUser;
  availableUsers: AppUser[];
  isLocalDemo: boolean;
};

type SessionContextValue = {
  activeUser: AppUser;
  setActiveRole: (role: UserRole) => void;
  setActiveUser: (userId: string) => void;
  availableUsers: AppUser[];
  isLocalDemo: boolean;
};

const defaultUser = users.find((user) => user.role === "SUPER_ADMIN") ?? users[0];
const SessionContext = createContext<SessionContextValue | null>(null);

async function fetchSession() {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load session");
  }
  return (await response.json()) as SessionPayload;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeUser, setActiveUserState] = useState<AppUser>(defaultUser);
  const [availableUsers, setAvailableUsers] = useState<AppUser[]>(users);
  const [isLocalDemo, setIsLocalDemo] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
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
      } catch {
        if (!cancelled) {
          setActiveUserState(defaultUser);
          setAvailableUsers(users);
          setIsLocalDemo(true);
        }
      }
    }

    void hydrateSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      activeUser,
      setActiveRole: (role) => {
        if (!isLocalDemo) {
          return;
        }

        const nextUser = availableUsers.find((user) => user.role === role) ?? defaultUser;
        setActiveUserState(nextUser);
        window.localStorage.setItem("uchit-vastu-role", role);
        window.localStorage.setItem("uchit-vastu-user-id", nextUser.id);
      },
      setActiveUser: (userId) => {
        if (!isLocalDemo) {
          return;
        }

        const nextUser = availableUsers.find((user) => user.id === userId) ?? defaultUser;
        setActiveUserState(nextUser);
        window.localStorage.setItem("uchit-vastu-role", nextUser.role);
        window.localStorage.setItem("uchit-vastu-user-id", nextUser.id);
      },
      availableUsers,
      isLocalDemo
    }),
    [activeUser, availableUsers, isLocalDemo]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
