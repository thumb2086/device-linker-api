const TABLE_WIDTH = 1000;
const TABLE_HEIGHT = 500;
const BALL_RADIUS = 11;
const POCKET_RADIUS = 25;
const FRICTION = 0.992;
const STOP_EPSILON = 0.03;
const MAX_STEPS = 2800;
const DT = 1;
const MAX_SHOT_SPEED = 23;

const POCKETS = [
    { x: 0, y: 0 },
    { x: TABLE_WIDTH / 2, y: 0 },
    { x: TABLE_WIDTH, y: 0 },
    { x: 0, y: TABLE_HEIGHT },
    { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT },
    { x: TABLE_WIDTH, y: TABLE_HEIGHT }
];

const RACK_TEMPLATE = [
    [1],
    [9, 2],
    [3, 8, 10],
    [11, 4, 12, 5],
    [13, 6, 14, 7, 15]
];

function ballKind(number) {
    if (number === 0) return "cue";
    if (number === 8) return "eight";
    return number <= 7 ? "solid" : "stripe";
}

function clone(data) {
    return JSON.parse(JSON.stringify(data));
}

function buildBall(number, x, y) {
    return {
        id: number,
        number,
        kind: ballKind(number),
        x,
        y,
        vx: 0,
        vy: 0,
        pocketed: false
    };
}

function rackPosition(rowIndex, slotIndex) {
    const startX = 700;
    const startY = TABLE_HEIGHT / 2;
    const horizontalGap = BALL_RADIUS * 1.92;
    const verticalGap = BALL_RADIUS * 1.12;
    return {
        x: startX + (rowIndex * horizontalGap),
        y: startY - (rowIndex * verticalGap / 2) + (slotIndex * verticalGap)
    };
}

export function createInitialTableState() {
    const balls = [];
    balls.push(buildBall(0, 230, TABLE_HEIGHT / 2));

    for (let rowIndex = 0; rowIndex < RACK_TEMPLATE.length; rowIndex += 1) {
        for (let slotIndex = 0; slotIndex < RACK_TEMPLATE[rowIndex].length; slotIndex += 1) {
            const number = RACK_TEMPLATE[rowIndex][slotIndex];
            const pos = rackPosition(rowIndex, slotIndex);
            balls.push(buildBall(number, pos.x, pos.y));
        }
    }

    return {
        width: TABLE_WIDTH,
        height: TABLE_HEIGHT,
        ballRadius: BALL_RADIUS,
        pocketRadius: POCKET_RADIUS,
        balls
    };
}

function getBall(table, number) {
    return (table.balls || []).find((ball) => ball.number === number) || null;
}

function activeBalls(table) {
    return (table.balls || []).filter((ball) => !ball.pocketed);
}

function remainingBallsForKind(table, kind) {
    return activeBalls(table).filter((ball) => ball.kind === kind).length;
}

function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return (dx * dx) + (dy * dy);
}

function isMoving(table) {
    return activeBalls(table).some((ball) => Math.abs(ball.vx) > STOP_EPSILON || Math.abs(ball.vy) > STOP_EPSILON);
}

function clampBallToTable(ball) {
    ball.x = Math.max(BALL_RADIUS, Math.min(TABLE_WIDTH - BALL_RADIUS, ball.x));
    ball.y = Math.max(BALL_RADIUS, Math.min(TABLE_HEIGHT - BALL_RADIUS, ball.y));
}

function overlapsAnyBall(table, x, y, ignoreNumber = -1) {
    const minDistance = BALL_RADIUS * 2.05;
    const minDistanceSquared = minDistance * minDistance;
    return activeBalls(table).some((ball) => {
        if (ball.number === ignoreNumber) return false;
        const dx = ball.x - x;
        const dy = ball.y - y;
        return (dx * dx) + (dy * dy) < minDistanceSquared;
    });
}

export function canPlaceCueBall(table, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < BALL_RADIUS || x > TABLE_WIDTH - BALL_RADIUS) return false;
    if (y < BALL_RADIUS || y > TABLE_HEIGHT - BALL_RADIUS) return false;
    return !overlapsAnyBall(table, x, y, 0);
}

function placeCueBall(table, x, y) {
    const cueBall = getBall(table, 0);
    if (!cueBall) return;
    cueBall.pocketed = false;
    cueBall.x = x;
    cueBall.y = y;
    cueBall.vx = 0;
    cueBall.vy = 0;
}

