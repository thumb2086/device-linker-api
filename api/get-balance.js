import admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        })
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
