import statsHandler from "./stats.js";
import { getCompatBody, setCompatBody } from "../lib/api-compat.js";

export default async function handler(req, res) {
    if (req.method === "POST") {
        const body = getCompatBody(req);
        setCompatBody(req, {
            ...body,
            action: "total_bet"
        });
    }

    return statsHandler(req, res);
}
