import { Component, HostListener, OnInit, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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
import { PortalTopbarComponent } from '../../../../app/shared/components/portal-topbar/portal-topbar.component';
import { TokenService } from '../../../../app/core/services/token.service';

interface MenuItem {
  label: string;
  link: string;
  icon: string;
  exact?: boolean;
  roles?: BackendRole[];
}

interface MenuGroup {
  key: string;
  title: string;
  icon: string;
  items: MenuItem[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PortalTopbarComponent],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit {
  private static readonly EXPAND_BREAKPOINT = 1120;
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  isExpanded = true;
  breadcrumbLabel = 'Overview';
  menuSearchTerm = '';
  expandedGroupKeys = new Set<string>(['catalog', 'schedules', 'operations', 'system']);

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
    this.updateBreadcrumbLabel(this.router.url);
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateBreadcrumbLabel(event.urlAfterRedirects);
      }
    });
  }

  menuGroups: MenuGroup[] = [
    {
      key: 'catalog',
      title: 'Quản lý danh mục',
      icon: 'inventory_2',
      items: [
        {
          label: 'Danh mục chuyên khoa',
          icon: 'medical_services',
          link: this.staffLink(SPECIALTIES_PATH),
          roles: ['ADMIN', 'RECEPTIONIST']
        },
        {
          label: 'Danh mục phòng khám',
          icon: 'meeting_room',
          link: this.staffLink(ROOMS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST']
        },
        {
          label: 'Danh sách bác sĩ',
          icon: 'groups',
          link: this.staffLink(DOCTORS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST']
        }
      ]
    },
    {
      key: 'schedules',
      title: 'Quản lý lịch khám',
      icon: 'calendar_month',
      items: [
        {
          label: 'Lịch làm việc',
          icon: 'calendar_month',
          link: this.staffLink(WORK_SCHEDULES_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        },
        {
          label: 'Lịch nghỉ',
          icon: 'event_busy',
          link: this.staffLink(WORK_SCHEDULE_BLOCKS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        },
        {
          label: 'Lịch hẹn khám',
          icon: 'event_note',
          link: this.staffLink(APPOINTMENTS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        }
      ]
    },
    {
      key: 'operations',
      title: 'Vận hành khám bệnh',
      icon: 'local_hospital',
      items: [
        {
          label: 'Hàng đợi',
          icon: 'groups',
          link: this.staffLink(QUEUES_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        },
        {
          label: 'Số thứ tự điện tử',
          icon: 'confirmation_number',
          link: this.staffLink(EQUEUE_NUMBERS_PATH),
          roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR']
        }
      ]
    },
    {
      key: 'system',
      title: 'Hệ thống',
      icon: 'settings',
      items: [
        {
          label: 'Quản lý người dùng',
          icon: 'manage_accounts',
          link: this.staffLink(USERS_PATH),
          roles: ['ADMIN']
        }
      ]
    }
  ];

  get visibleMenuGroups(): MenuGroup[] {
    const keyword = this.menuSearchTerm.trim().toLowerCase();

    return this.menuGroups
      .map((group) => {
        const allowedItems = this.filterByRole(group.items);
        if (!keyword) {
          return { ...group, items: allowedItems };
        }

        const titleMatches = group.title.toLowerCase().includes(keyword);
        const matchingItems = allowedItems.filter((item) =>
          item.label.toLowerCase().includes(keyword),
        );

        return {
          ...group,
          items: titleMatches ? allowedItems : matchingItems,
        };
      })
      .filter((group) => group.items.length > 0);
  }

  get homeMenuItem(): MenuItem | null {
    switch (this.roleKey) {
      case 'ADMIN':
        return {
          label: 'Trang chủ',
          icon: 'home',
          link: this.staffLink(DASHBOARD_PATH),
          exact: true,
          roles: ['ADMIN'],
        };
      case 'RECEPTIONIST':
        return {
          label: 'Trang chủ',
          icon: 'home',
          link: this.staffLink(RECEPTIONIST_PATH),
          exact: true,
          roles: ['RECEPTIONIST'],
        };
      case 'DOCTOR':
        return {
          label: 'Trang chủ',
          icon: 'home',
          link: this.staffLink(DOCTOR_PORTAL_PATH),
          exact: true,
          roles: ['DOCTOR'],
        };
      default:
        return null;
    }
  }

  get collapsedMenuItems(): MenuItem[] {
    const rootItems = this.homeMenuItem ? [this.homeMenuItem] : [];
    const groupItems = this.visibleMenuGroups.flatMap((group) => group.items);
    const deduped = new Map<string, MenuItem>();

    [...rootItems, ...groupItems].forEach((item) => {
      deduped.set(item.link, item);
    });

    return Array.from(deduped.values());
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

  @HostListener('window:resize')
  onWindowResize(): void {
    this.applySidebarForViewport();
  }

  toggleSidebar(): void {
    this.isExpanded = !this.isExpanded;
  }

  toggleGroup(groupKey: string): void {
    if (this.menuSearchTerm.trim()) {
      return;
    }

    if (this.expandedGroupKeys.has(groupKey)) {
      this.expandedGroupKeys.delete(groupKey);
      return;
    }

    this.expandedGroupKeys.add(groupKey);
  }

  isGroupExpanded(groupKey: string): boolean {
    return this.menuSearchTerm.trim().length > 0 || this.expandedGroupKeys.has(groupKey);
  }

  onMenuSearchChange(value: string): void {
    this.menuSearchTerm = value;
  }

  goToProfile(): void {
    void this.router.navigateByUrl(this.portalLink(PROFILE_PATH));
  }

  goToChangePassword(): void {
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

  private updateBreadcrumbLabel(rawUrl: string): void {
    const path = (rawUrl || '').split('?')[0] || '/';
    const segments = path.split('/').filter(Boolean);

    if (!segments.length) {
      this.breadcrumbLabel = 'Overview';
      return;
    }

    const [, feature = ''] = segments;
    const featureMap: Record<string, string> = {
      [DASHBOARD_PATH]: 'Overview',
      [APPOINTMENTS_PATH]: 'Lịch khám',
      [PROFILE_PATH]: 'Hồ sơ của tôi',
      [CHANGE_PASSWORD_PATH]: 'Đổi mật khẩu',
      [SPECIALTIES_PATH]: 'Chuyên khoa',
      [ROOMS_PATH]: 'Phòng khám',
      [DOCTORS_PATH]: 'Bác sĩ',
      [USERS_PATH]: 'Người dùng',
      [WORK_SCHEDULES_PATH]: 'Lịch làm việc',
      [WORK_SCHEDULE_BLOCKS_PATH]: 'Lịch nghỉ',
      [QUEUES_PATH]: 'Hàng đợi',
      [EQUEUE_NUMBERS_PATH]: 'Số thứ tự điện tử',
      [ADMIN_PATH]: 'Quản trị',
      [RECEPTIONIST_PATH]: 'Lễ tân',
      [DOCTOR_PORTAL_PATH]: 'Bác sĩ',
    };

    this.breadcrumbLabel = featureMap[feature] ?? 'Overview';
  }

  private applySidebarForViewport(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.isExpanded = window.innerWidth > LayoutComponent.EXPAND_BREAKPOINT;
  }
}
