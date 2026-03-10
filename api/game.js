import coinflipHandler from "../lib/game-handlers/coinflip.js";
import rouletteHandler from "../lib/game-handlers/roulette.js";
import horseHandler from "../lib/game-handlers/horse.js";
import slotsHandler from "../lib/game-handlers/slots.js";
import blackjackHandler from "../lib/game-handlers/blackjack.js";
import dragonHandler from "../lib/game-handlers/dragon.js";
import sicboHandler from "../lib/game-handlers/sicbo.js";
import bingoHandler from "../lib/game-handlers/bingo.js";
import crashHandler from "../lib/game-handlers/crash.js";
import duelHandler from "../lib/game-handlers/duel.js";

const GAME_HANDLERS = {
    coinflip: coinflipHandler,
    roulette: rouletteHandler,
    horse: horseHandler,
    slots: slotsHandler,
    blackjack: blackjackHandler,
    dragon: dragonHandler,
    sicbo: sicboHandler,
    bingo: bingoHandler,
    crash: crashHandler,
    duel: duelHandler
};

function resolveGame(req) {
    const byQuery = req.query && typeof req.query.game === "string" ? req.query.game : "";
    const byBody = req.body && typeof req.body.game === "string" ? req.body.game : "";
    return String(byQuery || byBody || "").trim().toLowerCase();
}

export default async function handler(req, res) {
    const game = resolveGame(req);
    const gameHandler = GAME_HANDLERS[game];

    if (!gameHandler) {
        return res.status(400).json({
            success: false,
            error: "不支援的 game",
            supportedGames: Object.keys(GAME_HANDLERS)
        });
    }

    return gameHandler(req, res);
}
