# Backend file guide

This guide explains the folders and files in `backend/`. For setup, API examples, and database columns, see [README.md](README.md).

**Start reading here:** `server.js` starts the API, `app.js` sets it up, and `routes/index.js` connects URLs to controllers. Controllers call services, and services use models to read or save data.

## Main folder

| File | What it does |
| --- | --- |
| [README.md](README.md) | Explains how the application works, its API, database, Redis, SQS, and current limits. |
| [FILE_GUIDE.md](FILE_GUIDE.md) | This folder-by-folder and file-by-file explanation. |
| [Frontend API flow](README.md#frontend-api-flow) | README section showing how the website calls the API, with a booking diagram, request examples, and failure handling. |
| [package.json](package.json) | Lists backend libraries and commands such as `start`, `test`, and `db:migrate`. |
| [package-lock.json](package-lock.json) | Records exact dependency versions so installs can be repeated consistently. |
| [.env.example](.env.example) | A template for database, Redis, API, and SQS settings. Copy it to `.env`. |
| `.env` | Your private local settings. It is ignored by Git; do not commit it. |
| [compose.yaml](compose.yaml) | Defines local PostgreSQL, Redis, and an optional LocalStack SQS emulator. |
| [Dockerfile](Dockerfile) | Packages backend code and dependencies into a container image. The API and notification worker can use this image with different commands. |
| [.dockerignore](.dockerignore) | Keeps local dependencies, secrets, and generated files out of the Docker build context. |
| [.gitignore](.gitignore) | Keeps local secrets, dependencies, logs, and generated files out of Git. |
| [.gitattributes](.gitattributes) | Keeps shell scripts using Linux-compatible line endings. |
| [.prettierrc.json](.prettierrc.json) | Sets code formatting preferences. |
| [.prettierignore](.prettierignore) | Lists files and folders the formatter should skip. |

## `src/`: the ride API

### Entry files

| File | What it does |
| --- | --- |
| [server.js](src/server.js) | Reads settings, prepares Redis/SQS and live updates, starts HTTP and WebSocket handling, and closes connections on shutdown. |
| [app.js](src/app.js) | Builds the Express application. Adds security headers, allowed browser origins, request logs, JSON parsing, routes, and error handling. Importing this file does not start a server. |

### `src/routes/`: API URLs

| File | What it does |
| --- | --- |
| [index.js](src/routes/index.js) | Connects health, driver, quote, and ride URLs to their handlers. Adds validation before ride actions and connects the controller to its service. |

### `src/controllers/`: requests and responses

| File | What it does |
| --- | --- |
| [ride.controller.js](src/controllers/ride.controller.js) | Reads validated request fields, calls booking services, and returns JSON with the correct HTTP status. Also handles quote and driver-list responses. It does not contain SQL. |

### `src/services/`: booking rules

| File | What it does |
| --- | --- |
| [ride.service.js](src/services/ride.service.js) | Creates and retrieves rides, recognizes retries by ride ID, and handles acceptance, cancellation, and completion. Uses database transactions and locks. Uses the driver cache and publishes WebSocket updates and SQS notifications after a successful save. |
| [ride-rules.js](src/services/ride-rules.js) | Defines allowed ride status changes and the fixed Economy/Comfort fare and arrival estimates. |

### `src/models/`: database queries

| File | What it does |
| --- | --- |
| [ride.model.js](src/models/ride.model.js) | Runs SQL to find rides, check active bookings, lock records, insert a booking, assign a driver, and update status. |
| [rider.model.js](src/models/rider.model.js) | Reads a rider's saved email for notification jobs, without adding it to public ride responses. |
| [driver.model.js](src/models/driver.model.js) | Runs SQL to list drivers, lock a driver during assignment, and change availability. |

### `src/validators/`: input checks

| File | What it does |
| --- | --- |
| [ride.validator.js](src/validators/ride.validator.js) | Checks ride/rider/driver IDs, categories, pickup, and destination. Trims location text and rejects matching pickup/destination. |

### `src/middleware/`: shared request handling

| File | What it does |
| --- | --- |
| [validate.js](src/middleware/validate.js) | Collects input-check errors and returns `400` with the problem fields before the controller runs. |
| [error-handler.js](src/middleware/error-handler.js) | Returns consistent JSON errors for missing endpoints, invalid JSON, oversized bodies, known application errors, and unexpected failures. Hides internal database details from responses. |

### `src/config/`: application settings

| File | What it does |
| --- | --- |
| [env.js](src/config/env.js) | Reads and checks the ride database URL, API host/port, browser origins, and optional Redis URL. |

### `src/shared/`: common helpers

| File | What it does |
| --- | --- |
| [email.js](src/shared/email.js) | Checks and trims email addresses used by seeding, queue events, and the email sender. |
| [api-error.js](src/shared/api-error.js) | Defines an error with an HTTP status, error code, and readable message, such as a booking conflict. |

### `src/db/`: PostgreSQL connection and setup

| File | What it does |
| --- | --- |
| [pool.js](src/db/pool.js) | Creates the ride API's shared PostgreSQL connection pool with connection/query limits. |
| [transaction.js](src/db/transaction.js) | Runs related database work on one connection. Saves everything with `COMMIT`, or undoes it with `ROLLBACK` on failure. |
| [migrate.js](src/db/migrate.js) | The entrypoint for `npm run db:migrate`. Calls the migration runner and closes the database pool afterward. |
| [migration-runner.js](src/db/migration-runner.js) | Lists active ride migrations in order, records applied versions, skips completed ones, and locks migration runs to prevent conflicts. The notification migration command reuses this helper. |
| [seed.js](src/db/seed.js) | Adds the demo rider and three drivers. Keeps existing records and ride availability; can set/update the demo rider email from `DEMO_RIDER_EMAIL`. |

### `src/db/migrations/`: database structure changes

| File | What it does |
| --- | --- |
| [001_release.sql](src/db/migrations/001_release.sql) | Creates the complete ride schema directly: riders with optional email, drivers, rides with nullable retry columns, constraints, and indexes. |

### `src/cache/`: temporary driver data

| File | What it does |
| --- | --- |
| [driver-cache.js](src/cache/driver-cache.js) | Connects to Redis and reads, stores, or clears the five-second driver-list cache. Cache failures allow the API to use PostgreSQL instead. |

### `src/realtime/`: live ride updates

| File | What it does |
| --- | --- |
| [ride-updates.js](src/realtime/ride-updates.js) | Shares ride-change signals locally and through Redis Pub/Sub. Redis connects API instances; the browser does not connect to Redis. |
| [ride-sockets.js](src/realtime/ride-sockets.js) | Accepts one browser WebSocket per watched ride, checks origins, sends current database snapshots and live updates, and cleans up dead connections. |

### `src/events/`: SQS messages

| File | What it does |
| --- | --- |
| [ride-events.js](src/events/ride-events.js) | Builds a small notification event from a saved ride. Reuses the same event ID for the same ride/status so retries do not create duplicate notifications. Logs send failures without failing the saved booking. |
| [sqs.js](src/events/sqs.js) | Creates the AWS SQS client and provides send, receive, and delete operations with time limits. Can use a local SQS emulator. |

### `src/workers/`: shared worker support

| File | What it does |
| --- | --- |
| [runtime.js](src/workers/runtime.js) | Repeatedly runs a background task, waits between failed or empty cycles, logs failures, and closes resources when the process stops. |

## `services/notifications/`: separate notification worker

This is a separately runnable background service, not the booking-rule layer in `src/services/`. It reads SQS and saves notification records. It sends email through Amazon SES when configured. Phone push and SMS are not implemented.

| File | What it does |
| --- | --- |
| [worker.js](services/notifications/worker.js) | Starts the notification worker with its own database, SQS client, and optional SES sender. |
| [consume.js](services/notifications/consume.js) | Receives messages, saves notifications, and deletes messages only after saving and any enabled email delivery succeed. Limits database work to five messages at once. Failed messages remain available for retry. |
| [store.js](services/notifications/store.js) | Checks event contents, chooses the notification text, and inserts it. Existing event IDs are skipped to avoid duplicate records. |
| [email.js](services/notifications/email.js) | Builds the four ride email messages and sends them through the SES API. Disabled when `SES_FROM_EMAIL` is empty. |
| [deliver-email.js](services/notifications/deliver-email.js) | Claims a notification for sending, records the SES result, skips completed deliveries, and leaves failed sends available for retry. |
| [database.js](services/notifications/database.js) | Creates a separate database pool from `NOTIFICATIONS_DATABASE_URL`. |
| [migrate.js](services/notifications/migrate.js) | Runs notification database updates and records them in `notification_migrations`. |
| [migrations/001_notifications.sql](services/notifications/migrations/001_notifications.sql) | Creates the `notifications.inbox` table and the index used to look up a rider's notification history. |

| [migrations/002_email_delivery.sql](services/notifications/migrations/002_email_delivery.sql) | Adds recipient and email-delivery fields to the existing notification table. |

## `infra/`: deployment and local broker setup

| File | What it does |
| --- | --- |
| [workers.cfn.json](infra/workers.cfn.json) | AWS CloudFormation template for SQS, a failed-message queue, API send permissions, notification workers, scaling, logs, and alarms. Needs existing network, cluster, image, and database settings; it is not a complete deployed environment. |
| [LocalStack.Dockerfile](infra/LocalStack.Dockerfile) | Builds the optional local SQS emulator image and includes its queue setup script. |
| [localstack-init.sh](infra/localstack-init.sh) | Creates the normal and failed-message queues inside the local emulator. It does not create AWS cloud resources. |

## `scripts/`: development commands

| File | What it does |
| --- | --- |
| [check.mjs](scripts/check.mjs) | Checks JavaScript syntax in `src/`, `services/`, and `tests/`. It does not start the API or connect to databases. |

## `tests/`: checks for expected behavior

| File | What it checks |
| --- | --- |
| [app.test.js](tests/app.test.js) | Invalid input, malformed JSON, quote responses, and browser access settings. |
| [realtime.test.js](tests/realtime.test.js) | Checks real WebSocket connections on a temporary local test server, snapshots, ride isolation, reconnects, Redis sharing with test doubles, and broadcasts after commit. |
| [env.test.js](tests/env.test.js) | Valid and invalid environment settings. |
| [driver-cache.test.js](tests/driver-cache.test.js) | Cache hits, failures, database fallback, shared reads, and clearing the cache after a saved ride change. |
| [email.test.js](tests/email.test.js) | Checks email contents, SES commands with a fake client, skipped recipients, failure retries, and duplicate protection. No real emails are sent. |
| [events.test.js](tests/events.test.js) | Sending only after a database commit, SQS failures, stable event IDs, duplicate handling, worker limits, and migration behavior. Uses test doubles instead of live SQS. |
| [infrastructure.test.js](tests/infrastructure.test.js) | Important settings in the AWS template, including queue protection, permissions, and worker configuration. Does not deploy or validate the stack through AWS. |
| [services/ride-rules.test.js](tests/services/ride-rules.test.js) | Allowed/rejected status changes and fixed fare calculations. |
| [services/ride-creation.test.js](tests/services/ride-creation.test.js) | Creating rides using `PUT`, safe retries, conflicting details, active-ride limits, and ID validation. |
| [integration/rides.test.js](tests/integration/rides.test.js) | Real PostgreSQL booking operations, simultaneous requests, driver assignment, and the HTTP booking flow. Requires `TEST_DATABASE_URL`. |
| [integration/events.test.js](tests/integration/events.test.js) | Real PostgreSQL migrations, repeated ride IDs, and notification inserts without duplicates. Requires `TEST_DATABASE_URL`. |
| [integration/redis.test.js](tests/integration/redis.test.js) | Cache storage, expiry, and deletion using real Redis. Requires `TEST_REDIS_URL`. |

| [integration/redis-live.test.js](tests/integration/redis-live.test.js) | Checks updates between two API update buses using real Redis. Uses a random channel and requires `TEST_REDIS_URL`. |

## Generated and local folders

`node_modules/` contains installed third-party libraries; do not edit or commit it. `coverage/` contains generated test coverage if requested. Any empty leftover folder has no role in the application. The React view lives outside this folder, in `frontend/`.
