import { IdentityManager, CustodyUser, SessionData } from "./identity-manager.js";
import { randomUUID } from "crypto";
import {
  IUserRepository,
  ISessionRepository,
  ICustodyRepository,
  IWalletRepository,
  KVClient
} from "@repo/infrastructure";

export interface AuthResult {
  success: boolean;
  sessionId?: string;
  user?: any;
  address?: string;
  publicKey?: string;
  error?: {
    code: string;
    message: string;
  };
}

export class AuthManager {
  private identityManager: IdentityManager;
  private userRepo: IUserRepository;
  private sessionRepo: ISessionRepository;
  private custodyRepo: ICustodyRepository;
  private walletRepo: IWalletRepository;
  private kv: KVClient;

  constructor(
    userRepo: IUserRepository,
    sessionRepo: ISessionRepository,
    custodyRepo: ICustodyRepository,
    walletRepo: IWalletRepository,
    kv: KVClient
  ) {
    this.identityManager = new IdentityManager();
    this.userRepo = userRepo;
    this.sessionRepo = sessionRepo;
    this.custodyRepo = custodyRepo;
    this.walletRepo = walletRepo;
    this.kv = kv;
  }

  async registerCustody(params: {
    username: string;
    password: string;
    platform?: string;
    clientType?: string;
    deviceId?: string;
    appVersion?: string;
    bonusAmount?: string;
  }): Promise<AuthResult> {
    const { username, password, platform, clientType, deviceId, appVersion, bonusAmount } = params;
    const normalizedUsername = username.trim().toLowerCase();

    const usernameError = this.identityManager.validateUsername(normalizedUsername);
    if (usernameError) {
      return { success: false, error: { code: "INVALID_USERNAME", message: usernameError } };
    }

    const passwordError = this.identityManager.validatePassword(password);
    if (passwordError) {
      return { success: false, error: { code: "INVALID_PASSWORD", message: passwordError } };
    }

    const existing = await this.custodyRepo.getCustodyUser(normalizedUsername);
    if (existing) {
      return { success: false, error: { code: "USERNAME_TAKEN", message: "Username already taken" } };
    }

    const custodyUser = this.identityManager.createCustodyUser(normalizedUsername, password);
    await this.custodyRepo.saveCustodyUser(normalizedUsername, { ...custodyUser, username: normalizedUsername });

    if (bonusAmount) {
      const balance = await this.walletRepo.getBalance(custodyUser.address);
      if (parseFloat(balance) === 0) {
        await this.walletRepo.updateBalance(custodyUser.address, bonusAmount);
      }
    }

    let user = await this.userRepo.getUserByAddress(custodyUser.address);
    if (!user) {
      user = {
        id: randomUUID(),
        address: custodyUser.address,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await this.userRepo.saveUser(user);
    }

    const sessionId = `sess_custody_${randomUUID().slice(0, 12)}`;
    const session = this.identityManager.createAuthorizedSession(sessionId, custodyUser.address, custodyUser.publicKey, {
      mode: "custody",
      accountId: normalizedUsername,
      platform,
      clientType,
      deviceId,
      appVersion,
      ttlSeconds: 86400,
    });

    const sessionWithUser = { ...session, userId: user.id };

    await this.sessionRepo.saveSession(sessionWithUser);

    // Attempt KV but don't fail if limit reached
    try {
        await this.kv.set(`session:${sessionId}`, sessionWithUser, { ex: 86400 });
    } catch (e) {}

    return { success: true, sessionId, user, address: custodyUser.address, publicKey: custodyUser.publicKey };
  }

  async loginCustody(params: {
    username: string;
    password: string;
    platform?: string;
    clientType?: string;
    deviceId?: string;
    appVersion?: string;
  }): Promise<AuthResult> {
    const { username, password, platform, clientType, deviceId, appVersion } = params;
    const normalizedUsername = username.trim().toLowerCase();

    const custodyUser = await this.custodyRepo.getCustodyUser(normalizedUsername);
    const legacyCustodyUser = await this.custodyRepo.getLegacyCustodyUser(normalizedUsername);
    const primaryUser = custodyUser && custodyUser.address ? custodyUser : legacyCustodyUser;

    if (!primaryUser || !primaryUser.address) {
      return { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } };
    }

    const completed = this.identityManager.ensureCustodyPublicKey(primaryUser);
    if (!primaryUser.publicKey && completed.publicKey) {
      await this.custodyRepo.saveCustodyUser(normalizedUsername, completed);
    }
    let verified = this.identityManager.verifyCustodyPassword(completed, password);

    if (!verified && custodyUser && legacyCustodyUser) {
      const legacyCompleted = this.identityManager.ensureCustodyPublicKey(legacyCustodyUser);
      verified = this.identityManager.verifyCustodyPassword(legacyCompleted, password);
      if (verified) {
        await this.custodyRepo.saveCustodyUser(normalizedUsername, legacyCompleted);
      } else {
        console.error("Custody login verification failed", {
          username: normalizedUsername,
          primarySource: "custody_accounts",
          hasLegacy: true,
          accountHashLength: String(custodyUser.passwordHash || "").length,
          accountSaltLength: String(custodyUser.saltHex || "").length,
          legacyHashLength: String(legacyCustodyUser.passwordHash || "").length,
          legacySaltLength: String(legacyCustodyUser.saltHex || "").length,
        });
      }
    } else if (!verified) {
      console.error("Custody login verification failed", {
        username: normalizedUsername,
        primarySource: custodyUser ? "custody_accounts" : "custody_users",
        hasLegacy: !!legacyCustodyUser,
        hashLength: String(primaryUser.passwordHash || "").length,
        saltLength: String(primaryUser.saltHex || "").length,
      });
    }

    if (!verified) {
      return { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } };
    }

