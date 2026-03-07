import userHandler from "./user.js";
import { getCompatBody, setCompatBody } from "../lib/api-compat.js";

export default async function handler(req, res) {
    if (req.method === "POST") {
        const body = getCompatBody(req);
        const action = String(body.action || "get").trim().toLowerCase();
        setCompatBody(req, {
            ...body,
            action: action === "set" ? "set_profile" : "get_profile"
        });
    }

    return userHandler(req, res);
}
