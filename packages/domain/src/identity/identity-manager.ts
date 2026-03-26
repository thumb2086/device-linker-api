import { User, UserSchema, VIP_LEVELS, YJC_VIP_CONFIG } from "@repo/shared";

export interface IdentityDomain {
  createUser(address: string, displayName?: string): User;
  updateProfile(user: User, updates: Partial<Pick<User, "displayName">>): User;
  blacklistUser(user: User): User;
  calculateVipLevel(totalBet: number): typeof VIP_LEVELS[0];
  calculateYjcVipLevel(yjcBalance: number): { key: string; label: string; tableAccess: number[] } | null;
}

export class IdentityManager implements IdentityDomain {
  createUser(address: string, displayName?: string): User {
    const now = new Date();
    return UserSchema.parse({
      id: crypto.randomUUID(),
      address: address.toLowerCase(),
      displayName: displayName || null,
      isAdmin: false,
      isBlacklisted: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateProfile(user: User, updates: Partial<Pick<User, "displayName">>): User {
    return UserSchema.parse({
      ...user,
      ...updates,
      updatedAt: new Date(),
    });
  }

  blacklistUser(user: User): User {
    return UserSchema.parse({
      ...user,
      isBlacklisted: true,
      updatedAt: new Date(),
    });
  }

  calculateVipLevel(totalBet: number): typeof VIP_LEVELS[0] {
    for (let i = VIP_LEVELS.length - 1; i >= 0; i--) {
      if (totalBet >= VIP_LEVELS[i].threshold) return VIP_LEVELS[i];
    }
    return VIP_LEVELS[0];
  }

  calculateYjcVipLevel(yjcBalance: number) {
    if (yjcBalance >= YJC_VIP_CONFIG.VIP2.threshold) return { key: 'vip2', ...YJC_VIP_CONFIG.VIP2 };
    if (yjcBalance >= YJC_VIP_CONFIG.VIP1.threshold) return { key: 'vip1', ...YJC_VIP_CONFIG.VIP1 };
    return null;
  }
}
