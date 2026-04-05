# Phase 3 API Documentation / Phase 3 API 文件

## Overview / 概述

**English:**  
This document describes the Phase 3 API endpoints for the gaming platform. All endpoints are prefixed with `/api/v1/`.

**中文：**  
本文檔描述遊戲平台的 Phase 3 API 端點。所有端點前綴為 `/api/v1/`。

**Base URL:** `https://api.example.com/api/v1`

**Authentication / 認證:**  
- **English:** All endpoints require a valid `sessionId` passed via query parameter, request body, or `x-session-id` header.
- **中文：** 所有端點需要有效的 `sessionId`，可通過查詢參數、請求體或 `x-session-id` 標頭傳遞。

---

## Game Endpoints / 遊戲端點

### 1. Slots (拉霸)

#### Play / 開始遊戲
```http
POST /games/slots/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number"
}
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "symbols": ["🍒", "🍋", "🍊"],
    "multiplier": 2.5,
    "payout": 250,
    "balance": 1250,
    "isWin": true,
    "result": "win"
  }
}
```

**Field Descriptions / 字段說明：**
| Field | English Description | 中文說明 |
|-------|---------------------|----------|
| `roundId` | Unique round identifier | 唯一回合識別碼 |
| `symbols` | Slot machine symbols | 拉霸機符號 |
| `multiplier` | Win multiplier | 獲勝倍數 |
| `payout` | Amount won | 贏得金額 |
| `balance` | Current balance after round | 回合後當前餘額 |
| `isWin` | Whether the player won | 玩家是否獲勝 |

#### Get History / 查詢歷史
```http
GET /games/slots/history?sessionId={sessionId}
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "id": "uuid",
        "betAmount": 100,
        "result": "win",
        "payout": 250,
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

### 2. Coinflip (擲硬幣)

#### Play / 開始遊戲
```http
POST /games/coinflip/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "choice": "heads" | "tails"
}
```

**Parameters / 參數：**
| Parameter | English | 中文 | Type | Required |
|-----------|---------|------|------|----------|
| `sessionId` | Session identifier | 會話識別碼 | string | Yes |
| `betAmount` | Amount to bet | 押注金額 | number | Yes |
| `choice` | Player's choice | 玩家選擇 | `heads`\|`tails` | Yes |

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "result": "heads",
    "playerChoice": "heads",
    "isWin": true,
    "multiplier": 2,
    "payout": 200,
    "balance": 1200
  }
}
```

---

### 3. Roulette (輪盤)

#### Play / 開始遊戲
```http
POST /games/roulette/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "betType": "number" | "color" | "parity" | "range",
  "betValue": "number | string"
}
```

**Bet Types / 押注類型：**
| Type | English | 中文 | betValue |
|------|---------|------|----------|
| `number` | Single number | 單個號碼 | 0-36 |
| `color` | Red or Black | 紅或黑 | `red`\|`black` |
| `parity` | Even or Odd | 單或雙 | `even`\|`odd` |
| `range` | High or Low | 大或小 | `high`\|`low` |

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "winningNumber": 23,
    "winningColor": "red",
    "playerBet": {
      "type": "color",
      "value": "red"
    },
    "isWin": true,
    "multiplier": 2,
    "payout": 200,
    "balance": 1200
  }
}
```

---

### 4. Horse Race (賽馬)

#### Get Horses / 獲取賽馬列表
```http
GET /games/horse/horses
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "horses": [
      { "id": 1, "name": "Lightning (閃電)", "odds": 2.5 },
      { "id": 2, "name": "Thunder (雷電)", "odds": 3.0 },
      { "id": 3, "name": "Storm (風暴)", "odds": 4.5 }
    ]
  }
}
```

#### Play / 開始遊戲
```http
POST /games/horse/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "horseId": "number"
}
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "winningHorse": 2,
    "playerHorse": 1,
    "horseOdds": 2.5,
    "isWin": false,
    "multiplier": 0,
    "payout": 0,
    "balance": 900
  }
}
```

---

### 5. Sicbo (骰寶)

#### Play / 開始遊戲
```http
POST /games/sicbo/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "betType": "big" | "small" | "triple" | "number",
  "betValue": "string | number"
}
```

**Bet Types / 押注類型：**
| Type | English | 中文 | Description |
|------|---------|------|-------------|
| `big` | Big (11-17) | 大 (11-17) | Sum is 11-17 |
| `small` | Small (4-10) | 小 (4-10) | Sum is 4-10 |
| `triple` | Triple | 圍骰 | All three dice same |
| `number` | Specific total | 特定總和 | Exact sum value |

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "dice": [3, 4, 5],
    "total": 12,
    "isBig": true,
    "playerBet": {
      "type": "big",
      "value": null
    },
    "isWin": true,
    "multiplier": 2,
    "payout": 200,
    "balance": 1200
  }
}
```

