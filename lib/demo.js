import { kv } from "@vercel/kv";

const DEMO_INITIAL_BALANCE = 100;

function keyForBalance(address) {
    return `demo_balance:${String(address || "").toLowerCase()}`;
}

export function isDemoSession(sessionData) {
    return !!sessionData && sessionData.mode === "demo";
}

export async function getDemoBalance(address) {
    const key = keyForBalance(address);
    const current = await kv.get(key);
    if (current === null || current === undefined) {
        await kv.set(key, DEMO_INITIAL_BALANCE);
        return DEMO_INITIAL_BALANCE;
    }
    return Number(current);
}

export async function setDemoBalance(address, balance) {
    const key = keyForBalance(address);
    await kv.set(key, Number(balance));
}

export async function ensureDemoBalance(address, requiredAmount) {
    const balance = await getDemoBalance(address);
    return balance >= Number(requiredAmount);
}

export async function applyDemoBalanceDelta(address, delta) {
    const current = await getDemoBalance(address);
    const next = current + Number(delta);
    if (next < 0) {
        throw new Error("insufficient demo balance");
    }
    await setDemoBalance(address, next);
    return next;
}
