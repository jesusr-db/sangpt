// Script to grant permissions to the app service principal
import { config } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env') });

import { getConnectionUrl } from '@chat-template/db';

async function main() {
  const { default: postgres } = await import('postgres');

  const spId = process.argv[2];
  if (!spId) {
    console.error('Usage: npx tsx scripts/grant-permissions.ts <service-principal-id>');
    process.exit(1);
  }

  console.log(`Granting permissions to service principal: ${spId}`);

  const url = await getConnectionUrl();
  const sql = postgres(url, { max: 1 });

  try {
    // Grant USAGE on schema
    console.log('Granting USAGE on schema ai_chatbot...');
    await sql.unsafe(`GRANT USAGE ON SCHEMA ai_chatbot TO "${spId}"`);

    // Grant all privileges on all tables in schema
    console.log('Granting ALL on all tables in ai_chatbot...');
    await sql.unsafe(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ai_chatbot TO "${spId}"`);

    // Grant all privileges on all sequences in schema
    console.log('Granting ALL on all sequences in ai_chatbot...');
    await sql.unsafe(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ai_chatbot TO "${spId}"`);

    // Set default privileges for future tables
    console.log('Setting default privileges for future tables...');
    await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA ai_chatbot GRANT ALL PRIVILEGES ON TABLES TO "${spId}"`);
    await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA ai_chatbot GRANT ALL PRIVILEGES ON SEQUENCES TO "${spId}"`);

    console.log('✅ Permissions granted successfully!');
  } catch (error) {
    console.error('❌ Error granting permissions:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