---

### 6. Bingo (賓果)

#### Play / 開始遊戲
```http
POST /games/bingo/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "cardCount": 1
}
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "drawnNumbers": [1, 15, 23, 34, 45, 55, 62, 75, 88],
    "matchedCount": 5,
    "winningTier": "line",
    "isWin": true,
    "multiplier": 5,
    "payout": 500,
    "balance": 1500
  }
}
```

---

### 7. Duel (對決)

#### Play / 開始遊戲
```http
POST /games/duel/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "choice": 1 | 2 | 3
}
```

**Choice Options / 選擇項：**
- `1` - Attack (攻擊)
- `2` - Defense (防禦)  
- `3` - Counter (反擊)

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "playerChoice": 1,
    "opponentChoice": 2,
    "playerRoll": 85,
    "opponentRoll": 72,
    "isWin": true,
    "multiplier": 1.9,
    "payout": 190,
    "balance": 1190
  }
}
```

---

### 8. Blackjack (21點)

#### Play / 開始遊戲
```http
POST /games/blackjack/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "action": "deal" | "hit" | "stand" | "double"
}
```

**Actions / 動作：**
| Action | English | 中文 |
|--------|---------|------|
| `deal` | Start new game | 開始新遊戲 |
| `hit` | Draw another card | 要牌 |
| `stand` | Keep current hand | 停牌 |
| `double` | Double bet and draw | 加倍 |

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "playerHand": ["A", "10"],
    "playerValue": 21,
    "dealerHand": ["K", "7"],
    "dealerValue": 17,
    "result": "blackjack",
    "isWin": true,
    "multiplier": 2.5,
    "payout": 250,
    "balance": 1250,
    "gameState": "completed"
  }
}
```

---

### 9. Dragon Tiger (龍虎)

#### Play / 開始遊戲
```http
POST /games/dragon/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "action": "gate" | "shoot",
  "betSide": "dragon" | "tiger" | "tie"
}
```

**Actions / 動作：**
- `gate` - Place bet (下注)
- `shoot` - Reveal cards (開牌)

**Bet Sides / 押注方：**
- `dragon` - Dragon (龍)
- `tiger` - Tiger (虎)
- `tie` - Tie (和)

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "action": "shoot",
    "dragonCard": "K",
    "tigerCard": "Q",
    "result": "dragon",
    "playerSide": "dragon",
    "isWin": true,
    "multiplier": 2,
    "payout": 200,
    "balance": 1200
  }
}
```

---

### 10. Crash (暴漲)

#### Play / 開始遊戲
```http
POST /games/crash/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "action": "start" | "cashout",
  "targetMultiplier": "number"
}
```

**Actions / 動作：**
- `start` - Start the round (開始回合)
- `cashout` - Cash out at current multiplier (套現)

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "crashPoint": 3.45,
    "playerExit": 2.5,
    "isWin": true,
    "multiplier": 2.5,
    "payout": 250,
    "balance": 1250
  }
}
```

