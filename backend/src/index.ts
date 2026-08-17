import { createApp } from './app.js';
import { initDatabase, runSeed } from './db/init.js';
import { config } from './config.js';

async function main() {
  await initDatabase();
  await runSeed();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`SPARSH API listening on http://localhost:${config.port}`);
  });
}

main().catch((e) => {
  console.error('Failed to start server', e);
  process.exit(1);
});
