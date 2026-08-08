"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppUser, UserRole } from "@/lib/domain";
import { users } from "@/lib/seed";

type SessionContextValue = {
  activeUser: AppUser;
  setActiveRole: (role: UserRole) => void;
  setActiveUser: (userId: string) => void;
  availableUsers: AppUser[];
};

const defaultUser = users.find((user) => user.role === "SUPER_ADMIN") ?? users[0];
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activeUser, setActiveUserState] = useState<AppUser>(defaultUser);

  useEffect(() => {
    const storedUserId = window.localStorage.getItem("uchit-vastu-user-id");
    const storedRole = window.localStorage.getItem("uchit-vastu-role") as UserRole | null;
    const nextUser = users.find((user) => user.id === storedUserId) ?? users.find((user) => user.role === storedRole) ?? defaultUser;
    setActiveUserState(nextUser);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      activeUser,
      setActiveRole: (role) => {
        const nextUser = users.find((user) => user.role === role) ?? defaultUser;
        setActiveUserState(nextUser);
        window.localStorage.setItem("uchit-vastu-role", role);
        window.localStorage.setItem("uchit-vastu-user-id", nextUser.id);
      },
      setActiveUser: (userId) => {
        const nextUser = users.find((user) => user.id === userId) ?? defaultUser;
        setActiveUserState(nextUser);
        window.localStorage.setItem("uchit-vastu-role", nextUser.role);
        window.localStorage.setItem("uchit-vastu-user-id", nextUser.id);
      },
      availableUsers: users
    }),
    [activeUser]
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
