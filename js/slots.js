function buildSlotsSymbolMap() {
    return {
        cherry: { emoji: "🍒", className: "is-cherry" },
        lemon: { emoji: "🍋", className: "is-lemon" },
        bell: { emoji: "🔔", className: "is-bell" },
        star: { emoji: "⭐", className: "is-star" },
        diamond: { emoji: "💎", className: "is-diamond" },
        seven: { emoji: "7️⃣", className: "is-seven" }
    };
}

var pendingSlotsSettlements = Object.create(null);

function normalizeSlotsSpinId(value) {
    return String(value || "").trim();
}

function getSlotsPendingSpin(spinId) {
    var normalizedId = normalizeSlotsSpinId(spinId);
    if (!normalizedId) return null;
    return pendingSlotsSettlements[normalizedId] || null;
}

function hasPendingSlotsSettlements() {
    return Object.keys(pendingSlotsSettlements).length > 0;
}

function upsertPendingSlotsSpin(spin, options) {
    if (!spin) return null;

    var normalizedId = normalizeSlotsSpinId(spin.spinId);
    if (!normalizedId) return null;

    var previous = pendingSlotsSettlements[normalizedId] || {};
    var next = {
        ...previous,
        ...spin,
        spinId: normalizedId
    };

    if (options && options.localOnly !== undefined) {
        next.localOnly = Boolean(options.localOnly);
    } else if (next.localOnly === undefined) {
        next.localOnly = false;
    }

    if (options && options.registeredAt !== undefined) {
        next.registeredAt = Number(options.registeredAt || 0);
    } else if (!next.registeredAt) {
        next.registeredAt = Date.now();
    }

    pendingSlotsSettlements[normalizedId] = next;
    return next;
}

function removePendingSlotsSpin(spinId) {
    var normalizedId = normalizeSlotsSpinId(spinId);
    if (!normalizedId) return null;

    var existing = pendingSlotsSettlements[normalizedId] || null;
    delete pendingSlotsSettlements[normalizedId];
    return existing;
}

function syncPendingSlotsFromServer(spins) {
    var nextSettlements = Object.create(null);
    var snapshotAt = Date.now();
    var pendingList = Array.isArray(spins) ? spins : [];

    for (var index = 0; index < pendingList.length; index += 1) {
        var spin = pendingList[index];
        var normalizedId = normalizeSlotsSpinId(spin && spin.spinId);
        if (!normalizedId) continue;

        nextSettlements[normalizedId] = {
            ...(pendingSlotsSettlements[normalizedId] || {}),
            ...spin,
            spinId: normalizedId,
            localOnly: false,
            registeredAt: Number((pendingSlotsSettlements[normalizedId] && pendingSlotsSettlements[normalizedId].registeredAt) || snapshotAt)
        };
    }

    var existingIds = Object.keys(pendingSlotsSettlements);
    for (var pointer = 0; pointer < existingIds.length; pointer += 1) {
        var existingId = existingIds[pointer];
        if (nextSettlements[existingId]) continue;

        var existingSpin = pendingSlotsSettlements[existingId];
        if (existingSpin && existingSpin.localOnly && (snapshotAt - Number(existingSpin.registeredAt || 0)) < 5000) {
            nextSettlements[existingId] = existingSpin;
        }
    }

    pendingSlotsSettlements = nextSettlements;
    return nextSettlements;
}

function getNewestPendingSlotsSpin() {
    var spinIds = Object.keys(pendingSlotsSettlements);
    if (!spinIds.length) return null;

    spinIds.sort(function (leftId, rightId) {
        var leftSpin = pendingSlotsSettlements[leftId] || {};
        var rightSpin = pendingSlotsSettlements[rightId] || {};
        var leftTime = Date.parse(String(leftSpin.createdAt || "")) || Number(leftSpin.registeredAt || 0) || 0;
        var rightTime = Date.parse(String(rightSpin.createdAt || "")) || Number(rightSpin.registeredAt || 0) || 0;
        return rightTime - leftTime;
    });

    return pendingSlotsSettlements[spinIds[0]] || null;
}

function calcDisplayBalance(realBalance) {
    return Number(realBalance || 0);
}

