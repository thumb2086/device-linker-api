import adminHandler from "./admin.js";
import { getCompatBody, setCompatBody } from "../lib/api-compat.js";

export default async function handler(req, res) {
    if (req.method === "POST") {
        const body = getCompatBody(req);
        setCompatBody(req, {
            ...body,
            action: "reset_total_bets"
        });
    }

    return adminHandler(req, res);
}
