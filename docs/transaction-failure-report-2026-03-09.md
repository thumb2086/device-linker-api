# 交易失敗修復報告

日期: 2026-03-09

## 問題摘要

前台多個模組會共用同一個管理錢包發送鏈上交易，但部分 API 沒有走同一把全域交易鎖。當使用者同時進行匯款、遊戲結算、空投或市場操作時，容易發生 nonce 競爭，進而出現隨機的「區塊鏈交易失敗」。

## 根因

1. 同一管理錢包被多個請求並發使用。
2. 多數流程直接呼叫 `adminTransfer` 或 `transferFromTreasuryWithAutoTopup`，沒有統一序列化。
3. `crash` 舊流程會先寫入局資料，再扣款；若扣款失敗，可能留下不完整殘局。

## 修復內容

1. 在 `lib/tx-lock.js` 新增 `withChainTxLock()`，統一包裝鏈上交易鎖。
2. 將 `wallet`、`market-sim`、託管註冊獎勵與多個遊戲結算流程接到同一把全域鎖。
3. `crash` 改為扣款成功後才寫入牌局，並補上牌局擁有者檢查。
4. 老虎機前端補強錯誤顯示，失敗時會回復前端暫扣餘額並顯示交易錯誤。

## 涵蓋範圍

- `api/wallet.js`
- `api/market-sim.js`
- `api/user.js`
- `lib/game-handlers/coinflip.js`
- `lib/game-handlers/bingo.js`
- `lib/game-handlers/roulette.js`
- `lib/game-handlers/horse.js`
- `lib/game-handlers/sicbo.js`
- `lib/game-handlers/slots.js`
- `lib/game-handlers/blackjack.js`
- `lib/game-handlers/crash.js`
- `lib/tx-lock.js`

## 驗證結果

已完成:

- `node --check js/slots.js`
- `node --check api/wallet.js`
- `node --check lib/game-handlers/slots.js`

未完成:

- 真實鏈上並發壓測
- Vercel/正式環境交易量尖峰測試

原因:

目前工作區沒有可直接使用的 KV 正式環境變數與完整執行環境，無法在本地重演正式公告資料與全鏈路壓測。
