import admin from "firebase-admin";

if (!admin.apps.length) {
    // 確保環境變數被正確解析為 JSON 物件
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Missing address' });

    try {
        const userDoc = await db.collection('users').doc(address).get();
        const balance = userDoc.exists ? (userDoc.data().balance || "0") : "0";
        // User requested response format check: { success: true, balance: ... }
        return res.status(200).json({ success: true, balance: balance });
    } catch (error) {
        console.error("Balance fetch error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}
