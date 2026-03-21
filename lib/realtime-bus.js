import { createClient } from "redis";

const REALTIME_CHANNEL_PREFIX = "chat:room:";

let publisherClient = null;
let publisherReady = null;

function getRealtimeRedisUrl() {
    return String(process.env.REALTIME_REDIS_URL || process.env.REDIS_URL || "").trim();
}

export function getRealtimeChannel(roomId) {
    return `${REALTIME_CHANNEL_PREFIX}${String(roomId || "public").trim().toLowerCase() || "public"}`;
}

export function hasRealtimeBusConfig() {
    return !!getRealtimeRedisUrl();
}

async function getPublisherClient() {
    if (publisherClient && publisherClient.isOpen) return publisherClient;
    if (publisherReady) return publisherReady;

    const redisUrl = getRealtimeRedisUrl();
    if (!redisUrl) return null;

    publisherClient = createClient({ url: redisUrl });
    publisherClient.on("error", (error) => {
        console.error("Realtime publisher error:", error?.message || error);
    });

    publisherReady = publisherClient.connect()
        .then(() => publisherClient)
        .catch((error) => {
            publisherReady = null;
            publisherClient = null;
            console.error("Realtime publisher connect failed:", error?.message || error);
            return null;
        });

    return publisherReady;
}

export async function publishRealtime(channel, payload) {
    const client = await getPublisherClient();
    if (!client) return false;
    try {
        await client.publish(String(channel || ""), JSON.stringify(payload || {}));
        return true;
    } catch (error) {
        console.error("Realtime publish failed:", error?.message || error);
        return false;
    }
}

export async function createRealtimeSubscriber() {
    const redisUrl = getRealtimeRedisUrl();
    if (!redisUrl) return null;
    const client = createClient({ url: redisUrl });
    client.on("error", (error) => {
        console.error("Realtime subscriber error:", error?.message || error);
    });
    await client.connect();
    return client;
}