class SlotMachine {
    constructor(reelsGrid, paylineSvg) {
        this.reelsGrid = reelsGrid;
        this.paylineSvg = paylineSvg;
        this.boardEl = document.getElementById("slots-board");
        this.spinButton = document.getElementById("spin-btn");
        this.statusMsg = document.getElementById("status-msg");
        this.resultTypeEl = document.getElementById("slots-result-type");
        this.resultCopyEl = document.getElementById("slots-result-copy");
        this.symbolMap = buildSlotsSymbolMap();
        this.symbolKeys = Object.keys(this.symbolMap);
        this.isSpinning = false;
        this.isSettling = false;
        this.pollTimer = null;
        this.isPollingSettlement = false;
        this.cells = [];
        this.lastWinLines = [];
        this.presentedSpinId = "";

        this.init();
        this.bindEvents();
    }

    bindEvents() {
        var self = this;
        window.addEventListener("resize", function () {
            if (self.lastWinLines.length) {
                self.drawPaylines(self.lastWinLines);
            }
        });
    }

    init() {
        this.reelsGrid.innerHTML = "";
        this.cells = [];

        for (var index = 0; index < 9; index += 1) {
            var cell = document.createElement("div");
            cell.className = "reel-cell";
            cell.setAttribute("data-cell-index", String(index));
            this.reelsGrid.appendChild(cell);
            this.cells.push(cell);
        }

        this.setInitialState();
        this.setStatus("準備開始...", false, false);
        this.setResultState("待命中", "三連、雙連與組合派彩都會顯示在這裡。", "");
    }

    setInitialState() {
        for (var index = 0; index < this.cells.length; index += 1) {
            this.renderSymbol(this.cells[index], this.symbolKeys[index % this.symbolKeys.length], false);
        }
    }

    renderSymbol(cell, symbolKey, isSpinning) {
        var symbol = this.symbolMap[symbolKey] || this.symbolMap.cherry;
        cell.setAttribute("data-symbol-key", symbolKey);
        cell.innerHTML = "";

        var glyph = document.createElement("span");
        glyph.className = "reel-symbol " + symbol.className + (isSpinning ? " is-spinning" : "");
        glyph.textContent = symbol.emoji;
        cell.appendChild(glyph);
    }

    setSettlingState(isSettling) {
        this.isSettling = Boolean(isSettling);
        if (this.boardEl) {
            this.boardEl.classList.toggle("is-settling", this.isSettling);
        }
    }

    renderBoard(columns, isSpinning) {
        for (var col = 0; col < 3; col += 1) {
            for (var row = 0; row < 3; row += 1) {
                var cellIndex = (row * 3) + col;
                var cell = this.cells[cellIndex];
                var symbol = columns && columns[col] && columns[col][row]
                    ? columns[col][row].name
                    : this.symbolKeys[(cellIndex + col) % this.symbolKeys.length];
                this.renderSymbol(cell, symbol, Boolean(isSpinning));
            }
        }
    }

    setStatus(text, isError, allowHtml) {
        if (!this.statusMsg) return;
        if (allowHtml) {
            this.statusMsg.innerHTML = text || "";
        } else {
            this.statusMsg.textContent = text || "";
        }
        this.statusMsg.style.color = isError ? "#ff9c9c" : "";
    }

    setResultState(label, copy, tone) {
        if (this.resultTypeEl) {
            this.resultTypeEl.className = "slots-result-chip" + (tone ? (" " + tone) : "");
            this.resultTypeEl.textContent = label || "待命中";
        }
        if (this.resultCopyEl) {
            this.resultCopyEl.textContent = copy || "";
        }
    }

    buildLineSummary(lineWins) {
        if (!Array.isArray(lineWins) || lineWins.length === 0) return "";
        return lineWins.map(function (item) {
            return item.line + ":" + (item.type === "triple"
                ? (item.symbol + " " + item.multiplier + "x")
                : (item.symbol + " 對子 " + item.multiplier + "x"));
        }).join(" / ");
    }

    setSpinningState(isBusy) {
        this.isSpinning = Boolean(isBusy);
        if (this.spinButton) {
            this.spinButton.disabled = this.isSpinning;
            this.spinButton.textContent = this.isSpinning ? "旋轉中..." : "🎰 旋轉";
        }
    }

    setSettlementPendingState() {
        if (this.spinButton) {
            this.spinButton.disabled = this.isSpinning;
            this.spinButton.textContent = this.isSpinning ? "旋轉中..." : "🎰 等待派彩";
        }
    }

    clearPaylines() {
        this.lastWinLines = [];
        if (this.paylineSvg) this.paylineSvg.innerHTML = "";
    }

