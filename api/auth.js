import userHandler from "./user.js";

export default async function handler(req, res) {
    return userHandler(req, res);
}
