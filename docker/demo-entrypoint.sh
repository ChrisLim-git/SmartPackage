#!/bin/sh
# Brings an empty database up to a usable state, then hands over to the server.
# Both steps are re-runnable: migrations are tracked, and the seed never
# overwrites an existing row, so a restart against a live volume is a no-op.
set -e

: "${DATABASE_URL:?DATABASE_URL is required}"

echo "demo: waiting for the database..."
until node -e "
const { Client } = require('pg')
const client = new Client({ connectionString: process.env.DATABASE_URL })
client.connect().then(() => client.end()).catch(() => process.exit(1))
" 2>/dev/null; do
  sleep 1
done

echo "demo: migrating..."
pnpm db:migrate

echo "demo: seeding..."
pnpm db:seed

echo "demo: starting on port ${PORT:-3000}"
exec "$@"
