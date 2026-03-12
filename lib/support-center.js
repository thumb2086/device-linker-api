import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";

const ISSUE_REPORT_PREFIX = "issue_report:";
const ANNOUNCEMENT_PREFIX = "announcement:";
const DEFAULT_REPORT_LIMIT = 50; // Reduced for pagination
const DEFAULT_ANNOUNCEMENT_LIMIT = 20;
const MAX_REPORT_LIMIT = 100; // Max per page
const MAX_ANNOUNCEMENT_LIMIT = 50;
const ISSUE_STATUSES = new Set(["open", "in_progress", "resolved"]);

function asObject(value) {
    return value && typeof value === "object" ? value : null;
}

function parseDate(value) {
    const ts = Date.parse(String(value || ""));
    return Number.isFinite(ts) ? ts : 0;
}

function trimText(value, maxLength = 256) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function trimMultilineText(value, maxLength = 4000) {
    if (typeof value !== "string") return "";
    return value
        .replace(/\r\n/g, "\n")
        .replace(/\u0000/g, "")
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim()
        .slice(0, maxLength);
}

function toBoolean(value) {
    if (value === true) return true;
    return String(value || "").trim().toLowerCase() === "true";
}

function normalizeLimit(value, fallback, maxValue) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(maxValue, Math.floor(parsed));
}

function normalizeIssueStatus(value, fallback = "open") {
    const normalized = trimText(String(value || "").toLowerCase(), 32);
    return ISSUE_STATUSES.has(normalized) ? normalized : fallback;
}

function issueReportKey(reportId) {
    return `${ISSUE_REPORT_PREFIX}${reportId}`;
}

function announcementKey(announcementId) {
    return `${ANNOUNCEMENT_PREFIX}${announcementId}`;
}

function normalizeIssueRecord(record) {
    const raw = asObject(record) || {};
    return {
        id: trimText(raw.id, 128),
        address: trimText(raw.address, 128).toLowerCase(),
        displayName: trimText(raw.displayName, 64),
        title: trimText(raw.title, 120),
        category: trimText(raw.category, 40),
        message: trimMultilineText(raw.message, 4000),
        contact: trimText(raw.contact, 120),
        pageUrl: trimText(raw.pageUrl, 512),
        userAgent: trimText(raw.userAgent, 256),
        platform: trimText(raw.platform, 32),
        clientType: trimText(raw.clientType, 32),
        deviceId: trimText(raw.deviceId, 128),
        appVersion: trimText(raw.appVersion, 64),
        mode: trimText(raw.mode, 24) || "live",
        status: normalizeIssueStatus(raw.status),
        adminUpdate: trimMultilineText(raw.adminUpdate, 4000),
        createdAt: trimText(raw.createdAt, 64),
        updatedAt: trimText(raw.updatedAt, 64)
    };
}

function normalizeAnnouncementRecord(record) {
    const raw = asObject(record) || {};
    return {
        id: trimText(raw.id, 128),
        title: trimText(raw.title, 120),
        content: trimMultilineText(raw.content, 4000),
        isActive: raw.isActive !== false && !String(raw.isActive || "").trim().toLowerCase().includes("false"),
        pinned: toBoolean(raw.pinned),
        createdAt: trimText(raw.createdAt, 64),
        updatedAt: trimText(raw.updatedAt, 64),
        publishedBy: trimText(raw.publishedBy, 128),
        updatedBy: trimText(raw.updatedBy, 128)
    };
}

// Re-usable scan function for announcements, not paginated yet but good practice
async function scanAllRecords(prefix, normalizer) {
    const keys = [];
    for await (const key of kv.scanIterator({ match: `${prefix}*`, count: 1000 })) {
        keys.push(key);
    }

    const items = [];
    const chunkSize = 100;
    for (let index = 0; index < keys.length; index += chunkSize) {
        const chunkKeys = keys.slice(index, index + chunkSize);
        const values = await Promise.all(chunkKeys.map((key) => kv.get(key)));
        values.forEach((value) => {
            const normalized = normalizer(value);
            if (normalized.id) {
                items.push(normalized);
            }
        });
    }
    return items;
}

export function sanitizeIssueInput(input) {
    return {
        title: trimText(input && input.title, 120),
        category: trimText(input && input.category, 40) || "general",
        message: trimMultilineText(input && input.message, 4000),
        contact: trimText(input && input.contact, 120),
        pageUrl: trimText(input && input.pageUrl, 512),
        userAgent: trimText(input && input.userAgent, 256)
    };
}

export function sanitizeAnnouncementInput(input) {
    return {
        title: trimText(input && input.title, 120),
        content: trimMultilineText(input && input.content, 4000),
        pinned: toBoolean(input && input.pinned),
        isActive: input && input.isActive !== undefined ? toBoolean(input.isActive) : true
    };
}

