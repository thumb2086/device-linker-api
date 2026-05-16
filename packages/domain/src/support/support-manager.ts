// packages/domain/src/support/support-manager.ts
// 從 main/lib/support-center.js 移植

import { randomUUID } from "crypto";

export interface Announcement {
  id: string;
  announcementId: string;
  title: string;
  content: string;
  isPinned: boolean;
  isActive: boolean;
  publishedBy?: string;
  updatedBy?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket {
  id: string;
  reportId: string;
  address?: string;
  displayName?: string;
  category: string;
  title: string;
  message: string;
  contact?: string;
  pageUrl?: string;
  userAgent?: string;
  platform?: string;
  clientType?: string;
  deviceId?: string;
  appVersion?: string;
  mode?: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  adminUpdate?: string;
  createdAt: string;
  updatedAt: string;
}

export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
const ALLOWED_ISSUE_STATUSES: IssueStatus[] = ["open", "in_progress", "resolved", "closed"];
const ALLOWED_TICKET_CATEGORIES = ["bug", "payment", "account", "game", "feature", "other"];
const MAX_TITLE_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTACT_LENGTH = 100;

export interface SupportTicketInput {
  title: string;
  category: string;
  message: string;
  contact?: string;
  pageUrl?: string;
  userAgent?: string;
}

export class SupportManager {
  // ─── Tickets ────────────────────────────────────────────────────────────────

  sanitizeIssueInput(input: Partial<SupportTicketInput>): SupportTicketInput {
    return {
      title: this._trim(input.title, MAX_TITLE_LENGTH),
      category: this._normalizeCategory(input.category),
      message: this._trim(input.message, MAX_MESSAGE_LENGTH),
      contact: this._trim(input.contact, MAX_CONTACT_LENGTH),
      pageUrl: this._trim(input.pageUrl, 512),
      userAgent: this._trim(input.userAgent, 256),
    };
  }

  validateIssueInput(input: SupportTicketInput): string | null {
    if (!input.title || input.title.length < 3) return "標題至少 3 個字";
    if (!input.message || input.message.length < 10) return "描述至少 10 個字";
    if (!ALLOWED_TICKET_CATEGORIES.includes(input.category)) return "無效的分類";
    return null;
  }

  createTicket(
    input: SupportTicketInput & { address?: string; displayName?: string; platform?: string; clientType?: string; deviceId?: string; appVersion?: string; mode?: string }
  ): SupportTicket {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      reportId: `report_${Date.now()}_${randomUUID().slice(0, 8)}`,
      address: input.address,
      displayName: input.displayName,
      category: input.category,
      title: input.title,
      message: input.message,
      contact: input.contact,
      pageUrl: input.pageUrl,
      userAgent: input.userAgent,
      platform: input.platform,
      clientType: input.clientType,
      deviceId: input.deviceId,
      appVersion: input.appVersion,
      mode: input.mode,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
  }

  updateTicket(ticket: SupportTicket, updates: { status?: string; adminUpdate?: string }): SupportTicket {
    return {
      ...ticket,
      status: this._normalizeIssueStatus(updates.status, ticket.status) as IssueStatus,
      adminUpdate: this._trim(updates.adminUpdate, 4000) || ticket.adminUpdate,
      updatedAt: new Date().toISOString(),
    };
  }

  // ─── Announcements ───────────────────────────────────────────────────────────

  sanitizeAnnouncementInput(input: any): { title: string; content: string; isPinned: boolean; isActive: boolean } {
    return {
      title: this._trim(input.title, 200),
      content: this._trim(input.content, 10000),
      isPinned: this._toBoolean(input.isPinned ?? input.pinned),
      isActive: this._toBoolean(input.isActive ?? true),
    };
  }

  validateAnnouncementInput(input: { title: string; content: string }): string | null {
    if (!input.title || input.title.length < 2) return "標題至少 2 個字";
    if (!input.content || input.content.length < 5) return "內容至少 5 個字";
    return null;
  }

  createAnnouncement(
    input: { title: string; content: string; isPinned?: boolean; isActive?: boolean; publishedBy?: string }
  ): Announcement {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      announcementId: `ann_${Date.now()}_${randomUUID().slice(0, 8)}`,
      title: input.title,
      content: input.content,
      isPinned: input.isPinned ?? false,
      isActive: input.isActive ?? true,
      publishedBy: input.publishedBy,
      updatedBy: input.publishedBy,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  updateAnnouncement(announcement: Announcement, updates: { title?: string; content?: string; isPinned?: boolean; isActive?: boolean; updatedBy?: string }): Announcement {
    return {
      ...announcement,
      title: updates.title ?? announcement.title,
      content: updates.content ?? announcement.content,
      isPinned: updates.isPinned ?? announcement.isPinned,
      isActive: updates.isActive ?? announcement.isActive,
      updatedBy: updates.updatedBy,
      updatedAt: new Date().toISOString(),
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _trim(value: unknown, maxLen: number): string {
    if (!value || typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLen);
  }

  private _normalizeCategory(category: unknown): string {
    const normalized = String(category || "").trim().toLowerCase();
    return ALLOWED_TICKET_CATEGORIES.includes(normalized) ? normalized : "other";
  }

  private _normalizeIssueStatus(status: unknown, fallback: string): string {
    const normalized = String(status || "").trim().toLowerCase();
    return ALLOWED_ISSUE_STATUSES.includes(normalized as IssueStatus) ? normalized : fallback;
  }

  private _toBoolean(value: unknown): boolean {
    return value === true || String(value || "").trim().toLowerCase() === "true";
  }
}
