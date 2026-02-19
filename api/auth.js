// 注意：Vercel 記憶體在冷啟動時會重置。
// 這裡使用一個全局對象暫存資料（Demo 使用，生產環境建議連結 Upstash Redis）
let sessionStore = {};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { sessionId } = req.query;

    if (req.method === 'GET') {
        // 網頁端呼叫：檢查該 sessionId 是否已經被手機授權
        if (sessionStore[sessionId]) {
            return res.status(200).json({ status: "authorized", ...sessionStore[sessionId] });
        }
        return res.status(200).json({ status: "pending" });
    }

    if (req.method === 'POST') {
        // 手機端呼叫：掃碼後將 address, publicKey 傳上來
        const { address, publicKey } = req.body;
        sessionStore[sessionId] = { address, publicKey };
        return res.status(200).json({ success: true });
    }
}