---

### 11. Poker (德州撲克)

#### Play / 開始遊戲
```http
POST /games/poker/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number"
}
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "playerHand": ["A", "K", "Q", "J", "10"],
    "handRank": "royal_flush",
    "multiplier": 250,
    "payout": 25000,
    "balance": 26000
  }
}
```

**Hand Ranks / 牌型：**
| Rank | English | 中文 |
|------|---------|------|
| `royal_flush` | Royal Flush | 同花大順 |
| `straight_flush` | Straight Flush | 同花順 |
| `four_of_a_kind` | Four of a Kind | 四條 |
| `full_house` | Full House | 葫蘆 |
| `flush` | Flush | 同花 |
| `straight` | Straight | 順子 |
| `three_of_a_kind` | Three of a Kind | 三條 |
| `two_pair` | Two Pair | 兩對 |
| `one_pair` | One Pair | 一對 |
| `high_card` | High Card | 高牌 |

---

### 12. Bluff Dice (吹牛骰子)

#### Play / 開始遊戲
```http
POST /games/bluffdice/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "claim": {
    "count": 3,
    "face": 5
  },
  "action": "bid" | "challenge"
}
```

**Actions / 動作：**
- `bid` - Make a claim (下注聲稱)
- `challenge` - Challenge opponent's claim (質疑對手)

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "playerDice": [1, 3, 5, 5, 6],
    "opponentDice": [2, 4, 5, 5, 5],
    "totalFives": 5,
    "playerClaim": { "count": 3, "face": 5 },
    "isBluff": false,
    "isWin": true,
    "multiplier": 2,
    "payout": 200,
    "balance": 1200
  }
}
```

---

### 13. Shoot Dragon Gate (射龍門)

#### Play / 開始遊戲
```http
POST /games/shoot-dragon-gate/play
```

**Request Body / 請求體：**
```json
{
  "sessionId": "string",
  "betAmount": "number",
  "betType": "dragon" | "tiger" | "tie"
}
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "roundId": "uuid",
    "dragonCard": "A",
    "tigerCard": "K",
    "result": "dragon",
    "playerBet": "dragon",
    "isWin": true,
    "multiplier": 2,
    "payout": 200,
    "balance": 1200
  }
}
```

---

## VIP System Endpoints / VIP 系統端點

### Get Current User VIP Status / 獲取當前用戶 VIP 狀態
```http
GET /vip/status?sessionId={sessionId}
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "address": "0x1234...",
    "score": 150000,
    "totalBetAll": 150000,
    "level": {
      "label": "VIP Gold",
      "threshold": 100000,
      "maxBet": 50000
    },
    "nextLevel": {
      "label": "VIP Platinum",
      "threshold": 500000,
      "maxBet": 100000
    },
    "progressPct": 12.5,
    "privileges": {
      "dailyBonusMultiplier": 1.5,
      "marketFeeDiscount": 0.1,
      "danmakuColor": "#FFD700",
      "danmakuPriority": 2
    }
  }
}
```

**Field Descriptions / 字段說明：**
| Field | English | 中文 |
|-------|---------|------|
| `score` | VIP score (total bets) | VIP 分數（總押注額） |
| `level` | Current VIP level | 當前 VIP 等級 |
| `nextLevel` | Next VIP level info | 下一等級資訊 |
| `progressPct` | Progress to next level (%) | 升級進度百分比 |
| `privileges` | VIP privileges | VIP 特權 |

### Get VIP Level Table / 獲取 VIP 等級表
```http
GET /vip/levels
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "levels": [
      {
        "label": "VIP Bronze",
        "threshold": 0,
        "maxBet": 5000,
        "privileges": {
          "dailyBonusMultiplier": 1.0,
          "marketFeeDiscount": 0,
          "danmakuColor": "#CD7F32",
          "danmakuPriority": 0
        }
      },
      {
        "label": "VIP Silver",
        "threshold": 10000,
        "maxBet": 10000,
        "privileges": {
          "dailyBonusMultiplier": 1.2,
          "marketFeeDiscount": 0.05,
          "danmakuColor": "#C0C0C0",
          "danmakuPriority": 1
        }
      },
      {
        "label": "VIP Gold",
        "threshold": 100000,
        "maxBet": 50000,
        "privileges": {
          "dailyBonusMultiplier": 1.5,
          "marketFeeDiscount": 0.1,
          "danmakuColor": "#FFD700",
          "danmakuPriority": 2
        }
      },
      {
        "label": "VIP Platinum",
        "threshold": 500000,
        "maxBet": 100000,
        "privileges": {
          "dailyBonusMultiplier": 2.0,
          "marketFeeDiscount": 0.15,
          "danmakuColor": "#E5E4E2",
          "danmakuPriority": 3
        }
      },
      {
        "label": "VIP Diamond",
        "threshold": 1000000,
        "maxBet": 200000,
        "privileges": {
          "dailyBonusMultiplier": 3.0,
          "marketFeeDiscount": 0.2,
          "danmakuColor": "#B9F2FF",
          "danmakuPriority": 4
        }
      }
    ]
  }
}
```

---

## Leaderboard Endpoints / 排行榜端點

### Get Bet Leaderboard / 獲取押注排行榜
```http
GET /leaderboard/bet?type=all|week|month|season&sessionId={sessionId}
```

**Parameters / 參數：**
| Parameter | English | 中文 | Values |
|-----------|---------|------|--------|
| `type` | Leaderboard type | 排行榜類型 | `all`, `week`, `month`, `season` |
| `sessionId` | Session identifier | 會話識別碼 | string |

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "period": {
      "type": "week",
      "id": "20240115",
      "label": "2024-01-15"
    },
    "entries": [
      {
        "rank": 1,
        "address": "0x1234...",
        "displayName": "Player1",
        "amount": 500000,
        "isSelf": false
      },
      {
        "rank": 2,
        "address": "0x5678...",
        "displayName": "Player2",
        "amount": 350000,
        "isSelf": true
      }
    ],
    "selfRank": {
      "rank": 2,
      "address": "0x5678...",
      "amount": 350000,
      "tier": "top10"
    },
    "totalCount": 150
  }
}
```

