import type { PortalEnvironment } from './environment.model';

export const environment: PortalEnvironment = {
  portalMode: 'staff',
  patientPortalOrigin: 'http://localhost:4200',
  staffPortalOrigin: 'http://localhost:4201',
  idleTimeoutMs: 300000
};
