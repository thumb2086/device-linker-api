import { IdentityManager, CustodyUser, SessionData } from "./identity-manager.js";
import { randomUUID } from "crypto";

export interface IUserRepository {
  saveUser(user: any): Promise<void>;
  getUserByAddress(address: string): Promise<any>;
  getUserById(id: string): Promise<any>;
}

export interface ISessionRepository {
  saveSession(session: any): Promise<void>;
  getSessionById(id: string): Promise<any>;
}

export interface AuthResult {
  success: boolean;
  sessionId?: string;
  user?: any;
  error?: {
    code: string;
    message: string;
  };
}

export class AuthManager {
  private identityManager: IdentityManager;
  private userRepo: IUserRepository;
  private sessionRepo: ISessionRepository;
  private kv: any;

  constructor(
    userRepo: IUserRepository,
    sessionRepo: ISessionRepository,
    kv: any
  ) {
    this.identityManager = new IdentityManager();
    this.userRepo = userRepo;
    this.sessionRepo = sessionRepo;
    this.kv = kv;
  }

  private custodyUserKey(username: string) {
    return `custody_user:${username.toLowerCase()}`;
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

    const existingKV = await this.kv.get(this.custodyUserKey(normalizedUsername));
    if (existingKV) {
      return { success: false, error: { code: "USERNAME_TAKEN", message: "Username already taken" } };
    }

    const custodyUser = this.identityManager.createCustodyUser(normalizedUsername, password);
    await this.kv.set(this.custodyUserKey(normalizedUsername), { ...custodyUser, username: normalizedUsername });

    if (bonusAmount) {
      const bonusKey = `balance:${custodyUser.address}`;
      const existing = await this.kv.get(bonusKey);
      if (!existing) {
        await this.kv.set(bonusKey, bonusAmount);
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

    await this.sessionRepo.saveSession({
      ...sessionWithUser,
      authorizedAt: new Date(),
      createdAt: new Date(),
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : null
    });

    await this.kv.set(`session:${sessionId}`, sessionWithUser, { ex: 86400 });

    return { success: true, sessionId, user };
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

    const custodyUser = await this.kv.get(this.custodyUserKey(normalizedUsername));
    if (!custodyUser || !custodyUser.address) {
      return { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } };
    }

    const completed = this.identityManager.ensureCustodyPublicKey(custodyUser);
    const verified = this.identityManager.verifyCustodyPassword(completed, password);
    if (!verified) {
      return { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } };
    }

    const blacklisted = await this.kv.get(`blacklist:${completed.address}`);
    if (blacklisted) {
      return { success: false, error: { code: "BLACKLISTED", message: "This account is restricted" } };
    }

    let user = await userRepo.getUserByAddress(completed.address);
    if (!user) {
      user = { id: randomUUID(), address: completed.address, createdAt: new Date(), updatedAt: new Date() };
      await userRepo.saveUser(user);
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

    await this.sessionRepo.saveSession({
      ...sessionWithUser,
      authorizedAt: new Date(),
      createdAt: new Date(),
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : null
    });
    await this.kv.set(`session:${sessionId}`, sessionWithUser, { ex: 86400 });

    return { success: true, sessionId, user };
  }

  async changePassword(username: string, current: string, next: string): Promise<AuthResult> {
    const normalizedUsername = username.trim().toLowerCase();
    const custodyUser = await this.kv.get(this.custodyUserKey(normalizedUsername));
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
    await this.kv.set(this.custodyUserKey(normalizedUsername), { ...updated, username: normalizedUsername });

    return { success: true };
  }

  async logout(sessionId: string): Promise<void> {
    await this.kv.del(`session:${sessionId}`);
    const session = await this.sessionRepo.getSessionById(sessionId);
    if (session) {
      await this.sessionRepo.saveSession({ ...session, status: "expired" });
    }
  }
}