    getCellCenter(cellIndex) {
        var cell = this.cells[cellIndex];
        if (!cell || !this.boardEl) return null;

        var boardRect = this.boardEl.getBoundingClientRect();
        var cellRect = cell.getBoundingClientRect();

        return {
            x: cellRect.left - boardRect.left + (cellRect.width / 2),
            y: cellRect.top - boardRect.top + (cellRect.height / 2)
        };
    }

    drawPaylines(winLines) {
        if (!this.paylineSvg || !this.boardEl) return;

        this.paylineSvg.innerHTML = "";
        this.lastWinLines = Array.isArray(winLines) ? winLines.slice() : [];
        if (!this.lastWinLines.length) return;

        var boardRect = this.boardEl.getBoundingClientRect();
        this.paylineSvg.setAttribute("viewBox", "0 0 " + boardRect.width + " " + boardRect.height);

        var lineCellMap = {
            top: [0, 2],
            middle: [3, 5],
            bottom: [6, 8],
            "left-col": [0, 6],
            "middle-col": [1, 7],
            "right-col": [2, 8],
            "diag-down": [0, 8],
            "diag-up": [6, 2]
        };

        for (var index = 0; index < this.lastWinLines.length; index += 1) {
            var lineId = this.lastWinLines[index];
            var endpoints = lineCellMap[lineId];
            if (!endpoints) continue;

            var start = this.getCellCenter(endpoints[0]);
            var end = this.getCellCenter(endpoints[1]);
            if (!start || !end) continue;

            var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", start.x.toFixed(2));
            line.setAttribute("y1", start.y.toFixed(2));
            line.setAttribute("x2", end.x.toFixed(2));
            line.setAttribute("y2", end.y.toFixed(2));
            line.classList.add("line", "win");
            line.classList.add(lineId.indexOf("diag") === 0 ? "diagonal" : (lineId.indexOf("col") !== -1 ? "vertical" : "horizontal"));
            line.setAttribute("stroke-dasharray", "14 10");
            this.paylineSvg.appendChild(line);
        }
    }

    updateDisplayedBalance(nextBalance, ttlMs, source) {
        setDisplayedBalance(nextBalance, ttlMs, source);
    }

    updateTxLog(txInfo, lineSummary, description) {
        var txLog = document.getElementById("tx-log");
        if (!txLog) return;

        var html = "";
        var betTxHash = "";
        var payoutTxHash = "";

        if (txInfo && typeof txInfo === "object") {
            betTxHash = String(txInfo.betTxHash || "").trim();
            payoutTxHash = String(txInfo.payoutTxHash || "").trim();
        } else {
            betTxHash = String(txInfo || "").trim();
        }

        if (betTxHash) {
            html += '<span style="color:#c8c8c8; font-size:0.86rem;">Bet Tx</span><br>' + txLinkHTML(betTxHash);
        }
        if (payoutTxHash) {
            html += (html ? "<br>" : "") +
                '<span style="color:#c8c8c8; font-size:0.86rem;">Payout Tx</span><br>' +
                txLinkHTML(payoutTxHash);
        }
        if (lineSummary) {
            html += (html ? "<br>" : "") +
                "<span style=\"color:#c8c8c8; font-size:0.9rem;\">" +
                escapeHtml(lineSummary) +
                "</span>";
        }
        if (description) {
            html += (html ? "<br>" : "") +
                "<span style=\"color:#8a8a8a; font-size:0.85rem;\">" +
                escapeHtml(description) +
                "</span>";
        }
        txLog.innerHTML = html;
    }

    buildPendingOutcome(result) {
        var totalMultiplier = Number(result.totalMultiplier || result.multiplier || 0);
        var tripleCount = Number(result.tripleCount || 0);
        var doubleCount = Number(result.doubleCount || 0);
        var lineSummary = this.buildLineSummary(result.lineWins);
        var resultLabel = "已開獎";
        var resultCopy = "盤面已揭曉，派彩正在確認中。";

        if (totalMultiplier > 0) {
            if (tripleCount > 0) {
                resultLabel = tripleCount > 1 || doubleCount > 0 ? "組合派彩待入帳" : "三連待入帳";
                resultCopy = "本局命中三連 " + tripleCount + " 條、雙連 " + doubleCount + " 條，總倍率 " + totalMultiplier + "x。";
            } else {
                resultLabel = doubleCount > 1 ? "多線雙連待入帳" : "雙連待入帳";
                resultCopy = "本局命中雙連 " + doubleCount + " 條，總返還 " + totalMultiplier + "x。";
            }
        }

        return {
            statusText: "押注已扣，派彩處理中",
            resultLabel: resultLabel,
            resultCopy: resultCopy,
            resultTone: "is-pending",
            lineSummary: lineSummary
        };
    }