function resolveWallCollision(ball) {
    if (ball.pocketed) return;

    if (ball.x <= BALL_RADIUS && ball.vx < 0) {
        ball.x = BALL_RADIUS;
        ball.vx *= -0.98;
    }
    if (ball.x >= TABLE_WIDTH - BALL_RADIUS && ball.vx > 0) {
        ball.x = TABLE_WIDTH - BALL_RADIUS;
        ball.vx *= -0.98;
    }
    if (ball.y <= BALL_RADIUS && ball.vy < 0) {
        ball.y = BALL_RADIUS;
        ball.vy *= -0.98;
    }
    if (ball.y >= TABLE_HEIGHT - BALL_RADIUS && ball.vy > 0) {
        ball.y = TABLE_HEIGHT - BALL_RADIUS;
        ball.vy *= -0.98;
    }
}

function resolveBallCollision(left, right) {
    if (left.pocketed || right.pocketed) return false;

    const dx = right.x - left.x;
    const dy = right.y - left.y;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    const minDistance = BALL_RADIUS * 2;
    if (!distance || distance >= minDistance) return false;

    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = minDistance - distance;
    left.x -= nx * overlap / 2;
    left.y -= ny * overlap / 2;
    right.x += nx * overlap / 2;
    right.y += ny * overlap / 2;

    const dvx = left.vx - right.vx;
    const dvy = left.vy - right.vy;
    const impulse = (dvx * nx) + (dvy * ny);
    if (impulse <= 0) {
        left.vx -= impulse * nx;
        left.vy -= impulse * ny;
        right.vx += impulse * nx;
        right.vy += impulse * ny;
    }

    clampBallToTable(left);
    clampBallToTable(right);
    return true;
}

function maybePocketBall(ball, pocketedBalls) {
    if (ball.pocketed) return false;
    const threshold = POCKET_RADIUS * POCKET_RADIUS;
    for (const pocket of POCKETS) {
        const dx = ball.x - pocket.x;
        const dy = ball.y - pocket.y;
        if ((dx * dx) + (dy * dy) <= threshold) {
            ball.pocketed = true;
            ball.vx = 0;
            ball.vy = 0;
            pocketedBalls.push(ball.number);
            return true;
        }
    }
    return false;
}

function normalizeAngle(angle) {
    if (!Number.isFinite(angle)) return 0;
    return angle;
}

function normalizePower(power) {
    const value = Number(power);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0.08, Math.min(1, value));
}

function legalFirstHit(targetGroup, firstHitKind, openTable) {
    if (!firstHitKind) return false;
    if (openTable) return firstHitKind !== "eight";
    if (targetGroup === "eight") return firstHitKind === "eight";
    return firstHitKind === targetGroup;
}

function assignGroupsIfNeeded(match, shooterAddress, objectBallsPocketed) {
    if (!match.rules.openTable) return false;
    const kinds = objectBallsPocketed
        .map((number) => ballKind(number))
        .filter((kind) => kind === "solid" || kind === "stripe");
    const uniqueKinds = Array.from(new Set(kinds));
    if (uniqueKinds.length !== 1) return false;

    const shooterGroup = uniqueKinds[0];
    const opponentGroup = shooterGroup === "solid" ? "stripe" : "solid";
    const opponentAddress = (match.players || []).find((player) => player.address !== shooterAddress)?.address || "";

    match.rules.groups[shooterAddress] = shooterGroup;
    match.rules.groups[opponentAddress] = opponentGroup;
    match.rules.openTable = false;
    return true;
}

export function createInitialRules(players) {
    const groups = {};
    for (const player of players || []) {
        groups[player.address] = null;
    }

    return {
        openTable: true,
        breakShot: true,
        ballInHandFor: "",
        groups
    };
}

function currentTargetGroup(match, shooterAddress) {
    const group = match.rules.groups[shooterAddress];
    if (!group || match.rules.openTable) return "open";
    return remainingBallsForKind(match.table, group) > 0 ? group : "eight";
}

export function buildPlayerProgress(match, address) {
    const group = match.rules.groups[address];
    const activeGroupBalls = group ? remainingBallsForKind(match.table, group) : 7;
    return {
        group: group || "",
        remainingGroupBalls: group ? activeGroupBalls : 7,
        clearedGroupBalls: group ? (7 - activeGroupBalls) : 0,
        target: currentTargetGroup(match, address)
    };
}