### Get Asset Leaderboard / 獲取資產排行榜
```http
GET /leaderboard/asset?sessionId={sessionId}
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "period": {
      "type": "all",
      "id": "",
      "label": "All Time"
    },
    "entries": [
      {
        "rank": 1,
        "address": "0x1234...",
        "displayName": "RichPlayer",
        "balance": 1000000,
        "isSelf": false
      }
    ],
    "selfRank": {
      "rank": 5,
      "address": "0x5678...",
      "balance": 500000,
      "tier": "top10"
    },
    "totalCount": 200
  }
}
```

---

## Wallet Endpoints / 錢包端點

### Get Wallet Summary / 獲取錢包摘要
```http
GET /wallet/summary?sessionId={sessionId}
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalBalance": "1500.5000",
      "balances": {
        "ZXC": "1000.0000",
        "YJC": "500.5000"
      }
    },
    "assets": {
      "walletBalance": {
        "ZXC": "1000.0000",
        "YJC": "500.5000"
      },
      "market": {
        "available": true,
        "cash": "1000",
        "bankBalance": "500",
        "stockValue": "2000",
        "futuresUnrealizedPnl": "100",
        "loanPrincipal": "0",
        "netWorth": "3600",
        "overlayNetWorth": "2600"
      }
    },
    "onchain": {
      "available": true,
      "adminAddress": "0x...",
      "conversionRateZxcPerYjc": 100,
      "zxc": {
        "available": true,
        "balance": "1000.0000",
        "decimals": 18,
        "contractAddress": "0x...",
        "error": null
      },
      "yjc": {
        "available": true,
        "balance": "500.5000",
        "decimals": 18,
        "contractAddress": "0x...",
        "error": null
      }
    },
    "canClaimAirdrop": true,
    "nextAirdropAt": null
  }
}
```

