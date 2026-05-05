import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import { PatientPageComponent } from '../../../app/features/patient/pages/patient-page.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-portal-entry',
  standalone: true,
  imports: [PatientPageComponent],
  template: `
    @if (isPatientPortal) {
      <app-patient-page />
    }
  `
})
export class PortalEntryComponent implements OnInit {
  private readonly router = inject(Router);

  readonly isPatientPortal = environment.portalMode === 'patient';

  ngOnInit(): void {
    if (!this.isPatientPortal) {
      void this.router.navigateByUrl('/staff/login', { replaceUrl: true });
    }
  }
}