    let user = await this.userRepo.getUserByAddress(completed.address);
    if (!user) {
      user = { id: randomUUID(), address: completed.address, createdAt: new Date(), updatedAt: new Date() };
      await this.userRepo.saveUser(user);
    }

    const sessionId = `sess_custody_${randomUUID().slice(0, 12)}`;
    const session = this.identityManager.createAuthorizedSession(sessionId, completed.address, completed.publicKey, {
      mode: "custody",
      accountId: normalizedUsername,
      platform,
      clientType,
      deviceId,
      appVersion,
      ttlSeconds: 86400,
    });

    const sessionWithUser = { ...session, userId: user.id };

    await this.sessionRepo.saveSession(sessionWithUser);

    // Attempt KV but don't fail if limit reached
    try {
        await this.kv.set(`session:${sessionId}`, sessionWithUser, { ex: 86400 });
    } catch (e) {}

    return { success: true, sessionId, user, address: completed.address, publicKey: completed.publicKey };
  }

  async changePassword(username: string, current: string, next: string): Promise<AuthResult> {
    const normalizedUsername = username.trim().toLowerCase();
    const custodyUser = await this.custodyRepo.getCustodyUser(normalizedUsername);
    if (!custodyUser) {
      return { success: false, error: { code: "NOT_FOUND", message: "Account not found" } };
    }

    const verified = this.identityManager.verifyCustodyPassword(custodyUser, current);
    if (!verified) {
      return { success: false, error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect" } };
    }

    const validationError = this.identityManager.validatePassword(next);
    if (validationError) {
      return { success: false, error: { code: "INVALID_PASSWORD", message: validationError } };
    }

    const updated = this.identityManager.resetCustodyPassword(custodyUser, next);
    await this.custodyRepo.saveCustodyUser(normalizedUsername, { ...updated, username: normalizedUsername });

    return { success: true };
  }

  async logout(sessionId: string): Promise<void> {
    try {
        await this.kv.del(`session:${sessionId}`);
    } catch (e) {}

    const session = await this.sessionRepo.getSessionById(sessionId);
    if (session) {
      await this.sessionRepo.saveSession({ ...session, status: "expired" });
    }
  }
}
