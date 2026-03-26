// packages/domain/src/identity/identity-manager.ts
// 從 main/api/user.js 移植 custody 帳戶邏輯
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import {
  CUSTODY_USERNAME_REGEX,
  CUSTODY_PASSWORD_MIN,
  CUSTODY_PASSWORD_MAX,
  SESSION_DEFAULT_TTL_SECONDS,
} from "@repo/shared";

export interface CustodyUser {
  username: string;
  saltHex: string;
  passwordHash: string;
  address: string;
  publicKey: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SessionData {
  id: string;
  status: "pending" | "authorized" | "expired";
  address?: string;
  publicKey?: string;
  mode?: "live" | "custody";
  platform?: string;
  clientType?: string;
  deviceId?: string;
  appVersion?: string;
  accountId?: string;
  authorizedAt?: string;
  expiresAt?: string | null;
  createdAt?: string;
}

export interface CreateSessionOptions {
  ttlSeconds?: number | null;
  platform?: string;
  clientType?: string;
  deviceId?: string;
  appVersion?: string;
}

export class IdentityManager {
  // ─── Session ────────────────────────────────────────────────────────────────

  createPendingSession(sessionId: string, options: CreateSessionOptions = {}): SessionData {
    const ttl = options.ttlSeconds ?? null;
    return {
      id: sessionId || `session_${randomUUID()}`,
      status: "pending",
      platform: this._normalizePlatform(options.platform),
      clientType: this._normalizeClientType(options.clientType),
      deviceId: this._normalizeString(options.deviceId, "", 128),
      appVersion: this._normalizeString(options.appVersion, "", 32),
      createdAt: new Date().toISOString(),
      expiresAt: this._buildExpiresAt(ttl),
    };
  }

  createAuthorizedSession(
    sessionId: string,
    address: string,
    publicKey: string,
    options: CreateSessionOptions & { mode?: "live" | "custody"; accountId?: string } = {}
  ): SessionData {
    const ttl = options.ttlSeconds ?? SESSION_DEFAULT_TTL_SECONDS;
    return {
      id: sessionId,
      status: "authorized",
      address: address.toLowerCase(),
      publicKey,
      mode: options.mode || "live",
      accountId: options.accountId,
      platform: this._normalizePlatform(options.platform),
      clientType: this._normalizeClientType(options.clientType),
      deviceId: this._normalizeString(options.deviceId, "", 128),
      appVersion: this._normalizeString(options.appVersion, "", 32),
      authorizedAt: new Date().toISOString(),
      expiresAt: this._buildExpiresAt(ttl),
    };
  }

  buildDeepLink(sessionId: string): string {
    return `dlinker://login?sessionId=${encodeURIComponent(sessionId)}`;
  }

  buildLegacyDeepLink(sessionId: string): string {
    return `dlinker:login:${sessionId}`;
  }

  // ─── Custody Account ────────────────────────────────────────────────────────

  /**
   * 從種子派生虛擬以太坊地址（與 main 分支完全相同算法）
   */
  buildCustodyAddress(seed: string): string {
    const hashHex = createHash("sha256").update(seed).digest("hex");
    return ethers.getAddress(`0x${hashHex.slice(0, 40)}`).toLowerCase();
  }

  buildCustodyPublicKey(seed: string): string {
    const hashHex = createHash("sha256").update(seed).digest("hex");
    return `custody_pk_${hashHex}`;
  }

  createCustodyUser(username: string, password: string): CustodyUser {
    this._assertValidUsername(username);
    this._assertValidPassword(password);

    const saltHex = randomBytes(16).toString("hex");
    const accountSeed = `${username}:${saltHex}:${Date.now()}:${randomUUID()}`;
    return {
      username,
      saltHex,
      passwordHash: this._hashPassword(password, saltHex),
      address: this.buildCustodyAddress(accountSeed),
      publicKey: this.buildCustodyPublicKey(accountSeed),
      createdAt: new Date().toISOString(),
    };
  }

