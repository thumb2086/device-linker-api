class SlotMachine {
    constructor(reelsGrid, paylineSvg) {
        this.reelsGrid = reelsGrid;
        this.paylineSvg = paylineSvg;
        this.symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
        this.isSpinning = false;
        this.cells = [];

        this.init();
    }

    init() {
        this.reelsGrid.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.classList.add('reel-cell');
            this.reelsGrid.appendChild(cell);
            this.cells.push(cell);
        }
        this.setInitialState();
    }

    setInitialState() {
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i].textContent = this.symbols[i % this.symbols.length];
        }
    }

    async spin() {
        if (this.isSpinning) return;

        this.isSpinning = true;
        this.clearPaylines();
        
        const statusMsg = document.getElementById('status-msg');
        const betAmount = parseFloat(document.getElementById('bet-amount').value);

        if (isNaN(betAmount) || betAmount <= 0) {
            statusMsg.innerText = '❌ 請輸入有效的金額';
            this.isSpinning = false;
            return;
        }

        // Optimistic UI update for balance
        const balanceEl = document.getElementById('balance-val');
        const headerBalanceEl = document.getElementById('header-balance');
        const txLog = document.getElementById('tx-log');
        const currentBalance = parseFloat(balanceEl.innerText.replace(/,/g, ''));
        if (currentBalance < betAmount) {
            statusMsg.innerText = '❌ 餘額不足';
            this.isSpinning = false;
            return;
        }
        const tempBalance = currentBalance - betAmount;
        balanceEl.innerText = formatDisplayNumber(tempBalance, 2);
        if (headerBalanceEl) headerBalanceEl.innerText = formatDisplayNumber(tempBalance, 2);
        if (txLog) txLog.innerHTML = '';
        
        statusMsg.innerHTML = '<span class="loader"></span> 旋轉中...';

        // Start spinning animation
        const spinInterval = setInterval(() => {
            this.cells.forEach(cell => {
                cell.textContent = this.symbols[Math.floor(Math.random() * this.symbols.length)];
            });
        }, 80);

        try {
            const response = await fetch('/api/game?game=slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: user.address,
                    amount: betAmount,
                    sessionId: user.sessionId
                })
            });
            const result = await response.json();

            clearInterval(spinInterval);

            if (result.error) {
                throw new Error(result.error);
            }

            this.showResult(result, betAmount, tempBalance);
            this.drawPaylines(result.winLines);

        } catch (error) {
            clearInterval(spinInterval);
            console.error('Spinning failed:', error);
            statusMsg.innerText = `❌ 錯誤: ${error.message}`;
            // Revert balance
            balanceEl.innerText = formatDisplayNumber(currentBalance, 2);
            if (headerBalanceEl) headerBalanceEl.innerText = formatDisplayNumber(currentBalance, 2);
        } finally {
            this.isSpinning = false;
        }
    }

    showResult(result, betAmount, tempBalance) {
        const statusMsg = document.getElementById('status-msg');
        const balanceEl = document.getElementById('balance-val');
        const headerBalanceEl = document.getElementById('header-balance');
        const txLog = document.getElementById('tx-log');

        updateUI({ totalBet: result.totalBet, vipLevel: result.vipLevel, maxBet: result.maxBet });
        
        // Update cells with the result from the server
        for (let col = 0; col < 3; col++) {
            for (let row = 0; row < 3; row++) {
                const cellIndex = row * 3 + col;
                this.cells[cellIndex].textContent = result.columns[col][row].emoji;
            }
        }
        
        if (result.resultType === 'triple') {
            const newBalance = tempBalance + (betAmount * result.multiplier);
            balanceEl.innerText = formatDisplayNumber(newBalance, 2);
            if (headerBalanceEl) headerBalanceEl.innerText = formatDisplayNumber(newBalance, 2);
            statusMsg.innerHTML = `🏆 三連線！ 獲得 ${result.multiplier}x 獎勵！`;
        } else if (result.resultType === 'double') {
            const halfBackBalance = tempBalance + (betAmount * 0.5);
            balanceEl.innerText = formatDisplayNumber(halfBackBalance, 2);
            if (headerBalanceEl) headerBalanceEl.innerText = formatDisplayNumber(halfBackBalance, 2);
            statusMsg.innerHTML = `⭐ 兩連線，返還 0.5x`;
        } else {
            statusMsg.innerHTML = '💀 沒有連線，下次好運！';
        }

        if (txLog) txLog.innerHTML = txLinkHTML(result.txHash);
        setTimeout(refreshBalance, 10000);
    }

    clearPaylines() {
        this.paylineSvg.innerHTML = '';
    }

    drawPaylines(winLines) {
        if (!winLines || winLines.length === 0) return;

        const lineCoordinates = {
            // Horizontal
            top:    { x1: '16.66%', y1: '16.66%', x2: '83.33%', y2: '16.66%', type: 'horizontal' },
            middle: { x1: '16.66%', y1: '50%',    x2: '83.33%', y2: '50%',    type: 'horizontal' },
            bottom: { x1: '16.66%', y1: '83.33%', x2: '83.33%', y2: '83.33%', type: 'horizontal' },
            // Vertical
            'left-col':   { x1: '16.66%', y1: '16.66%', x2: '16.66%', y2: '83.33%', type: 'vertical' },
            'middle-col': { x1: '50%',    y1: '16.66%', x2: '50%',    y2: '83.33%', type: 'vertical' },
            'right-col':  { x1: '83.33%', y1: '16.66%', x2: '83.33%', y2: '83.33%', type: 'vertical' },
            // Diagonal
            'diag-down': { x1: '16.66%', y1: '16.66%', x2: '83.33%', y2: '83.33%', type: 'diagonal' },
            'diag-up':   { x1: '16.66%', y1: '83.33%', x2: '83.33%', y2: '16.66%', type: 'diagonal' },
        };

        winLines.forEach(lineId => {
            const coords = lineCoordinates[lineId];
            if (coords) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', coords.x1);
                line.setAttribute('y1', coords.y1);
                line.setAttribute('x2', coords.x2);
                line.setAttribute('y2', coords.y2);
                line.classList.add('line', 'win', coords.type);
                this.paylineSvg.appendChild(line);
            }
        });
    }
}
