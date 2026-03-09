# Device-Linker API Integration

Base URL:

`https://device-linker-api.vercel.app/api/`

This project now uses 6 simplified API endpoints:

- `POST /api/user`
- `POST /api/wallet`
- `POST /api/stats`
- `POST /api/admin`
- `POST /api/game?game=<gameId>`
- `POST /api/market-sim`

Reward item reference:

- [`docs/reward-items-guide.md`](/workspaces/device-linker-api/docs/reward-items-guide.md)

## 1. Hardware Authorization

### Create pending session

`POST /api/user`

```json
{
  "action": "create_session",
  "ttlSeconds": 600,
  "platform": "android",
  "clientType": "mobile",
  "deviceId": "dlinker_xxx",
  "appVersion": "1.0.0+1"
}
```

Response:

```json
{
  "success": true,
  "status": "pending",
  "sessionId": "session_xxx",
  "deepLink": "dlinker://login?sessionId=session_xxx",
  "legacyDeepLink": "dlinker:login:session_xxx",
  "ttlSeconds": 600,
  "platform": "android",
  "clientType": "mobile"
}
```

### Authorize session from Device-Linker app

`POST /api/user`

```json
{
  "action": "authorize",
  "sessionId": "session_xxx",
  "address": "0x1234...",
  "publicKey": "<base64-spki>",
  "platform": "android",
  "clientType": "mobile",
  "deviceId": "dlinker_xxx",
  "appVersion": "1.0.0+1"
}
```

Response:

```json
{
  "success": true,
  "status": "authorized",
  "sessionId": "session_xxx",
  "address": "0x1234...",
  "publicKey": "<base64-spki>",
  "mode": "live",
  "platform": "android",
  "clientType": "mobile"
}
```

### Poll authorization status

`GET /api/user?action=get_status&sessionId=session_xxx`

or

`POST /api/user`

```json
{
  "action": "get_status",
  "sessionId": "session_xxx"
}
```

Pending response:

```json
{
  "status": "pending",
  "platform": "web",
  "clientType": "web",
  "expiresAt": "2026-03-07T12:34:56.000Z"
}
```

Authorized response:

```json
{
  "success": true,
  "status": "authorized",
  "address": "0x1234...",
  "displayName": "player1",
  "publicKey": "<base64-spki>",
  "mode": "live",
  "platform": "android",
  "clientType": "mobile",
  "deviceId": "dlinker_xxx",
  "appVersion": "1.0.0+1",
  "authorizedAt": "2026-03-07T12:35:00.000Z",
  "expiresAt": "2026-03-07T12:44:56.000Z",
  "balance": "1234.56",
  "totalBet": "1000.00",
  "vipLevel": "普通會員",
  "maxBet": "1000.00",
  "isAdmin": false
}
```

## 2. Custody Login

`POST /api/user`

```json
{
  "action": "custody_login",
  "username": "demo_user",
  "password": "secret123",
  "platform": "android",
  "clientType": "mobile",
  "deviceId": "dlinker_xxx",
  "appVersion": "1.0.0+1"
}
```

Response:

```json
{
  "success": true,
  "status": "authorized",
  "sessionId": "session_xxx",
  "address": "0x1234...",
  "publicKey": "custody_pk_xxx",
  "mode": "custody",
  "isNewAccount": false,
  "registerBonus": "100000",
  "bonusGranted": false,
  "bonusTxHash": "",
  "bonusError": ""
}
```

## 3. Balance

### Get wallet balance

`POST /api/wallet`

```json
{
  "action": "get_balance",
  "address": "0x1234..."
}
```

Response:

```json
{
  "success": true,
  "balance": "1234.56",
  "decimals": "18"
}
```

### Get wallet summary

`POST /api/wallet`

```json
{
  "action": "summary",
  "sessionId": "session_xxx"
}
```

Response:

```json
{
  "success": true,
  "action": "summary",
  "address": "0x1234...",
  "treasuryAddress": "0xabcd...",
  "decimals": "18",
  "userBalance": "1234.56",
  "treasuryBalance": "999999.00",
  "airdrop": {
    "distributed": "1000000.00",
    "cap": "5000000.00",
    "remaining": "4000000.00"
  }
}
```

### Get game settlement history

`POST /api/wallet`

```json
{
  "action": "game_history",
  "sessionId": "session_xxx",
  "limit": 12
}
```

Response:

