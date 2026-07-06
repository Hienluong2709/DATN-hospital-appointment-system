export type PortalMode = 'patient' | 'staff';

export interface PortalEnvironment {
  portalMode: PortalMode;
  patientPortalOrigin: string;
  staffPortalOrigin: string;
  idleTimeoutMs: number;
  disableAuthAutoLogout?: boolean;
  realtimeWsUrl: string;
}