  verifyCustodyPassword(user: CustodyUser, password: string): boolean {
    if (!user.saltHex || !user.passwordHash) return false;
    return this._verifyPassword(password, user.saltHex, user.passwordHash);
  }

  resetCustodyPassword(user: CustodyUser, newPassword: string): CustodyUser {
    this._assertValidPassword(newPassword);
    const saltHex = randomBytes(16).toString("hex");
    return {
      ...user,
      saltHex,
      passwordHash: this._hashPassword(newPassword, saltHex),
      updatedAt: new Date().toISOString(),
    };
  }

  ensureCustodyPublicKey(user: CustodyUser): CustodyUser {
    if (user.publicKey) return user;
    const fallbackSeed = `${user.username}:${user.address}:${user.createdAt || ""}`;
    return { ...user, publicKey: this.buildCustodyPublicKey(fallbackSeed) };
  }

  // ─── Address Validation ─────────────────────────────────────────────────────

  normalizeAddress(rawAddress: string): string {
    return ethers.getAddress(String(rawAddress || "").trim()).toLowerCase();
  }

  tryNormalizeAddress(rawAddress: string): string {
    try {
      return ethers.getAddress(String(rawAddress || "").trim()).toLowerCase();
    } catch {
      return "";
    }
  }

  isAdminAddress(address: string, adminAddress: string): boolean {
    return (
      String(address || "").toLowerCase().trim() ===
      String(adminAddress || "").toLowerCase().trim()
    );
  }

  // ─── TTL Helpers ─────────────────────────────────────────────────────────────

  parseSessionTTL(input: unknown): number | null {
    if (input === null || input === undefined || input === "") return null;
    if (typeof input === "string") {
      const normalized = input.trim().toLowerCase();
      if (["0", "none", "never", "off"].includes(normalized)) return null;
    }
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.min(3600, Math.max(60, Math.floor(parsed)));
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  validateUsername(username: string): string | null {
    if (!CUSTODY_USERNAME_REGEX.test(username)) return "Invalid username format";
    return null;
  }

  validatePassword(password: string): string | null {
    if (typeof password !== "string") return "Password must be string";
    if (password.length < CUSTODY_PASSWORD_MIN || password.length > CUSTODY_PASSWORD_MAX)
      return `Password length must be ${CUSTODY_PASSWORD_MIN}-${CUSTODY_PASSWORD_MAX}`;
    return null;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private _hashPassword(password: string, saltHex: string): string {
    return scryptSync(password, Buffer.from(saltHex, "hex"), 64).toString("hex");
  }

  private _verifyPassword(password: string, saltHex: string, expectedHashHex: string): boolean {
    const actual = Buffer.from(this._hashPassword(password, saltHex), "hex");
    const expected = Buffer.from(String(expectedHashHex || ""), "hex");
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }

  private _buildExpiresAt(ttlSeconds: number | null): string | null {
    if (ttlSeconds === null) return null;
    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
  }

  private _normalizePlatform(platform?: string): string {
    const allowed = new Set(["android", "ios", "web", "macos", "windows", "linux", "unknown"]);
    const normalized = String(platform || "").trim().toLowerCase();
    return allowed.has(normalized) ? normalized : "unknown";
  }

  private _normalizeClientType(clientType?: string): string {
    const allowed = new Set(["mobile", "desktop", "web", "server", "unknown"]);
    const normalized = String(clientType || "").trim().toLowerCase();
    return allowed.has(normalized) ? normalized : "unknown";
  }

  private _normalizeString(value?: string, fallback = "", maxLen = 64): string {
    if (!value || typeof value !== "string") return fallback;
    return value.trim().slice(0, maxLen) || fallback;
  }

  private _assertValidUsername(username: string): void {
    if (!CUSTODY_USERNAME_REGEX.test(username)) throw new Error("Invalid username format");
  }

  private _assertValidPassword(password: string): void {
    const err = this.validatePassword(password);
    if (err) throw new Error(err);
  }
}
