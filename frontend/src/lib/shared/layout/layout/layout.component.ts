import { Component, HostListener, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { BackendRole } from '../../../../app/core/models/auth-role.model';
import {
  ADMIN_PATH,
  APPOINTMENTS_PATH,
  CHANGE_PASSWORD_PATH,
  DASHBOARD_PATH,
  DOCTOR_PORTAL_PATH,
  DOCTORS_PATH,
  EQUEUE_NUMBERS_PATH,
  PROFILE_PATH,
  QUEUES_PATH,
  RECEPTIONIST_PATH,
  ROOMS_PATH,
  SPECIALTIES_PATH,
  USERS_PATH,
  WORK_SCHEDULES_PATH,
  WORK_SCHEDULE_BLOCKS_PATH
} from '../../../../app/shared/constant/navigator-endpoint.constant';
import { TokenService } from '../../../../app/core/services/token.service';

interface MenuItem {
  label: string;
  link: string;
  icon: string;
  short: string;
  exact?: boolean;
  roles?: BackendRole[];
}

interface MenuGroup {
  key: string;
  title: string;
  items: MenuItem[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit {
  private static readonly EXPAND_BREAKPOINT = 1120;
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  isExpanded = true;
  isUserMenuOpen = false;

  get userName(): string {
    return this.resolveUserName();
  }

  get userRole(): string {
    return this.tokenService.getCurrentRole() ?? 'UNKNOWN';
  }

  get userEmail(): string {
    return this.resolveUserEmail();
  }

  get roleKey(): BackendRole | null {
    return this.tokenService.getCurrentRole();
  }

  get portalKey(): 'staff' | 'patient' {
    return this.route.snapshot.data['portal'] === 'patient' ? 'patient' : 'staff';
  }

  get isPatientPortal(): boolean {
    return this.portalKey === 'patient';
  }

  ngOnInit(): void {
    this.applySidebarForViewport();
  }

  primaryMenu: MenuItem[] = [
    { label: 'Admin', short: 'AD', icon: 'admin_panel_settings', link: this.staffLink(ADMIN_PATH), roles: ['ADMIN'] },
    {
      label: 'Reception',
      short: 'RE',
      icon: 'support_agent',
      link: this.staffLink(RECEPTIONIST_PATH),
      roles: ['RECEPTIONIST']
    },
    { label: 'Doctor', short: 'DR', icon: 'stethoscope', link: this.staffLink(DOCTOR_PORTAL_PATH), roles: ['DOCTOR'] },
    { label: 'Dashboard', short: 'DB', icon: 'dashboard', link: this.staffLink(DASHBOARD_PATH), exact: true, roles: ['ADMIN'] },
    {
      label: 'Specialties',
      short: 'SP',
      icon: 'medical_services',
      link: this.staffLink(SPECIALTIES_PATH),
      roles: ['ADMIN', 'RECEPTIONIST']
    },
    { label: 'Users', short: 'US', icon: 'manage_accounts', link: this.staffLink(USERS_PATH), roles: ['ADMIN'] },
    { label: 'Rooms', short: 'RM', icon: 'meeting_room', link: this.staffLink(ROOMS_PATH), roles: ['ADMIN', 'RECEPTIONIST'] },
    { label: 'Doctors', short: 'DC', icon: 'groups', link: this.staffLink(DOCTORS_PATH), roles: ['ADMIN', 'RECEPTIONIST'] },
    {
      label: 'Schedules',
      short: 'WS',
      icon: 'calendar_month',
      link: this.staffLink(WORK_SCHEDULES_PATH),
      roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
    },
    {
      label: 'Blocks',
      short: 'WB',
      icon: 'event_busy',
      link: this.staffLink(WORK_SCHEDULE_BLOCKS_PATH),
      roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
    },
    {
      label: 'Appointments',
      short: 'AP',
      icon: 'event_note',
      link: this.staffLink(APPOINTMENTS_PATH),
      roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
    },
    { label: 'Queues', short: 'QU', icon: 'groups', link: this.staffLink(QUEUES_PATH), roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR'] },
    {
      label: 'E-Queue',
      short: 'EQ',
      icon: 'confirmation_number',
      link: this.staffLink(EQUEUE_NUMBERS_PATH),
      roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
    }
  ];

  menuGroups: MenuGroup[] = [
    // {
    //   key: 'actors',
    //   title: 'Tac nhan',
    //   items: [
    //     { label: 'Trang Admin', short: 'AD', icon: 'admin_panel_settings', link: '/admin', roles: ['ADMIN'] },
    //     {
    //       label: 'Trang Le tan',
    //       short: 'RE',
    //       icon: 'support_agent',
    //       link: '/receptionist',
    //       roles: ['RECEPTIONIST']
    //     },
    //     { label: 'Trang Bac si', short: 'DR', icon: 'stethoscope', link: '/doctor', roles: ['DOCTOR'] },
    //     {
    //       label: 'Trang Benh nhan',
    //       short: 'PT',
    //       icon: 'personal_injury',
    //       link: '/patient',
    //       roles: ['PATIENT']
    //     }
    //   ]
    // },
    {
      key: 'overview',
      title: 'Tổng quan',
      items: [
        {
          label: 'Tổng quan hệ thống',
          short: 'DB',
          icon: 'dashboard',
          link: this.staffLink(DASHBOARD_PATH),
          exact: true,
          roles: ['ADMIN']
        }
      ]
    },
    {
      key: 'catalog',
      title: 'Danh mục',
      items: [
        {
          label: 'Danh mục chuyên khoa',
          short: 'SP',
          icon: 'medical_services',
          link: this.staffLink(SPECIALTIES_PATH),
          roles: ['ADMIN', 'RECEPTIONIST']
        },
        {
          label: 'Quản lý người dùng',
          short: 'US',
          icon: 'manage_accounts',
          link: this.staffLink(USERS_PATH),
          roles: ['ADMIN']
        },
        {
          label: 'Danh mục phòng khám',
          short: 'RM',
          icon: 'meeting_room',
          link: this.staffLink(ROOMS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST']
        },
        {
          label: 'Danh sách bác sĩ',
          short: 'DC',
          icon: 'groups',
          link: this.staffLink(DOCTORS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST']
        }
      ]
    },
    {
      key: 'operations',
      title: 'Hoạt động',
      items: [
        {
          label: 'Lịch làm việc',
          short: 'WS',
          icon: 'calendar_month',
          link: this.staffLink(WORK_SCHEDULES_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        },
        {
          label: 'Lịch nghỉ',
          short: 'WB',
          icon: 'event_busy',
          link: this.staffLink(WORK_SCHEDULE_BLOCKS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        },
        {
          label: 'Lịch hẹn khám',
          short: 'AP',
          icon: 'event_note',
          link: this.staffLink(APPOINTMENTS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        },
        {
          label: 'Hàng đợi',
          short: 'QU',
          icon: 'groups',
          link: this.staffLink(QUEUES_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        },
        {
          label: 'Số thứ tự điện tử',
          short: 'EQ',
          icon: 'confirmation_number',
          link: this.staffLink(EQUEUE_NUMBERS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        }
      ]
    }
  ];

  get visiblePrimaryMenu(): MenuItem[] {
    return this.filterByRole(this.primaryMenu);
  }

  get visibleMenuGroups(): MenuGroup[] {
    return this.menuGroups
      .map((group) => ({ ...group, items: this.filterByRole(group.items) }))
      .filter((group) => group.items.length > 0);
  }

  get userInitials(): string {
    const value = this.userName.trim();
    if (!value) {
      return 'A';
    }

    const words = value.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      return words[0].slice(0, 1).toUpperCase();
    }

    return (words[0].slice(0, 1) + words[1].slice(0, 1)).toUpperCase();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isUserMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.isUserMenuOpen = false;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.applySidebarForViewport();
  }

  toggleSidebar(): void {
    this.isExpanded = !this.isExpanded;
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  onUserMenuClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  goToProfile(): void {
    this.isUserMenuOpen = false;
    void this.router.navigateByUrl(this.portalLink(PROFILE_PATH));
  }

  goToChangePassword(): void {
    this.isUserMenuOpen = false;
    void this.router.navigateByUrl(this.portalLink(CHANGE_PASSWORD_PATH));
  }

  isGroupActive(group: MenuGroup): boolean {
    return group.items.some((item) => this.isItemActive(item));
  }

  isItemActive(item: MenuItem): boolean {
    const currentUrl = this.router.url.split('?')[0] || '/';
    if (item.exact) {
      return currentUrl === item.link;
    }

    return currentUrl === item.link || currentUrl.startsWith(`${item.link}/`);
  }

  onLogout(): void {
    this.isUserMenuOpen = false;
    this.tokenService.clearSession();
    void this.router.navigateByUrl(this.portalKey === 'patient' ? '/' : '/staff/login');
  }

  private portalLink(childPath: string): string {
    return this.portalKey === 'patient' ? this.patientLink(childPath) : this.staffLink(childPath);
  }

  private staffLink(childPath: string): string {
    return `/staff/${childPath}`;
  }

  private patientLink(childPath: string): string {
    return `/patient/${childPath}`;
  }

  private resolveUserName(): string {
    const user = this.tokenService.getCurrentUser();

    const candidates = [
      user?.['fullName'],
      user?.['fullname'],
      user?.['name'],
      user?.['username'],
      user?.['email']
    ];

    const best = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return this.asText(best, 'Administrator');
  }

  private resolveUserEmail(): string {
    const user = this.tokenService.getCurrentUser();
    return this.asText(user?.['email'], 'no-reply@system.local');
  }

  private filterByRole(items: MenuItem[]): MenuItem[] {
    const roleKey = this.roleKey;
    if (!roleKey) {
      return [];
    }

    return items.filter((item) => !item.roles || item.roles.includes(roleKey));
  }

  private asText(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  }

  private applySidebarForViewport(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.isExpanded = window.innerWidth > LayoutComponent.EXPAND_BREAKPOINT;
  }
}
