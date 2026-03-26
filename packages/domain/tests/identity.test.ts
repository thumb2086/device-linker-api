import { IdentityManager } from "../src/identity/identity-manager.js";

const manager = new IdentityManager();

const user = manager.createUser("0x1234567890123456789012345678901234567890", "Alice");
console.log("Created User:", user.displayName, user.address);

const updated = manager.updateProfile(user, { displayName: "Alice Updated" });
console.log("Updated User:", updated.displayName);

const blacklisted = manager.blacklistUser(updated);
console.log("Blacklisted:", blacklisted.isBlacklisted);
