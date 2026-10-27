/**
 * Cancel storefront orders still awaiting review after ORDER_REVIEW_HOURS and
 * release their reserved stock (ADR-025). The checkout and the admin order
 * list already do this opportunistically; schedule this (e.g. every 15
 * minutes) so stock is released even when nobody uses either.
 *
 *   npm run orders:expire
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { expireOverdueOrders } from "../src/server/modules/orders/orders.service";

try {
  let total = 0;
  for (;;) {
    const expired = await expireOverdueOrders(100);
    total += expired;
    if (expired < 100) break;
  }
  console.info(`Expired ${total} overdue order(s).`);
} finally {
  await db.$disconnect();
}