export function simulateShot(match, shooterAddress, shotInput) {
    const table = clone(match.table);
    const cueBall = getBall(table, 0);
    if (!cueBall) {
        throw new Error("白球不存在");
    }

    const angle = normalizeAngle(Number(shotInput && shotInput.angle));
    const power = normalizePower(shotInput && shotInput.power);
    const cuePlacementX = Number(shotInput && shotInput.cueX);
    const cuePlacementY = Number(shotInput && shotInput.cueY);

    if (match.rules.ballInHandFor === shooterAddress) {
        if (!canPlaceCueBall(table, cuePlacementX, cuePlacementY)) {
            throw new Error("白球擺放位置無效");
        }
        placeCueBall(table, cuePlacementX, cuePlacementY);
    } else if (cueBall.pocketed) {
        throw new Error("目前需要先擺白球");
    }

    cueBall.vx = Math.cos(angle) * power * MAX_SHOT_SPEED;
    cueBall.vy = Math.sin(angle) * power * MAX_SHOT_SPEED;

    const pocketedBalls = [];
    let firstHitNumber = null;

    for (let step = 0; step < MAX_STEPS; step += 1) {
        const balls = activeBalls(table);
        for (const ball of balls) {
            ball.x += ball.vx * DT;
            ball.y += ball.vy * DT;
            resolveWallCollision(ball);
        }

        for (let i = 0; i < balls.length; i += 1) {
            for (let j = i + 1; j < balls.length; j += 1) {
                const left = balls[i];
                const right = balls[j];
                if (resolveBallCollision(left, right) && firstHitNumber === null) {
                    if (left.number === 0 && right.number !== 0) firstHitNumber = right.number;
                    else if (right.number === 0 && left.number !== 0) firstHitNumber = left.number;
                }
            }
        }

        for (const ball of balls) {
            if (maybePocketBall(ball, pocketedBalls)) continue;
            ball.vx *= FRICTION;
            ball.vy *= FRICTION;
            if (Math.abs(ball.vx) < STOP_EPSILON) ball.vx = 0;
            if (Math.abs(ball.vy) < STOP_EPSILON) ball.vy = 0;
        }

        if (!isMoving(table)) break;
    }

    const objectBallsPocketed = pocketedBalls.filter((number) => number > 0);
    const cueScratched = pocketedBalls.includes(0);
    const firstHitKind = firstHitNumber ? ballKind(firstHitNumber) : "";
    const openTable = match.rules.openTable;
    const targetGroup = currentTargetGroup(match, shooterAddress);

    let foul = false;
    let foulReason = "";
    let win = false;
    let loss = false;

    if (!legalFirstHit(targetGroup, firstHitKind, openTable)) {
        foul = true;
        foulReason = openTable ? "白球沒有先碰到可用目標球" : "白球先碰到錯誤目標球";
    }

    if (!foul && cueScratched) {
        foul = true;
        foulReason = "白球落袋";
    }

    if (objectBallsPocketed.includes(8)) {
        const canFinishEight = targetGroup === "eight" && !foul;
        if (canFinishEight) {
            win = true;
        } else {
            loss = true;
            foul = true;
            foulReason = targetGroup === "open" ? "開放球桌時提前打進黑 8" : "提前打進黑 8";
        }
    }

    const assignedGroups = !foul && assignGroupsIfNeeded(match, shooterAddress, objectBallsPocketed);
    const shooterGroup = match.rules.groups[shooterAddress];
    const legalPots = objectBallsPocketed.filter((number) => {
        const kind = ballKind(number);
        if (kind === "eight") return targetGroup === "eight";
        if (match.rules.openTable && !assignedGroups) return kind === "solid" || kind === "stripe";
        return kind === shooterGroup;
    });

    const continueTurn = !loss && !foul && (legalPots.length > 0);

    return {
        table,
        firstHitNumber,
        pocketedBalls,
        objectBallsPocketed,
        cueScratched,
        foul,
        foulReason,
        continueTurn,
        win,
        loss,
        assignedGroups,
        legalPots,
        targetGroup,
        summary: buildShotSummary({
            firstHitNumber,
            pocketedBalls,
            foul,
            foulReason,
            continueTurn,
            win,
            loss,
            assignedGroups,
            match,
            shooterAddress
        })
    };
}

function buildShotSummary(result) {
    const parts = [];
    if (result.firstHitNumber) {
        parts.push(`先碰 ${result.firstHitNumber} 號球`);
    }
    const objectBalls = (result.pocketedBalls || []).filter((number) => number > 0);
    if (objectBalls.length) {
        parts.push(`進球 ${objectBalls.join(", ")}`);
    } else {
        parts.push("沒有進球");
    }
    if (result.assignedGroups) {
        const group = result.match.rules.groups[result.shooterAddress] === "solid" ? "全色" : "花色";
        parts.push(`確立球組：${group}`);
    }
    if (result.foul) {
        parts.push(`犯規：${result.foulReason}`);
    } else if (result.win) {
        parts.push("合法收黑 8 直接獲勝");
    } else if (result.continueTurn) {
        parts.push("保留球權");
    } else {
        parts.push("換對手回合");
    }
    return parts.join(" / ");
}
