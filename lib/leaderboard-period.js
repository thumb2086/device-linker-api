const TZ_OFFSET_HOURS = Number(process.env.LEADERBOARD_TZ_OFFSET_HOURS || 8);
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SEASON_WEEKS = Number(process.env.LEADERBOARD_SEASON_WEEKS || 8);
const SEASON_MS = SEASON_WEEKS * WEEK_MS;
const SEASON_EPOCH_MS = Date.UTC(2024, 0, 1) - (TZ_OFFSET_HOURS * 60 * 60 * 1000);

function toTzDate(ts) {
    return new Date(Number(ts || Date.now()) + TZ_OFFSET_HOURS * 60 * 60 * 1000);
}

function fromTzParts(year, monthIndex, day) {
    return Date.UTC(year, monthIndex, day) - (TZ_OFFSET_HOURS * 60 * 60 * 1000);
}

function formatDateId(ts) {
    const d = toTzDate(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}${m}${day}`;
}

export function getWeekPeriod(ts = Date.now()) {
    const d = toTzDate(ts);
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    const startMs = fromTzParts(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff);
    const endMs = startMs + WEEK_MS;
    return {
        id: formatDateId(startMs),
        startMs,
        endMs
    };
}

export function getMonthPeriod(ts = Date.now()) {
    const d = toTzDate(ts);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const startMs = fromTzParts(year, month, 1);
    const endMs = fromTzParts(year, month + 1, 1);
    const id = `${year}-${String(month + 1).padStart(2, "0")}`;
    return { id, startMs, endMs };
}

export function getSeasonPeriod(ts = Date.now()) {
    const week = getWeekPeriod(ts);
    const weekIndex = Math.floor((week.startMs - SEASON_EPOCH_MS) / WEEK_MS);
    const seasonIndex = Math.max(0, Math.floor(weekIndex / SEASON_WEEKS));
    const startMs = SEASON_EPOCH_MS + seasonIndex * SEASON_MS;
    const endMs = startMs + SEASON_MS;
    const id = `S${seasonIndex + 1}-${formatDateId(startMs)}`;
    return { id, startMs, endMs, seasonIndex: seasonIndex + 1 };
}

export function getPeriodSnapshot(ts = Date.now()) {
    const week = getWeekPeriod(ts);
    const month = getMonthPeriod(ts);
    const season = getSeasonPeriod(ts);
    return {
        tzOffsetHours: TZ_OFFSET_HOURS,
        seasonWeeks: SEASON_WEEKS,
        week,
        month,
        season
    };
}

export function formatPeriodIso(period) {
    if (!period) return { startAt: "", endAt: "" };
    return {
        startAt: new Date(period.startMs).toISOString(),
        endAt: new Date(period.endMs).toISOString()
    };
}