```json
{
  "success": true,
  "action": "game_history",
  "address": "0x1234...",
  "total": 3,
  "items": [
    {
      "id": "game_xxx",
      "address": "0x1234...",
      "game": "coinflip",
      "gameLabel": "擲硬幣",
      "outcome": "win",
      "outcomeLabel": "猜中",
      "betAmount": "100.0",
      "payoutAmount": "80.0",
      "netAmount": "80.0",
      "multiplier": 0.8,
      "roundId": "123456",
      "mode": "",
      "txHash": "0xhash...",
      "details": "結果 heads / 下注 heads",
      "createdAt": "2026-03-09T12:00:00.000Z"
    }
  ]
}
```

Notes:

- `betAmount` is the stake for that round.
- `payoutAmount` is the amount transferred back to the player wallet for the settlement.
- `netAmount` is the real wallet delta for that round. Negative means loss.

## 4. History

`POST /api/user`

```json
{
  "action": "get_history",
  "address": "0x1234...",
  "page": 1,
  "limit": 20
}
```

Response:

```json
{
  "success": true,
  "page": 1,
  "limit": 20,
  "count": 2,
  "hasMore": false,
  "history": [
    {
      "type": "send",
      "amount": "10.00",
      "counterParty": "0xabcd...",
      "timestamp": 1700000000,
      "date": "2026/3/7 12:34:56",
      "txHash": "0xhash..."
    }
  ]
}
```

Note:

- This endpoint depends on server-side `ETHERSCAN_API_KEY`.
- If Vercel does not have `ETHERSCAN_API_KEY`, history requests can fail even when the client code is correct.

## 5. Transfer

`POST /api/wallet`

```json
{
  "action": "secure_transfer",
  "sessionId": "session_xxx",
  "to": "0xabcd...",
  "amount": "10",
  "signature": "<base64-der-signature>",
  "publicKey": "<base64-spki>"
}
```

Signature message format:

`transfer:<to_without_0x_lowercase>:<amount>`

Example:

`transfer:abcd1234abcd1234abcd1234abcd1234abcd1234:10`

Response:

```json
{
  "success": true,
  "txHash": "0xhash...",
  "from": "0x1234...",
  "to": "0xabcd...",
  "amount": "10",
  "isPayout": false,
  "requestedAmount": "10",
  "transferredAmount": "10.0",
  "feeAmount": "0.0",
  "feeRate": "0.00"
}
```

## 6. Airdrop

`POST /api/wallet`

```json
{
  "action": "airdrop",
  "sessionId": "session_xxx"
}
```

## 7. Leaderboards

### Total bet leaderboard

`POST /api/stats`

```json
{
  "action": "total_bet",
  "sessionId": "session_xxx",
  "limit": 50
}
```

### Net worth leaderboard

`POST /api/stats`

```json
{
  "action": "net_worth",
  "sessionId": "session_xxx",
  "limit": 50
}
```

## 8. Coinflip

`POST /api/game?game=coinflip&sessionId=session_xxx`

```json
{
  "action": "bet",
  "address": "0x1234...",
  "amount": "10",
  "sessionId": "session_xxx",
  "choice": "heads",
  "gameId": "coinflip",
  "signature": "<base64-der-signature>",
  "publicKey": "<base64-spki>"
}
```

## Device-Linker app mapping

Current Device-Linker source already maps to these simplified APIs:

- Hardware authorize: [main.dart](/C:/Users/CPXru/Desktop/thumb/program/Device-Linker/flutter_app/lib/main.dart#L1767)
- Balance: [main.dart](/C:/Users/CPXru/Desktop/thumb/program/Device-Linker/flutter_app/lib/main.dart#L1859)
- History: [main.dart](/C:/Users/CPXru/Desktop/thumb/program/Device-Linker/flutter_app/lib/main.dart#L1893)
- Transfer: [main.dart](/C:/Users/CPXru/Desktop/thumb/program/Device-Linker/flutter_app/lib/main.dart#L1871)

Server handlers:

- User auth/history: [api/user.js](/C:/Users/CPXru/Desktop/thumb/program/device-linker-api/api/user.js)
- Wallet/balance/transfer: [api/wallet.js](/C:/Users/CPXru/Desktop/thumb/program/device-linker-api/api/wallet.js)
- Stats: [api/stats.js](/C:/Users/CPXru/Desktop/thumb/program/device-linker-api/api/stats.js)
