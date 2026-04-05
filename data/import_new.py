#!/usr/bin/env python3
"""
Redis -> Neon 精簡版 import script
執行: python import_new.py
"""
import json, sys, os, uuid
from datetime import datetime

DATABASE_URL = os.environ.get("DATABASE_URL", "")

def load_data(path="redis_export.json"):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def pj(val):
    if val is None: return None
    try: return json.loads(val)
    except: return val

def ts(val):
    if not val: return None
    try: return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except: return None

def jdump(val):
    if val is None: return None
    return json.dumps(val, ensure_ascii=False)

def run(conn, data):
    from psycopg2.extras import execute_values
    cur = conn.cursor()

    announce_rows, claim_rows, profile_rows = [], [], []
    campaign_rows, title_cat_rows, avatar_cat_rows = [], [], []
    grant_log_rows, total_bet_rows, issue_rows = [], [], []
    market_rows, horse_rows, leaderboard_rows = [], [], []

    for item in data:
        key = item["key"]
        raw_val = item.get("value")
        if raw_val is None:
            continue
        val = pj(raw_val)
        prefix = key.split(":")[0]

        # announcements
        if prefix == "announcement" and isinstance(val, dict):
            announce_rows.append((
                val.get("id"), val.get("title", ""), val.get("content", ""),
                val.get("isActive", False), val.get("pinned", False),
                ts(val.get("createdAt")), ts(val.get("updatedAt"))
            ))

        # reward_claims
        elif prefix == "reward_claim" and isinstance(val, dict):
            claim_rows.append((
                val.get("campaignId"), val.get("address"),
                val.get("count", 1), ts(val.get("claimedAt"))
            ))

        # user_profiles (from reward_profile)
        elif prefix == "reward_profile" and isinstance(val, dict):
            profile_rows.append((
                val.get("address"),
                val.get("selectedAvatarId", "classic_chip"),
                val.get("selectedTitleId", ""),
                jdump(val.get("inventory", {})),
                jdump(val.get("ownedAvatars", [])),
                jdump(val.get("ownedTitles", [])),
                jdump(val.get("activeBuffs", [])),
            ))

        # reward_campaigns
        elif prefix == "reward_campaign" and isinstance(val, dict):
            campaign_rows.append((
                val.get("id"), val.get("title"), val.get("description"),
                val.get("isActive", False), ts(val.get("startAt")), ts(val.get("endAt")),
                val.get("claimLimitPerUser"), val.get("minVipLevel"),
                jdump(val.get("rewards")), jdump(val)
            ))

        # reward_title_catalog
        elif prefix == "reward_title_catalog" and isinstance(val, dict):
            title_cat_rows.append((
                val.get("id"), val.get("name"), val.get("rarity"),
                val.get("source"), val.get("adminGrantable", False),
                val.get("showOnLeaderboard", False), val.get("shopEnabled", False),
                val.get("shopPrice"), val.get("shopDescription"),
                val.get("shopCategory"), jdump(val)
            ))

        # reward_avatar_catalog
        elif prefix == "reward_avatar_catalog" and isinstance(val, dict):
            avatar_cat_rows.append((
                val.get("id"), val.get("name"), val.get("rarity"),
                val.get("icon"), val.get("source"), val.get("description"),
                ts(val.get("updatedAt"))
            ))

        # reward_grant_log
        elif prefix == "reward_grant_log" and isinstance(val, dict):
            grant_log_rows.append((
                val.get("id"), val.get("address"), val.get("operator"),
                val.get("source"), val.get("note"),
                jdump(val.get("bundle")), ts(val.get("createdAt"))
            ))

        # total_bets
        elif prefix == "total_bet":
            parts = key.split(":")
            addr = parts[1] if len(parts) > 1 else ""
            total_bet_rows.append(("all", "", addr, int(float(raw_val)) if raw_val else 0))
        elif prefix == "total_bet_week":
            parts = key.split(":")
            total_bet_rows.append(("week", parts[1] if len(parts)>1 else "", parts[2] if len(parts)>2 else "", int(float(raw_val)) if raw_val else 0))
        elif prefix == "total_bet_month":
            parts = key.split(":")
            total_bet_rows.append(("month", parts[1] if len(parts)>1 else "", parts[2] if len(parts)>2 else "", int(float(raw_val)) if raw_val else 0))
        elif prefix == "total_bet_season":
            parts = key.split(":")
            total_bet_rows.append(("season", parts[1] if len(parts)>1 else "", parts[2] if len(parts)>2 else "", int(float(raw_val)) if raw_val else 0))

        # issue_reports
        elif prefix == "issue_report" and isinstance(val, dict):
            issue_rows.append((
                val.get("id"), val.get("address"), val.get("displayName"),
                val.get("title"), val.get("category"), val.get("message"),
                val.get("contact"), val.get("pageUrl"),
                ts(val.get("createdAt")), jdump(val)
            ))

        # market_portfolios
        elif prefix in ("market", "market_sim") and isinstance(val, dict):
            addr = key.split(":", 1)[1]
            market_rows.append((
                addr, prefix == "market_sim", val.get("version"),
                val.get("cash"), val.get("bankBalance"), val.get("loanPrincipal"),
                jdump(val.get("stockHoldings", {})),
                jdump(val.get("futuresPositions", [])),
                jdump(val.get("history", [])),
                ts(val.get("createdAt")), ts(val.get("updatedAt")), jdump(val)
            ))

        # horse_stats
        elif prefix == "horse_stats" and isinstance(val, dict):
            horse_id = key.split(":", 1)[1]
            horse_rows.append((
                horse_id, val.get("races"), val.get("wins"),
                val.get("podium"), jdump(val.get("last5", []))
            ))

        # leaderboard_settlement
        elif prefix == "leaderboard_settlement":
            leaderboard_rows.append((key, jdump(val) if isinstance(val, dict) else jdump({"value": val})))

    def insert(sql, rows, label):
        if not rows:
            print(f"  ⏭ {label}: 0 筆")
            return
        execute_values(cur, sql, rows)
        print(f"  ✅ {label}: {len(rows)} 筆")

    insert("""INSERT INTO announcements (id,title,content,is_active,pinned,created_at,updated_at)
              VALUES %s ON CONFLICT (id) DO NOTHING""", announce_rows, "announcements")

    insert("""INSERT INTO reward_claims (campaign_id,address,count,claimed_at)
              VALUES %s ON CONFLICT (campaign_id,address) DO NOTHING""", claim_rows, "reward_claims")

    insert("""INSERT INTO reward_campaigns (id,title,description,is_active,start_at,end_at,claim_limit_per_user,min_vip_level,rewards,raw)
              VALUES %s ON CONFLICT (id) DO NOTHING""", campaign_rows, "reward_campaigns")

    insert("""INSERT INTO reward_title_catalog (id,name,rarity,source,admin_grantable,show_on_leaderboard,shop_enabled,shop_price,shop_description,shop_category,raw)
              VALUES %s ON CONFLICT (id) DO NOTHING""", title_cat_rows, "reward_title_catalog")

    insert("""INSERT INTO reward_avatar_catalog (id,name,rarity,icon,source,description,updated_at)
              VALUES %s ON CONFLICT (id) DO NOTHING""", avatar_cat_rows, "reward_avatar_catalog")

    insert("""INSERT INTO reward_grant_log (id,address,operator,source,note,bundle,created_at)
              VALUES %s ON CONFLICT (id) DO NOTHING""", grant_log_rows, "reward_grant_log")

    insert("""INSERT INTO total_bets (period_type,period_id,address,amount)
              VALUES %s ON CONFLICT (period_type,period_id,address) DO NOTHING""", total_bet_rows, "total_bets")

    insert("""INSERT INTO issue_reports (id,address,display_name,title,category,message,contact,page_url,created_at,raw)
              VALUES %s ON CONFLICT (id) DO NOTHING""", issue_rows, "issue_reports")

    insert("""INSERT INTO market_portfolios (address,sim_mode,version,cash,bank_balance,loan_principal,stock_holdings,futures_positions,history,created_at,updated_at,raw)
              VALUES %s ON CONFLICT (address) DO NOTHING""", market_rows, "market_portfolios")

    insert("""INSERT INTO horse_stats (horse_id,races,wins,podium,last5)
              VALUES %s ON CONFLICT (horse_id) DO NOTHING""", horse_rows, "horse_stats")

    insert("""INSERT INTO leaderboard_settlement (id,raw)
              VALUES %s ON CONFLICT (id) DO NOTHING""", leaderboard_rows, "leaderboard_settlement")

    conn.commit()
    print("\n✅ Redis 資料匯入完成，開始整合...\n")

    # ---- 整合：從 Redis 資料直接建 users + custody_accounts ----
    from psycopg2.extras import execute_values as ev
    import uuid as _uuid

    user_rows = []
    acct_rows = []
    for item in data:
        key = item["key"]
        raw_val = item.get("value")
        if raw_val is None or not key.startswith("custody_user:"):
            continue
        val = pj(raw_val)
        if not isinstance(val, dict):
            continue
        addr = val.get("address")
        username = val.get("username")
        if not addr or not username:
            continue
        uid = str(_uuid.uuid4())
        user_rows.append((uid, addr.lower(), username))
        acct_rows.append((
            str(_uuid.uuid4()),
            username.lower(),
            val.get("passwordHash"),
            val.get("saltHex"),
            addr.lower(),
            val.get("publicKey") or val.get("raw_public_key"),
            uid,
        ))

    if user_rows:
        ev(cur, """INSERT INTO users (id, address, display_name, created_at, updated_at)
            VALUES %s ON CONFLICT (address) DO NOTHING""",
            [(r[0], r[1], r[2], 'NOW()', 'NOW()') for r in user_rows])
        # 改用逐筆 insert 確保 NOW() 正確
        cur.execute("DELETE FROM users WHERE created_at = 'NOW()'")
        for uid, addr, dname in user_rows:
            cur.execute(
                "INSERT INTO users (id, address, display_name, created_at, updated_at) VALUES (%s,%s,%s,NOW(),NOW()) ON CONFLICT (address) DO NOTHING",
                (uid, addr, dname)
            )
    print(f"  ✅ users 補齊: {len(user_rows)} 筆")

    for uid, addr, dname in user_rows:
        cur.execute("SELECT id FROM users WHERE lower(address)=lower(%s)", (addr,))
        row = cur.fetchone()
        real_uid = row[0] if row else uid
        for ar in acct_rows:
            if ar[4] == addr:
                cur.execute("""
                    INSERT INTO custody_accounts (id,username,password_hash,salt_hex,address,public_key,user_id,created_at,updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
                    ON CONFLICT (username) DO UPDATE SET
                        password_hash=EXCLUDED.password_hash,
                        salt_hex=EXCLUDED.salt_hex,
                        address=EXCLUDED.address,
                        user_id=COALESCE(EXCLUDED.user_id,custody_accounts.user_id),
                        updated_at=NOW()
                """, (ar[0],ar[1],ar[2],ar[3],ar[4],ar[5],real_uid))
    print(f"  ✅ custody_accounts 合併: {len(acct_rows)} 筆")

    # 補 user_profiles (from reward_profiles temp data)
    if profile_rows:
        for addr, avatar, title, inv, avatars, titles, buffs in profile_rows:
            cur.execute("""
                INSERT INTO user_profiles (id, user_id, address, selected_avatar_id, selected_title_id, inventory, owned_avatars, owned_titles, active_buffs, created_at, updated_at)
                SELECT gen_random_uuid(), u.id, lower(%s), %s, %s, %s, %s, %s, %s, NOW(), NOW()
                FROM users u WHERE lower(u.address) = lower(%s)
                ON CONFLICT (address) DO NOTHING
            """, (addr, avatar, title, inv, avatars, titles, buffs, addr))
        print(f"  ✅ user_profiles 補齊: {len(profile_rows)} 筆")

    # display_names -> users (從 redis 資料直接更新)
    for item in data:
        key = item["key"]
        raw_val = item.get("value")
        if raw_val is None or not key.startswith("display_name:"):
            continue
        addr = key.split(":", 1)[1]
        cur.execute(
            "UPDATE users SET display_name=%s, updated_at=NOW() WHERE lower(address)=lower(%s) AND %s IS NOT NULL",
            (str(raw_val), addr, str(raw_val))
        )
    conn.commit()

    # 驗證
    print("\n=== 驗證 ===")
    cur.execute("SELECT COUNT(*) FROM users")
    print(f"  users: {cur.fetchone()[0]} 筆")
    cur.execute("SELECT COUNT(*) FROM custody_accounts WHERE user_id IS NOT NULL")
    print(f"  custody_accounts (有 user_id): {cur.fetchone()[0]} 筆")
    cur.execute("SELECT COUNT(*) FROM total_bets")
    print(f"  total_bets: {cur.fetchone()[0]} 筆")
    cur.execute("SELECT COUNT(*) FROM leaderboard_settlement")
    print(f"  leaderboard_settlement: {cur.fetchone()[0]} 筆")

    print("\n🎉 全部完成！")

if __name__ == "__main__":
    if not DATABASE_URL:
        print('請設定環境變數:')
        print('  set "DATABASE_URL=postgresql://..."')
        sys.exit(1)
    import psycopg2
    print("連線到 Neon...")
    conn = psycopg2.connect(DATABASE_URL)
    print("開始匯入...\n")
    run(conn, load_data("redis_export.json"))
    conn.close()