export function validateIssueInput(input) {
    if (!input.title || input.title.length < 3) {
        return "Issue title must be at least 3 characters";
    }
    if (!input.message || input.message.length < 10) {
        return "Issue description must be at least 10 characters";
    }
    return "";
}

export function validateAnnouncementInput(input) {
    if (!input.title || input.title.length < 3) {
        return "Announcement title must be at least 3 characters";
    }
    if (!input.content || input.content.length < 10) {
        return "Announcement content must be at least 10 characters";
    }
    return "";
}

export async function createIssueReport(input) {
    const nowIso = new Date().toISOString();
    const reportId = `report_${randomUUID()}`;
    const record = normalizeIssueRecord({
        id: reportId,
        ...input,
        status: "open",
        adminUpdate: "",
        createdAt: nowIso,
        updatedAt: nowIso
    });
    await kv.set(issueReportKey(reportId), record);
    return record;
}

export async function getIssueReport(reportId) {
    const record = await kv.get(issueReportKey(trimText(reportId, 128)));
    const normalized = normalizeIssueRecord(record);
    return normalized.id ? normalized : null;
}

export async function saveIssueReport(record) {
    const normalized = normalizeIssueRecord(record);
    if (!normalized.id) throw new Error("Issue report id is required");
    await kv.set(issueReportKey(normalized.id), normalized);
    return normalized;
}

export async function listIssueReports(options = {}) {
    const limit = normalizeLimit(options.limit, DEFAULT_REPORT_LIMIT, MAX_REPORT_LIMIT);
    const statusFilter = options.status ? normalizeIssueStatus(options.status, "") : "";
    const keyword = trimText(options.keyword, 120).toLowerCase();
    const addressFilter = trimText(options.address, 128).toLowerCase();

    // In an ideal world, we would build a secondary index for filtering.
    // Since we can't with Vercel KV, we have to scan and filter in memory.
    // The pagination logic here helps to at least limit the amount of data
    // processed per API call, preventing timeouts for very large datasets.
    const allRecords = await scanAllRecords(ISSUE_REPORT_PREFIX, normalizeIssueRecord);

    const filtered = allRecords.filter((item) => {
        if (statusFilter && item.status !== statusFilter) return false;
        if (addressFilter && item.address !== addressFilter) return false;
        if (!keyword) return true;
        return [item.title, item.message, item.displayName, item.address, item.category, item.contact, item.adminUpdate]
            .join("\n")
            .toLowerCase()
            .includes(keyword);
    });

    filtered.sort((left, right) => {
        const rightTs = parseDate(right.updatedAt || right.createdAt);
        const leftTs = parseDate(left.updatedAt || left.createdAt);
        if (rightTs !== leftTs) return rightTs - leftTs;
        return String(left.id).localeCompare(String(right.id));
    });

    const cursor = Number(options.cursor) || 0;
    const start = Math.max(0, cursor);
    const end = start + limit;
    const reports = filtered.slice(start, end);
    const nextCursor = end < filtered.length ? end : null;

    return {
        total: filtered.length,
        reports: reports,
        nextCursor: nextCursor,
    };
}

export async function createAnnouncement(input) {
    const nowIso = new Date().toISOString();
    const announcementId = `announcement_${randomUUID()}`;
    const record = normalizeAnnouncementRecord({
        id: announcementId,
        ...input,
        createdAt: nowIso,
        updatedAt: nowIso
    });
    await kv.set(announcementKey(announcementId), record);
    return record;
}

export async function getAnnouncement(announcementId) {
    const record = await kv.get(announcementKey(trimText(announcementId, 128)));
    const normalized = normalizeAnnouncementRecord(record);
    return normalized.id ? normalized : null;
}

export async function saveAnnouncement(record) {
    const normalized = normalizeAnnouncementRecord(record);
    if (!normalized.id) throw new Error("Announcement id is required");
    await kv.set(announcementKey(normalized.id), normalized);
    return normalized;
}

export async function deleteAnnouncement(announcementId) {
    const id = trimText(announcementId, 128);
    if (!id) throw new Error("Announcement id is required");
    await kv.del(announcementKey(id));
    return { id };
}

export async function listAnnouncements(options = {}) {
    const limit = normalizeLimit(options.limit, DEFAULT_ANNOUNCEMENT_LIMIT, MAX_ANNOUNCEMENT_LIMIT);
    const activeOnly = options.activeOnly === true;

    const records = await scanAllRecords(ANNOUNCEMENT_PREFIX, normalizeAnnouncementRecord);
    const filtered = records.filter((item) => !activeOnly || item.isActive);

    filtered.sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        const rightTs = parseDate(right.updatedAt || right.createdAt);
        const leftTs = parseDate(left.updatedAt || left.createdAt);
        if (rightTs !== leftTs) return rightTs - leftTs;
        return String(left.id).localeCompare(String(right.id));
    });

    return {
        total: filtered.length,
        announcements: filtered.slice(0, limit)
    };
}

export { normalizeIssueStatus, toBoolean };
