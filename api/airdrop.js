import walletHandler from "./wallet.js";
import { getCompatBody, setCompatBody } from "../lib/api-compat.js";

export default async function handler(req, res) {
    if (req.method === "POST") {
        const body = getCompatBody(req);
        setCompatBody(req, {
            ...body,
            action: "airdrop"
        });
    }

    return walletHandler(req, res);
}
