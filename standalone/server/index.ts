import app from "./app";
import { logger } from "./lib/logger";
import { seedDefaultUser, ensureSuperAdmin, migrateUserRoles } from "./routes/auth";
import { ensureQuoteDispatchColumn } from "./lib/migrations/ensureQuoteDispatchColumn";
import { ensureProductCatalogMigration } from "./lib/migrations/ensureProductCatalogMigration";
import { ensureNotificationSettingsMigration } from "./lib/migrations/ensureNotificationSettingsMigration";
import { getSpeechService, resolveActiveSpeechProviderId } from "./lib/voice/speech/speechServiceFactory.ts";
import { startReminderScheduler } from "./lib/reminders/scheduler.ts";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const speech = getSpeechService();
  logger.info(
    {
      speechProvider: speech.name,
      configuredSpeech: resolveActiveSpeechProviderId(),
      speechAvailable: speech.isAvailable(),
    },
    "Voice speech provider ready",
  );

  await seedDefaultUser();
  await ensureSuperAdmin();
  await migrateUserRoles();
  await ensureQuoteDispatchColumn();
  await ensureProductCatalogMigration();
  await ensureNotificationSettingsMigration();
  startReminderScheduler();
});
