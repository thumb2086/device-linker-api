// scripts/reset-tx-queue.mjs

import { kv } from '@vercel/kv';

// These keys are copied from lib/tx-lock.js
const CHAIN_TX_LOCK_KEY = 'chain_tx_lock:global';
const CHAIN_TX_LOCK_META_KEY = 'chain_tx_lock_meta:global';
const CHAIN_TX_QUEUE_NEXT_KEY = 'chain_tx_queue_next:global';
const CHAIN_TX_QUEUE_SERVE_KEY = 'chain_tx_queue_serve:global';

async function resetQueue() {
  console.log('Connecting to Vercel KV store to reset the transaction queue...');

  const keysToDelete = [
    CHAIN_TX_LOCK_KEY,
    CHAIN_TX_LOCK_META_KEY,
    CHAIN_TX_QUEUE_NEXT_KEY,
    CHAIN_TX_QUEUE_SERVE_KEY,
  ];

  console.log('
The following keys will be deleted:');
  keysToDelete.forEach(key => console.log(`- ${key}`));

  try {
    const result = await kv.del(...keysToDelete);
    console.log(`
Successfully deleted ${result} key(s).`);
    console.log('The transaction queue and lock have been reset.');
    console.log('After deploying the latest changes, you can run this script to clear the stuck queue.');
    console.log('Make sure your Vercel KV environment variables are available when you run it.');
  } catch (error) {
    console.error('
An error occurred while trying to delete keys:', error);
    console.error('Please ensure your Vercel KV environment variables (KV_URL, KV_REST_API_URL, KV_REST_API_TOKEN, KV_REST_API_READ_ONLY_TOKEN) are correctly set in your environment.');
  }
}

resetQueue();