**Field Descriptions / 字段說明：**
| Field | English | 中文 |
|-------|---------|------|
| `totalBalance` | Total wallet balance | 錢包總餘額 |
| `balances.ZXC` | ZXC (佑戩幣) balance | 佑戩幣餘額 |
| `balances.YJC` | YJC balance | YJC 餘額 |
| `market` | Market account info | 市場帳戶資訊 |
| `onchain` | On-chain token info | 鏈上代幣資訊 |
| `canClaimAirdrop` | Whether airdrop is available | 是否可以領取空投 |

---

## Error Responses / 錯誤回應

All errors follow this format / 所有錯誤遵循此格式：

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance for bet"
  }
}
```

### Common Error Codes / 常見錯誤碼

| Code | English | 中文 |
|------|---------|------|
| `UNAUTHORIZED` | Invalid or expired session | 無效或過期的會話 |
| `INSUFFICIENT_BALANCE` | Not enough balance for the operation | 餘額不足以執行操作 |
| `INVALID_BET` | Bet amount or parameters are invalid | 押注金額或參數無效 |
| `GAME_ERROR` | Internal game logic error | 遊戲內部邏輯錯誤 |
| `COOLDOWN` | Action is on cooldown | 操作處於冷卻中 |

---

## Authentication / 認證

**English:**  
All endpoints require authentication via `sessionId`. It can be provided in:

1. **Query Parameter:** `?sessionId=abc123`
2. **Request Body:** `{ "sessionId": "abc123" }`
3. **Header:** `x-session-id: abc123`

**繁體中文：**  
所有端點需要通過 `sessionId` 認證。可通過以下方式傳遞：

1. **查詢參數：** `?sessionId=abc123`
2. **請求體：** `{ "sessionId": "abc123" }`
3. **標頭：** `x-session-id: abc123`

---

## Rate Limiting / 速率限制

| Endpoint Type | English | 中文 | Limit |
|--------------|---------|------|-------|
| Game play | Game play endpoints | 遊戲端點 | 100 req/min per user |
| History | History endpoints | 歷史端點 | 60 req/min per user |
| Leaderboard/VIP | Leaderboard/VIP endpoints | 排行榜/VIP端點 | 30 req/min per user |

---

## Phase 3 Endpoints / Phase 3 端點

### Leaderboard System / 排行榜系統

#### Get Leaderboard / 獲取排行榜
```http
GET /api/v1/leaderboard?type=week&limit=50
```

**Query Parameters / 查詢參數：**
| Parameter | Type | English | 中文 |
|-----------|------|---------|------|
| `type` | enum | Leaderboard type: `week`, `month`, `season`, `all`, `asset` | 排行榜類型 |
| `limit` | number | Number of entries (1-100, default 50) | 條目數量 |
| `periodId` | string | Optional specific period ID | 可選特定期間 ID |
| `sessionId` | string | User session for self-rank display | 用戶會話用於顯示自身排名 |

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "rank": 1,
        "address": "0x123...",
        "displayName": "Player1",
        "amount": 5000000
      }
    ],
    "self": {
      "rank": 15,
      "address": "0xabc...",
      "amount": 100000
    },
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### VIP System / VIP 系統

#### Get Own VIP Status / 獲取自身 VIP 狀態
```http
GET /api/v1/vip/me?sessionId=abc123
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "address": "0xabc...",
    "score": 1500000,
    "totalBetAll": 1000000,
    "yjcBalance": 500000,
    "level": {
      "threshold": 1000000,
      "label": "黃金會員",
      "maxBet": 100000,
      "dailyBonusMultiplier": 1.5,
      "marketFeeDiscount": 0.2,
      "danmakuColor": "#ffd700",
      "danmakuPriority": 3
    },
    "nextLevel": {
      "threshold": 10000000,
      "label": "白金會員"
    },
    "progressPct": 55,
    "privileges": {
      "dailyBonusMultiplier": 1.5,
      "marketFeeDiscount": 0.2,
      "danmakuColor": "#ffd700",
      "danmakuPriority": 3
    }
  }
}
```

#### Get Public VIP Info / 獲取公開 VIP 資訊
```http
GET /api/v1/vip/:address
```

**Response / 回應：**
```json
{
  "success": true,
  "data": {
    "level": 1000000,
    "label": "黃金會員",
    "danmakuColor": "#ffd700",
    "danmakuPriority": 3
  }
}
```

#### Get VIP Levels Table / 獲取 VIP 等級表
```http
GET /api/v1/vip/levels
```

**Response / 回應：**
```json
{
  "success": true,
  "data": [
    {
      "threshold": 0,
      "label": "普通會員",
      "maxBet": 1000,
      "dailyBonusMultiplier": 1.0,
      "marketFeeDiscount": 0.0,
      "danmakuColor": "#a0a0a0",
      "danmakuPriority": 0
    },
    ...
  ]
}
```

### Danmaku System / 彈幕系統

#### Get Recent Danmaku Events / 獲取近期彈幕事件
```http
GET /api/v1/danmaku/events?limit=50
```

**Query Parameters / 查詢參數：**
| Parameter | Type | English | 中文 |
|-----------|------|---------|------|
| `limit` | number | Number of events (1-100, default 50) | 事件數量 |

**Response / 回應：**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "win",
      "address": "0x123...",
      "displayName": "Player1",
      "message": "🎉 Player1 在 slots 中大贏 5000 ZHC！(10x)",
      "metadata": {
        "game": "slots",
        "payout": 5000,
        "multiplier": 10
      },
      "priority": 8,
      "color": "#ffd700",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Danmaku Event Types / 彈幕事件類型：**
| Type | English | 中文 | Priority Bonus |
|------|---------|------|----------------|
| `win` | Regular win | 普通中獎 | 0 |
| `big_win` | Big win (10x+) | 大獎 | +5 |
| `leaderboard` | Leaderboard achievement | 排行榜成就 | +3 |
| `vip_upgrade` | VIP level upgrade | VIP 升級 | +10 |

---

## Changelog / 更新日誌

### v1.1.0 (Phase 3 - 2026-04-05)
**English:**
- Added Leaderboard system with weekly/monthly/season/all-time rankings
- Added VIP system with 29 tier levels and privileges
- Added YJC token integration for VIP score calculation (70% bets + 30% YJC)
- Migrated all 12 games to use GameSessionManager with atomic transactions
- Added basic Danmaku event system for real-time notifications
- Added `leaderboard_kings` table for tracking cumulative first-place wins
- Fixed frontend leaderboard filter mapping

**繁體中文：**
- 新增排行榜系統，支援週榜/月榜/賽季榜/總榜
- 新增 VIP 系統，包含 29 個等級與特權
- 新增 YJC 代幣整合於 VIP 分數計算（70% 投注 + 30% YJC）
- 將所有 12 款遊戲遷移至使用 GameSessionManager 原子交易
- 新增基礎彈幕事件系統用於即時通知
- 新增 `leaderboard_kings` 表格用於追蹤累積第一名次數
- 修正前端排行榜過濾器映射

### v1.0.0 (2024-01-15)
**English:**
- Initial Phase 3 release
- 13 game endpoints
- VIP system
- Leaderboard system
- Game session tracking

**中文：**
- Phase 3 初始發布
- 13 個遊戲端點
- VIP 系統
- 排行榜系統
- 遊戲會話追蹤
