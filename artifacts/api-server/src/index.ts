import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachCrashWebSocket } from "./lib/games/crashGame";
import { attachSlidesWebSocket } from "./lib/games/slidesGame";
import { attachRoomsSocketIO } from "./lib/rooms/roomsSignaling";
import { initRaceScheduler } from "./lib/raceScheduler";
import { seedDefaultRoles } from "./routes/admin";
import { startChatBots } from "./lib/chatBots";
import { startCupsBots, backfillCupsBets } from "./lib/games/cupsBots";
import { loadPlatformSettings } from "./lib/platformSettings";
import { loadSiteSettingsCache } from "./lib/siteSettingsCache";
import { cleanupExpiredTokens } from "./middlewares/auth";
import { startPaymentExpiryWorker } from "./lib/paymentExpiry";
import { fixPopupCurrencyFormat } from "./lib/dataFixes";
import { seedAdminUser } from "./lib/seedAdmin";
import { seedCases } from "./lib/seedCases";
import { recoverRunningBattles } from "./routes/cases";
import { startGameRecoveryWorker, stopGameRecoveryWorker } from "./lib/gameRecovery";
import { startReconciliationWorker, stopReconciliationWorker } from "./lib/reconciliationWorker";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

attachCrashWebSocket(server);
attachSlidesWebSocket(server);
attachRoomsSocketIO(server);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

loadPlatformSettings().then(() => {
  console.log("[Platform] Settings loaded from database");
  startPaymentExpiryWorker();
  // Race scheduler MUST start after platform settings have been loaded from
  // the DB. Otherwise awardRacePrizes would read the in-memory defaults
  // (raceBots.enabled = false) and could pay real users even though the
  // persisted setting has bots enabled (which means "no payouts").
  initRaceScheduler().catch(err => console.error("[Race] Scheduler init error:", err));
}).catch(err => {
  console.error("[Platform] Settings load error:", err);
  // Fail safe: if settings load failed, do NOT start the race scheduler at
  // all. We would rather miss this week's payout than risk crediting users
  // while bots may have been enabled in the persisted config.
  console.error("[Race] Scheduler not started because platform settings failed to load");
});
loadSiteSettingsCache().catch(err => console.error("[SiteSettings] Cache load error:", err));
seedDefaultRoles().catch(err => console.error("[Roles] Seed error:", err));
seedAdminUser().catch(err => console.error("[SeedAdmin] Error:", err));
seedCases().then(() => recoverRunningBattles()).catch(err => console.error("[SeedCases] Error:", err));
startChatBots().catch(err => console.error("[ChatBots] Init error:", err));
startCupsBots();
backfillCupsBets().catch(err => logger.error({ err }, "[cups-bots] backfill failed"));
fixPopupCurrencyFormat().catch(err => console.error("[DataFix] Popup currency error:", err));
startGameRecoveryWorker();
startReconciliationWorker();

const cleanupInterval = setInterval(() => {
  cleanupExpiredTokens()
    .then(count => { if (count > 0) logger.info({ count }, "[TokenBlacklist] Cleaned up expired entries"); })
    .catch(err => logger.error({ err }, "[TokenBlacklist] Cleanup error"));
}, 60 * 60 * 1000);

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Received shutdown signal, closing server...");
  clearInterval(cleanupInterval);
  stopGameRecoveryWorker();
  stopReconciliationWorker();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
