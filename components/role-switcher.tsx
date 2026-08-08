"use client";

import { useSession } from "@/components/session-provider";
import { UserRole } from "@/lib/domain";

export function RoleSwitcher() {
  const { activeUser, setActiveRole, availableUsers } = useSession();

  return (
    <label className="field" style={{ minWidth: 240 }}>
      <span>Active role</span>
      <select value={activeUser.role} onChange={(event) => setActiveRole(event.target.value as UserRole)}>
        {availableUsers.map((user) => (
          <option key={user.id} value={user.role}>
            {user.role} · {user.fullName}
          </option>
        ))}
      </select>
    </label>
  );
}
