# Uchit OS Security Policy

- Authentication is not authorization.
- Frontend hiding is not a security boundary.
- Organisation context is mandatory for organisation-owned data.
- Case/Floor access must be checked server-side.
- Public grants/tokens must be narrow, expiring/revocable where applicable.
- Secrets remain server-side and outside source control.
- Significant security-relevant actions are auditable.
- Sensitive actions fail closed.
- Least privilege is the default.
- Production data is not test data.
- AI permissions are explicit; agents receive only the capabilities required for the task.