    refreshPendingBalanceView(source) {
        this.updateDisplayedBalance(getCurrentUserBalance(), 45000, source || "slots-pending");
    }

    scheduleSettlementPolling(delayMs) {
        var self = this;
        if (this.pollTimer) return;
        this.pollTimer = setTimeout(function () {
            self.pollTimer = null;
            self.pollSettlementQueue();
        }, Math.max(0, Number(delayMs || 0)));
    }

    showFailedResult(result) {
        this.setSettlingState(hasPendingSlotsSettlements());
        var settlementStatus = String(result && result.settlementStatus || "").toLowerCase();
        if (settlementStatus === "failed_payout") {
            this.setStatus("押注已扣，但派彩失敗", true, false);
            this.setResultState("派彩待重試", "押注已扣除，系統會持續重試派彩。", "is-error");
        } else {
            this.setStatus("押注扣款失敗", true, false);
            this.setResultState("交易失敗", "這筆旋轉沒有完成扣款，盤面不算數。", "is-error");
        }
        this.updateTxLog({
            betTxHash: result && result.betTxHash,
            payoutTxHash: result && result.payoutTxHash
        }, "", result && result.error ? result.error : "老虎機結算失敗");
    }

    applySettlementUpdate(result) {
        if (!result || !result.spinId) return "";

        var settlementStatus = String(result.settlementStatus || "").trim().toLowerCase();
        if (settlementStatus === "pending" || settlementStatus === "settling") {
            upsertPendingSlotsSpin(result, { localOnly: false });
            return settlementStatus;
        }

        var wasPresented = this.presentedSpinId === result.spinId;
        var currentDisplayedBalance = getCurrentUserBalance();
        var previousSpin = getSlotsPendingSpin(result.spinId);

        if (settlementStatus === "failed_payout") {
            upsertPendingSlotsSpin(result, { localOnly: false });
            if (wasPresented) {
                this.showFailedResult(result);
            } else {
                showUserToast("老虎機派彩失敗，系統會自動重試。", true);
            }
            return settlementStatus;
        }

        removePendingSlotsSpin(result.spinId);

        if (settlementStatus === "settled") {
            var payoutAmount = Number(result.payoutAmount || 0);
            var nextDisplayedBalance = currentDisplayedBalance;
            if (previousSpin && payoutAmount > 0) {
                nextDisplayedBalance += payoutAmount;
            }
            this.updateDisplayedBalance(nextDisplayedBalance, 5000, "slots-settled");
            if (wasPresented) {
                this.showSettledResult(result);
            }
        } else if (settlementStatus === "failed") {
            this.updateDisplayedBalance(Number(user.chainBalance || currentDisplayedBalance), 12000, "slots-failed");
            if (wasPresented) {
                this.showFailedResult(result);
            } else {
                showUserToast("老虎機押注扣款失敗，餘額已同步。", true);
            }
        }

        if (wasPresented) {
            var newestPendingSpin = getNewestPendingSlotsSpin();
            if (newestPendingSpin) {
                this.showPendingResult(newestPendingSpin, {
                    skipRegister: true,
                    fromSync: true,
                    skipPollingKickoff: true,
                    preserveDisplayedBalance: true
                });
            }
        }

        return settlementStatus;
    }

