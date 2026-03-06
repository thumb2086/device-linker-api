import { kv } from "@vercel/kv";

const DISPLAY_NAME_PREFIX = "display_name:";
const DISPLAY_NAME_REGEX = /^[\p{L}\p{N}_\-\s]{2,24}$/u;

function profileKey(address) {
    return `${DISPLAY_NAME_PREFIX}${String(address || "").trim().toLowerCase()}`;
}

export function normalizeDisplayName(rawValue) {
    const value = String(rawValue || "").trim();
    if (!DISPLAY_NAME_REGEX.test(value)) {
        throw new Error("名稱格式錯誤，需 2-24 字，可用中英數、空格、底線、連字號");
    }
    return value;
}

export async function getDisplayName(address) {
    if (!address) return "";
    const value = await kv.get(profileKey(address));
    return typeof value === "string" ? value.trim() : "";
}

export async function setDisplayName(address, rawValue) {
    const displayName = normalizeDisplayName(rawValue);
    await kv.set(profileKey(address), displayName);
    return displayName;
}

export async function ensureDisplayName(address, fallbackValue) {
    const existing = await getDisplayName(address);
    if (existing) return existing;
    if (!fallbackValue) return "";
    return setDisplayName(address, fallbackValue);
}

export async function buildDisplayNameMap(addresses) {
    const result = new Map();
    const uniqueAddresses = Array.from(new Set((addresses || []).map((address) => String(address || "").trim().toLowerCase()).filter(Boolean)));
    await Promise.all(uniqueAddresses.map(async (address) => {
        const displayName = await getDisplayName(address);
        if (displayName) {
            result.set(address, displayName);
        }
    }));
    return result;
}
