import { ethers } from "ethers";

const RPC_URL = "https://sepolia.base.org";
const CONTRACT_ADDRESS = "0x531aa0c02ee61bfdaf2077356293f2550a969142";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { from, to, amount, signature } = req.body;

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);

        let privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY not set");
        if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

        const wallet = new ethers.Wallet(privateKey, provider);

        // ABI for transferFrom
        const abi = ["function transferFrom(address from, address to, uint256 amount) external"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

        // Execute transfer
        // Note: 'from' address must have approved 'wallet' (admin) address for this to work
        const tx = await contract.transferFrom(from, to, ethers.parseUnits(amount, 18));

        await tx.wait();
        return res.status(200).json({ success: true, txHash: tx.hash });
    } catch (error) {
        console.error("Transfer error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}
