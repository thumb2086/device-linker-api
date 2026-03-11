// scripts/scan-kv.mjs
import { kv } from '@vercel/kv';

async function scan() {
  console.log('Scanning all keys in KV...');
  const keys = [];
  for await (const key of kv.scanIterator({ match: '*', count: 1000 })) {
    keys.push(key);
  }
  console.log('Total keys:', keys.length);
  keys.forEach(k => console.log(k));
}

scan();
