export const BACKEND_ROLES = ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT'] as const;

export type BackendRole = (typeof BACKEND_ROLES)[number];

export function isBackendRole(role: unknown): role is BackendRole {
  return typeof role === 'string' && (BACKEND_ROLES as readonly string[]).includes(role);
}

export function normalizeBackendRole(rawRole: unknown): BackendRole | null {
  if (typeof rawRole !== 'string') {
    return null;
  }

  const normalized = rawRole.trim().toUpperCase().replace(/^ROLE_/, '');
  return isBackendRole(normalized) ? normalized : null;
}
