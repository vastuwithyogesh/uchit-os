"use client";

import { useSession } from "@/components/session-provider";
import { UserRole } from "@/lib/domain";

export function RoleSwitcher() {
  const { activeUser, setActiveRole, availableUsers, isLocalDemo } = useSession();

  if (!isLocalDemo) {
    return (
      <div className="role-switcher-panel">
        <span className="role-switcher-label">Active role</span>
        <div className="pill">{activeUser.role}</div>
      </div>
    );
  }

  return (
    <label className="role-switcher-panel">
      <span className="role-switcher-label">Active role</span>
      <select value={activeUser.role} onChange={(event) => setActiveRole(event.target.value as UserRole)}>
        {availableUsers.map((user) => (
          <option key={user.id} value={user.role}>
            {user.role} - {user.fullName}
          </option>
        ))}
      </select>
    </label>
  );
}