    async pollSettlementQueue() {
        if (this.isPollingSettlement || !user.sessionId || !hasPendingSlotsSettlements()) {
            this.setSettlingState(hasPendingSlotsSettlements());
            return;
        }

        this.isPollingSettlement = true;

        var result;
        try {
            var response = await fetch("/api/game?game=slots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "status",
                    address: user.address,
                    sessionId: user.sessionId
                })
            });
            result = await response.json();
        } catch (error) {
            this.isPollingSettlement = false;
            this.setSettlingState(true);
            this.setSettlementPendingState();
            this.scheduleSettlementPolling(1200);
            return;
        }

        this.isPollingSettlement = false;
        if (!result || result.error) {
            this.setSettlingState(true);
            this.setSettlementPendingState();
            this.scheduleSettlementPolling(1200);
            return;
        }

        var updates = Array.isArray(result.updates) ? result.updates : [];
        var hadSuccessfulSettle = false;
        for (var updateIndex = 0; updateIndex < updates.length; updateIndex += 1) {
            if (this.applySettlementUpdate(updates[updateIndex]) === "settled") {
                hadSuccessfulSettle = true;
            }
        }

        var pendingSpins = Array.isArray(result.spins) ? result.spins : [];
        syncPendingSlotsFromServer(pendingSpins);

        if (pendingSpins.length > 0) {
            var presentedPendingSpin = getSlotsPendingSpin(this.presentedSpinId);
            if (!presentedPendingSpin) {
                var newestPendingSpin = getNewestPendingSlotsSpin();
                if (newestPendingSpin) {
                    this.showPendingResult(newestPendingSpin, {
                        skipRegister: true,
                        fromSync: true,
                        skipPollingKickoff: true
                    });
                }
            }
            if (!hadSuccessfulSettle) {
                this.refreshPendingBalanceView("slots-pending-sync");
            }
            this.setSettlingState(true);
            this.setSettlementPendingState();
            this.scheduleSettlementPolling(900);
            return;
        }

        this.setSettlingState(false);
        if (!this.isSpinning) {
            this.setSpinningState(false);
        }
        setTimeout(refreshBalance, 2200);
    }

    spin() {
        if (this.isSpinning) return;

        var betAmount = parseFloat(document.getElementById("bet-amount").value);
        if (!Number.isFinite(betAmount) || betAmount <= 0) {
            this.setStatus("請輸入有效押注金額", true, false);
            this.setResultState("輸入錯誤", "押注金額必須大於 0。", "is-error");
            return;
        }

        var displayedBalanceBeforeSpin = getCurrentUserBalance();
        if (displayedBalanceBeforeSpin < betAmount) {
            this.setStatus("餘額不足", true, false);
            this.setResultState("餘額不足", "請先補充子熙幣後再下注。", "is-error");
            return;
        }

        this.setSpinningState(true);
        this.clearPaylines();
        this.setSettlingState(true);
        this.updateTxLog("", "", "");
        this.setStatus("<span class=\"loader\"></span> 旋轉中...", false, true);
        if (window.audioManager) window.audioManager.play("bet");
        this.setResultState("旋轉中", "正在生成盤面與結果。", "");

        this.updateDisplayedBalance(displayedBalanceBeforeSpin - betAmount, 5000, "slots-pre-spin");

        var self = this;
        var minSpinMs = 550;
        var startedAt = Date.now();
        var spinSoundId = window.audioManager ? window.audioManager.play("slot_reel", { loop: true }) : null;

        var spinInterval = setInterval(function () {
            for (var index = 0; index < self.cells.length; index += 1) {
                self.renderSymbol(self.cells[index], self.symbolKeys[Math.floor(Math.random() * self.symbolKeys.length)], true);
            }
        }, 90);

        fetch("/api/game?game=slots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "spin",
                address: user.address,
                amount: betAmount,
                sessionId: user.sessionId
            })
        })
            .then(function (response) {
                if (!response.ok) {
                    return response.json().then(function (err) {
                        throw new Error((err && err.error) || "老虎機旋轉失敗");
                    }).catch(function () {
                        throw new Error("連線失敗 " + response.status);
                    });
                }
                return response.json();
            })
            .then(function (result) {
                var elapsedMs = Date.now() - startedAt;
                var promise = elapsedMs < minSpinMs
                    ? new Promise(function (resolve) { setTimeout(resolve, minSpinMs - elapsedMs); })
                    : Promise.resolve();

                return promise.then(function () {
                    clearInterval(spinInterval);
                    if (window.audioManager && spinSoundId) window.audioManager.stop("slot_reel", spinSoundId);
                    if (window.audioManager) window.audioManager.play("slot_stop");

                    if (result.error) {
                        throw new Error(result.error || "老虎機旋轉失敗");
                    }

                    self.setSpinningState(false);
                    if (String(result.settlementStatus || "").toLowerCase() === "settled") {
                        self.showSettledResult(result);
                    } else {
                        self.showPendingResult(result);
                    }
                });
            })
            .catch(function (error) {
                clearInterval(spinInterval);
                if (window.audioManager && spinSoundId) window.audioManager.stop("slot_reel", spinSoundId);

                console.error("Slots spin failed:", error);
                self.setSettlingState(false);
                self.setSpinningState(false);
                self.renderBoard(null, false);
                self.updateDisplayedBalance(displayedBalanceBeforeSpin, 12000, "slots-spin-error");
                self.setStatus("押注扣款失敗", true, false);
                self.setResultState("交易失敗", "這筆旋轉沒有完成扣款，餘額已同步。", "is-error");
                self.updateTxLog("", "", error.message);
                setTimeout(syncAuthoritativeChainBalance, 1000);
            });
    }

    async resumePendingSettlements() {
        if (!user.sessionId || this.isSpinning) return;

        try {
            var response = await fetch("/api/game?game=slots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "status",
                    address: user.address,
                    sessionId: user.sessionId
                })
            });
            var result = await response.json();
            if (!result || result.error) return;

            var updates = Array.isArray(result.updates) ? result.updates : [];
            for (var updateIndex = 0; updateIndex < updates.length; updateIndex += 1) {
                this.applySettlementUpdate(updates[updateIndex]);
            }

            var pendingSpins = Array.isArray(result.spins) ? result.spins : [];
            syncPendingSlotsFromServer(pendingSpins);
            if (!pendingSpins.length) return;

            var newestPendingSpin = getNewestPendingSlotsSpin();
            if (!newestPendingSpin) return;

            this.showPendingResult(newestPendingSpin, {
                skipRegister: true,
                fromSync: true,
                skipPollingKickoff: true,
                preserveDisplayedBalance: true
            });
            this.scheduleSettlementPolling(400);
        } catch (_) {
            // ignore resume failures
        }
    }

    resumePendingSettlement() {
        return this.resumePendingSettlements();
    }

    showPendingResult(result, options) {
        var currentOptions = options || {};
        if (!currentOptions.skipRegister) {
            upsertPendingSlotsSpin(result, {
                localOnly: !currentOptions.fromSync,
                registeredAt: Date.now()
            });
        }

        this.presentedSpinId = result.spinId || this.presentedSpinId;
        this.renderBoard(result.columns, false);
        this.drawPaylines(result.winLines || []);
        this.setSettlingState(true);
        this.setSettlementPendingState();
        updateUI({
            totalBet: result.totalBet,
            level: result.level || result.vipLevel,
            betLimit: result.betLimit || result.maxBet
        });

        var pendingView = this.buildPendingOutcome(result);
        this.setStatus(pendingView.statusText, false, false);
        this.setResultState(pendingView.resultLabel, pendingView.resultCopy, pendingView.resultTone);
        if (!currentOptions.preserveDisplayedBalance) {
            this.refreshPendingBalanceView("slots-pending");
        }
        this.updateTxLog({
            betTxHash: result.betTxHash,
            payoutTxHash: result.payoutTxHash
        }, pendingView.lineSummary || "", pendingView.resultCopy || "開獎已完成");
        if (!currentOptions.skipPollingKickoff) {
            this.scheduleSettlementPolling(250);
        }
    }

    showSettledResult(result) {
        var totalMultiplier = Number(result.totalMultiplier || result.multiplier || 0);
        var tripleCount = Number(result.tripleCount || 0);
        var doubleCount = Number(result.doubleCount || 0);
        var lineSummary = this.buildLineSummary(result.lineWins);
        var resultLabel = "本局結算完成";
        var resultCopy = "本局已完成鏈上結算。";
        var resultTone = "";

        updateUI({
            totalBet: result.totalBet,
            level: result.level || result.vipLevel,
            betLimit: result.betLimit || result.maxBet
        });

        if (totalMultiplier > 0) {
            if (tripleCount > 0) {
                resultLabel = tripleCount > 1 || doubleCount > 0 ? "組合派彩已入帳" : "三連已入帳";
                resultCopy = "本局命中三連 " + tripleCount + " 條、雙連 " + doubleCount + " 條，總倍率 " + totalMultiplier + "x，已完成入帳。";
                resultTone = "is-win";
                if (window.audioManager) window.audioManager.play(totalMultiplier >= 10 ? "win_big" : "win_small");
            } else {
                resultLabel = doubleCount > 1 ? "多線雙連已入帳" : "雙連已入帳";
                resultCopy = "本局命中雙連 " + doubleCount + " 條，總返還 " + totalMultiplier + "x，已完成入帳。";
                resultTone = totalMultiplier >= 1 ? "is-win" : "is-refund";
            }
        } else {
            resultLabel = "本局未中";
            resultCopy = "本局沒有命中有效連線，押注已正常扣除。";
        }

        this.setSettlingState(hasPendingSlotsSettlements());
        this.setSpinningState(false);
        this.setStatus("押注已扣，派彩完成", false, false);
        this.setResultState(resultLabel, resultCopy, resultTone);
        this.updateTxLog({
            betTxHash: result.betTxHash || result.txHash,
            payoutTxHash: result.payoutTxHash
        }, lineSummary || "", resultCopy);
        setTimeout(refreshBalance, 2000);
    }
}

window.SlotMachine = SlotMachine;
