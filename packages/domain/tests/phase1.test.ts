import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IdentityManager } from '../src/identity/identity-manager.js';
import { AuthManager } from '../src/identity/auth-manager.js';
import { ProfileManager } from '../src/identity/profile-manager.js';
import { AnnouncementManager } from '../src/announcement/announcement-manager.js';

describe('Phase 1 Core Logic', () => {
  let identityManager: IdentityManager;

  beforeEach(() => {
    identityManager = new IdentityManager();
  });

  it('should create valid sessions', () => {
    const session = identityManager.createPendingSession('test_sess');
    expect(session.id).toBe('test_sess');
    expect(session.status).toBe('pending');
  });

  it('should validate usernames correctly', () => {
    expect(identityManager.validateUsername('user123')).toBeNull();
    expect(identityManager.validateUsername('a')).not.toBeNull();
  });
});
