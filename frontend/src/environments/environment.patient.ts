import type { PortalEnvironment } from './environment.model';

export const environment: PortalEnvironment = {
  portalMode: 'patient',
  patientPortalOrigin: 'http://localhost:4200',
  staffPortalOrigin: 'http://localhost:4201',
  idleTimeoutMs: 300000,
  realtimeWsUrl: 'ws://45.126.126.226:5001/ws'
};
