import { MetaManager } from "../src/meta-manager.js";

const manager = new MetaManager();
const userId = "550e8400-e29b-41d4-a716-446655440000";

const grant = manager.grantReward(userId, "genesis_supporter", "title", "admin");
console.log("Grant:", grant.rewardId, grant.type, grant.source);

const order = manager.createMarketOrder(userId, "AAPL", 10, "185.5");
console.log("Order:", order.itemId, order.quantity, order.total);

const ticket = manager.createSupportTicket(userId, "Balance Issue", "My balance is not updating.");
console.log("Ticket:", ticket.subject, ticket.status);
