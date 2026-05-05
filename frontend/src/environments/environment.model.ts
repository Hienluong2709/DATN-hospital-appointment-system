export type PortalMode = 'patient' | 'staff';

export interface PortalEnvironment {
  portalMode: PortalMode;
  patientPortalOrigin: string;
  staffPortalOrigin: string;
}
