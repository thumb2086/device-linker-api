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

var activeSlotsSettlement = null;

function calcDisplayBalance(realBalance) {
    if (activeSlotsSettlement && activeSlotsSettlement.displayBalance !== undefined) {
        return activeSlotsSettlement.displayBalance;
    }
    return realBalance;
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
        this.cells = [];
        this.lastWinLines = [];

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
            this.spinButton.disabled = true;
            this.spinButton.textContent = "結算中...";
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

    updateDisplayedBalance(nextBalance) {
        setDisplayedBalance(nextBalance);
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
        var statusText = "💀 本局未中，等待鏈上確認扣款";
        var resultLabel = "待結算";
        var resultCopy = "結果已經產生，正在等待鏈上確認。";
        var resultTone = "is-pending";

        if (totalMultiplier > 0) {
            if (tripleCount > 0) {
                statusText = "🏆 命中 " + tripleCount + " 條三連";
                if (doubleCount > 0) {
                    statusText += "，外加 " + doubleCount + " 條雙連";
                }
                statusText += "，派彩待入帳";
                resultLabel = tripleCount > 1 || doubleCount > 0 ? "組合派彩待入帳" : "三連待入帳";
                resultCopy = "本局共命中三連 " + tripleCount + " 條、雙連 " + doubleCount + " 條，總倍率 " + totalMultiplier + "x，正在等待鏈上入帳。";
            } else {
                statusText = "⭐ 命中 " + doubleCount + " 條雙連，返還待入帳";
                resultLabel = doubleCount > 1 ? "多線雙連待入帳" : "雙連待入帳";
                resultCopy = "雙連依條數累加，本局共命中 " + doubleCount + " 條雙連，總返還 " + totalMultiplier + "x，正在等待鏈上入帳。";
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

    async pollSettlement(spinId, context) {
        var self = this;
        if (!spinId) return;

        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }

        var result;
        try {
            var response = await fetch("/api/game?game=slots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "status",
                    spinId: spinId,
                    address: user.address,
                    sessionId: user.sessionId
                })
            });
            result = await response.json();
        } catch (error) {
            this.pollTimer = setTimeout(function () {
                self.pollSettlement(spinId, context);
            }, 900);
            return;
        }

        if (!result || result.error) {
            activeSlotsSettlement = null;
            this.setSettlingState(false);
            this.setSpinningState(false);
            this.updateDisplayedBalance(context.originalBalance);
            this.setStatus("❌ " + ((result && result.error) || "老虎機結算失敗"), true, false);
            this.setResultState("結算失敗", "這筆旋轉沒有完成鏈上結算，餘額已回復。", "is-error");
            this.updateTxLog("", (result && result.error) || "老虎機結算失敗");
            return;
        }

        if (result.settlementStatus === "pending" || result.settlementStatus === "settling") {
            activeSlotsSettlement = {
                spinId: spinId,
                displayBalance: context.pendingBalance
            };
            this.setSettlementPendingState();
            this.setSettlingState(true);
            this.pollTimer = setTimeout(function () {
                self.pollSettlement(spinId, context);
            }, 900);
            return;
        }

        activeSlotsSettlement = null;
        this.setSettlingState(false);
        this.setSpinningState(false);

        if (result.settlementStatus === "failed") {
            this.updateDisplayedBalance(context.originalBalance);
            this.setStatus("❌ " + (result.error || "老虎機結算失敗"), true, false);
            this.setResultState("結算失敗", "鏈上結算沒有完成，餘額已自動回補。", "is-error");
            this.updateTxLog("", result.error || "老虎機結算失敗");
            return;
        }

        this.showSettledResult(result, context);
    }

    async spin() {
        if (this.isSpinning) return;

        var betAmount = parseFloat(document.getElementById("bet-amount").value);
        if (!Number.isFinite(betAmount) || betAmount <= 0) {
            this.setStatus("❌ 請輸入有效的金額", true);
            this.setResultState("輸入錯誤", "下注金額必須大於 0。", "is-error");
            return;
        }

        var currentBalance = getCurrentUserBalance();
        if (currentBalance < betAmount) {
            this.setStatus("❌ 餘額不足", true);
            this.setResultState("餘額不足", "目前餘額不足以支付這一筆旋轉。", "is-error");
            return;
        }

        this.setSpinningState(true);
        this.clearPaylines();
        this.setSettlingState(false);
        this.updateTxLog("", "");
        this.setStatus("<span class=\"loader\"></span> 旋轉中...", false, true);
        this.setResultState("旋轉中", "正在與後端同步盤面與鏈上結算。", "");

        this.updateDisplayedBalance(currentBalance - betAmount);

        var self = this;
        var minSpinMs = 550;
        var startedAt = Date.now();
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

            if (!result || result.error) {
                throw new Error((result && (result.details ? (result.error + "：" + result.details) : result.error)) || "老虎機交易失敗");
            }

            var effectiveBetAmount = Number(result.amount || betAmount);
            var effectivePendingBalance = result.betTransferred
                ? currentBalance
                : Math.max(0, currentBalance - effectiveBetAmount);
            this.showPendingResult(result, {
                betAmount: effectiveBetAmount,
                originalBalance: currentBalance,
                pendingBalance: effectivePendingBalance
            });
        } catch (error) {
            clearInterval(spinInterval);
            console.error("Slots spin failed:", error);
            this.setSettlingState(false);
            this.setSpinningState(false);
            this.renderBoard(null, false);
            this.updateDisplayedBalance(currentBalance);
            this.setStatus("❌ " + error.message, true, false);
            this.setResultState("交易失敗", "這筆旋轉沒有完成結算，餘額已回復。", "is-error");
            this.updateTxLog("", error.message);
        }
    }

    async resumePendingSettlement() {
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
            if (!result || result.error || !result.spinId) return;
            if (result.settlementStatus !== "pending" && result.settlementStatus !== "settling") return;

            var currentBalance = getCurrentUserBalance();
            var effectiveBetAmount = Number(result.amount || 0);
            var pendingBalance = result.betTransferred
                ? currentBalance
                : Math.max(0, currentBalance - effectiveBetAmount);

            this.renderBoard(result.columns, false);
            this.drawPaylines(result.winLines || []);
            this.updateDisplayedBalance(pendingBalance);
            this.showPendingResult(result, {
                betAmount: effectiveBetAmount,
                originalBalance: currentBalance,
                pendingBalance: pendingBalance
            });
        } catch (_) {
            // ignore resume failures
        }
    }

    showPendingResult(result, context) {
        this.renderBoard(result.columns, false);
        this.drawPaylines(result.winLines || []);
        this.setSettlingState(true);
        this.setSettlementPendingState();
        var pendingView = this.buildPendingOutcome(result);
        this.setStatus(pendingView.statusText, false, false);
        this.setResultState(pendingView.resultLabel, pendingView.resultCopy, pendingView.resultTone);
        this.updateTxLog("", pendingView.lineSummary || "開獎已完成，等待鏈上結算");

        activeSlotsSettlement = {
            spinId: result.spinId,
            displayBalance: context.pendingBalance
        };
        this.pollSettlement(result.spinId, context);
    }

    showSettledResult(result, context) {
        var finalBalance = context.pendingBalance + (context.betAmount * Number(result.totalMultiplier || result.multiplier || 0));
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
            } else {
                statusText = "⭐ 命中 " + doubleCount + " 條雙連，總返還 " + totalMultiplier + "x 已入帳";
                resultLabel = doubleCount > 1 ? "多線雙連" : "雙連退還";
                resultCopy = "雙連依條數累加，本局共命中 " + doubleCount + " 條雙連，總返還 " + totalMultiplier + "x，鏈上已完成入帳。";
                resultTone = totalMultiplier >= 1 ? "is-win" : "is-refund";
            }
        }

        this.updateDisplayedBalance(finalBalance);
        this.setStatus(statusText, false, false);
        this.setResultState(resultLabel, resultCopy, resultTone);
        this.updateTxLog(result.txHash, lineSummary || (result.winLines && result.winLines.length ? ("中獎線: " + result.winLines.join(", ")) : ""));
        setTimeout(refreshBalance, 6000);
    }
}
