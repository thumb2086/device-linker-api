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
    var baseBalance = Number(realBalance || 0);
    return baseBalance;
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
        this.setResultState("待命中", "三連中獎、雙連退半與交易狀態都會顯示在這裡。", "");
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

    freezeCurrentBoard() {
        for (var index = 0; index < this.cells.length; index += 1) {
            var cell = this.cells[index];
            var symbolKey = cell && cell.getAttribute("data-symbol-key");
            this.renderSymbol(cell, symbolKey || this.symbolKeys[index % this.symbolKeys.length], false);
        }
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
                var symbol = columns && columns[col] && columns[col][row] ? columns[col][row].name : this.symbolKeys[(cellIndex + col) % this.symbolKeys.length];
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
            this.spinButton.textContent = this.isSpinning ? "處理中..." : "🎰 旋轉";
        }
    }

    setSettlementPendingState() {
        if (this.spinButton) {
            this.spinButton.disabled = this.isSpinning;
            this.spinButton.textContent = this.isSpinning ? "處理中..." : "🎰 再來一把";
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

    updateTxLog(txHash, details) {
        var txLog = document.getElementById("tx-log");
        if (!txLog) return;

        var html = txHash ? txLinkHTML(txHash) : "";
        if (details) {
            html += (html ? "<br>" : "") + "<span style=\"color:#a8a8a8; font-size:0.85rem;\">" + details.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</span>";
        }
        txLog.innerHTML = html;
    }

    buildPendingOutcome(result) {
        var totalMultiplier = Number(result.totalMultiplier || result.multiplier || 0);
        var tripleCount = Number(result.tripleCount || 0);
        var doubleCount = Number(result.doubleCount || 0);
        var lineSummary = this.buildLineSummary(result.lineWins);
        var statusText = "💀 本局未中，結果已揭曉";
        var resultLabel = "已開獎";
        var resultCopy = "結果已揭曉。";
        var resultTone = "is-pending";

        if (totalMultiplier > 0) {
            if (tripleCount > 0) {
                statusText = "🏆 命中 " + tripleCount + " 條三連";
                if (doubleCount > 0) {
                    statusText += "，外加 " + doubleCount + " 條雙連";
                }
                statusText += "，派彩已先顯示";
                resultLabel = tripleCount > 1 || doubleCount > 0 ? "組合派彩已開獎" : "三連已開獎";
                resultCopy = "本局共命中三連 " + tripleCount + " 條、雙連 " + doubleCount + " 條，總倍率 " + totalMultiplier + "x；畫面已先顯示結果。";
            } else {
                statusText = "⭐ 命中 " + doubleCount + " 條雙連，返還已先顯示";
                resultLabel = doubleCount > 1 ? "多線雙連已開獎" : "雙連已開獎";
                resultCopy = "雙連依條數累加，本局共命中 " + doubleCount + " 條雙連，總返還 " + totalMultiplier + "x；畫面已先顯示結果。";
            }
        }

        return {
            statusText: statusText,
            resultLabel: resultLabel,
            resultCopy: resultCopy,
            resultTone: resultTone,
            lineSummary: lineSummary
        };
    }

    refreshPendingBalanceView(source) {
        var chainBalance = Number(user.chainBalance || 0);
        this.updateDisplayedBalance(calcDisplayBalance(chainBalance), 45000, source || "slots-pending");
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
        this.setStatus("❌ " + (result.error || "老虎機結算失敗"), true, false);
        this.setResultState("結算失敗", "鏈上結算沒有完成，餘額已自動回補。", "is-error");
        this.updateTxLog("", result.error || "老虎機結算失敗");
    }

    applySettlementUpdate(result) {
        if (!result || !result.spinId) return "";

        var settlementStatus = String(result.settlementStatus || "").trim().toLowerCase();
        if (settlementStatus === "pending" || settlementStatus === "settling") {
            upsertPendingSlotsSpin(result, { localOnly: false });
            return;
        }

        var wasPresented = this.presentedSpinId === result.spinId;
        var currentDisplayedBalance = getCurrentUserBalance();
        removePendingSlotsSpin(result.spinId);

        if (settlementStatus === "settled") {
            this.updateDisplayedBalance(currentDisplayedBalance, 45000, "slots-settled");
            if (wasPresented) {
                this.showSettledResult(result);
            }
        } else if (settlementStatus === "failed") {
            this.refreshPendingBalanceView("slots-failed");
            if (wasPresented) {
                this.showFailedResult(result);
            } else {
                showUserToast("老虎機背景結算失敗，餘額已回補。", true);
            }
        }

        if (wasPresented) {
            var newestPendingSpin = getNewestPendingSlotsSpin();
            if (newestPendingSpin) {
                this.showPendingResult(newestPendingSpin, {
                    skipRegister: true,
                    fromSync: true,
                    skipPollingKickoff: true,
                    preserveDisplayedBalance: settlementStatus === "settled"
                });
            }
        }

        return settlementStatus;
    }

    async pollSettlementQueue() {
        var self = this;
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

    async spin() {
        if (this.isSpinning) return;

        var betAmount = parseFloat(document.getElementById("bet-amount").value);
        if (!Number.isFinite(betAmount) || betAmount <= 0) {
            this.setStatus("❌ 請輸入有效的金額", true);
            this.setResultState("輸入錯誤", "下注金額必須大於 0。", "is-error");
            return;
        }

        var displayedBalanceBeforeSpin = getCurrentUserBalance();
        if (displayedBalanceBeforeSpin < betAmount) {
            this.setStatus("❌ 餘額不足", true);
            this.setResultState("餘額不足", "目前餘額不足以支付這一筆旋轉。", "is-error");
            return;
        }

        this.setSpinningState(true);
        this.clearPaylines();
        this.setSettlingState(false);
        this.updateTxLog("", "");
        this.setStatus("<span class=\"loader\"></span> 旋轉中...", false, true);
        if (window.audioManager) window.audioManager.play('bet');
        this.setResultState("旋轉中", "正在生成盤面與結果。", "");

        this.updateDisplayedBalance(displayedBalanceBeforeSpin, 5000, "slots-pre-spin");

        var self = this;
        var minSpinMs = 550;
        var startedAt = Date.now();
        var spinSoundId = window.audioManager ? window.audioManager.play('slot_reel', { loop: true }) : null;
        var spinInterval = setInterval(function () {
            for (var index = 0; index < self.cells.length; index += 1) {
                self.renderSymbol(self.cells[index], self.symbolKeys[Math.floor(Math.random() * self.symbolKeys.length)], true);
            }
        }, 90);

        try {
            var response = await fetch("/api/game?game=slots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "spin",
                    address: user.address,
                    amount: betAmount,
                    sessionId: user.sessionId
                })
            });
            var result = await response.json();
            var elapsedMs = Date.now() - startedAt;
            if (elapsedMs < minSpinMs) {
                await new Promise(function (resolve) {
                    setTimeout(resolve, minSpinMs - elapsedMs);
                });
            }
            clearInterval(spinInterval);
            if (window.audioManager && spinSoundId) window.audioManager.stop('slot_reel', spinSoundId);
            if (window.audioManager) window.audioManager.play('slot_stop');

            if (!result || result.error) {
                throw new Error((result && (result.details ? (result.error + "：" + result.details) : result.error)) || "老虎機交易失敗");
            }

            this.setSpinningState(false);
            this.showPendingResult(result);
        } catch (error) {
            clearInterval(spinInterval);
            console.error("Slots spin failed:", error);
            this.setSettlingState(false);
            this.setSpinningState(false);
            this.renderBoard(null, false);
            this.updateDisplayedBalance(displayedBalanceBeforeSpin, 12000, "slots-spin-error");
            this.setStatus("❌ " + error.message, true, false);
            this.setResultState("交易失敗", "這筆旋轉沒有完成結算，餘額已回復。", "is-error");
            this.updateTxLog("", error.message);
            syncAuthoritativeChainBalance();
        }
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
                skipPollingKickoff: true
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
        var pendingView = this.buildPendingOutcome(result);
        this.setStatus(pendingView.statusText + "，可直接再轉。餘額以鏈上為準。", false, false);
        this.setResultState(pendingView.resultLabel, pendingView.resultCopy, pendingView.resultTone);
        if (!currentOptions.preserveDisplayedBalance) {
            this.refreshPendingBalanceView("slots-pending");
        }
        this.updateTxLog("", pendingView.lineSummary || "開獎已完成");
        if (!currentOptions.skipPollingKickoff) {
            this.scheduleSettlementPolling(250);
        }
    }

    showSettledResult(result) {
        var statusText = "💀 沒有連線，下次好運！";
        var resultLabel = "未中獎";
        var resultCopy = "本局沒有命中有效連線，鏈上已完成結算。";
        var resultTone = "";
        var totalMultiplier = Number(result.totalMultiplier || result.multiplier || 0);
        var tripleCount = Number(result.tripleCount || 0);
        var doubleCount = Number(result.doubleCount || 0);
        var lineSummary = this.buildLineSummary(result.lineWins);

        updateUI({
            totalBet: result.totalBet,
            vipLevel: result.vipLevel,
            maxBet: result.maxBet
        });

        if (totalMultiplier > 0) {
            if (tripleCount > 0) {
                statusText = "🏆 命中 " + tripleCount + " 條三連";
                if (doubleCount > 0) {
                    statusText += "，外加 " + doubleCount + " 條雙連";
                }
                statusText += "，總派彩 " + totalMultiplier + "x 已入帳！";
                resultLabel = tripleCount > 1 || doubleCount > 0 ? "組合派彩" : "三連中獎";
                resultCopy = "本局共命中三連 " + tripleCount + " 條、雙連 " + doubleCount + " 條，總倍率 " + totalMultiplier + "x，鏈上已完成入帳。";
                resultTone = "is-win";
            if (window.audioManager) window.audioManager.play(totalMultiplier >= 10 ? 'win_big' : 'win_small');
            } else {
                statusText = "⭐ 命中 " + doubleCount + " 條雙連，總返還 " + totalMultiplier + "x 已入帳";
                resultLabel = doubleCount > 1 ? "多線雙連" : "雙連退還";
                resultCopy = "雙連依條數累加，本局共命中 " + doubleCount + " 條雙連，總返還 " + totalMultiplier + "x，鏈上已完成入帳。";
                resultTone = totalMultiplier >= 1 ? "is-win" : "is-refund";
            }
        }

        this.setSettlingState(hasPendingSlotsSettlements());
        this.setStatus(statusText, false, false);
        this.setResultState(resultLabel, resultCopy, resultTone);
        this.updateTxLog(result.txHash, lineSummary || (result.winLines && result.winLines.length ? ("中獎線: " + result.winLines.join(", ")) : ""));
        setTimeout(refreshBalance, 6000);
    }
}
