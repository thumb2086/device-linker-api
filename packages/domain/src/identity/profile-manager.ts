import { IUserRepository, ISessionRepository } from "@repo/infrastructure";

export class ProfileManager {
  constructor(
    private userRepo: IUserRepository,
    private sessionRepo: ISessionRepository
  ) {}

  async setUsername(userId: string, username: string): Promise<{ success: boolean; error?: string }> {
    const user = await this.userRepo.getUserById(userId);
    if (!user) return { success: false, error: "User not found" };

    const trimmed = username.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      return { success: false, error: "Username must be 2-20 characters" };
    }

    // Check for duplicate usernames if needed, but for now just update
    await this.userRepo.saveUser({ ...user, username: trimmed, updatedAt: new Date() });
    return { success: true };
  }

  async getProfile(userId: string) {
    return await this.userRepo.getUserById(userId);
  }
}
