# Oracle Sentinel

> Oracle Sentinel — Oracle Intelligence & Manipulation Detection for Percolator

Oracle Sentinel is a production-focused monitoring and intelligence system that aggregates multi-source oracle data, validates feeds against formal invariants, detects manipulation and anomalies, computes per-feed confidence scores, and provides real-time alerting and webhooks for downstream systems.

This repository contains the Oracle Sentinel backend and a demonstration frontend used for visualization and product demos. The system is built to be deployable in cloud environments and to integrate with on-chain systems such as Percolator.

---

## Table of contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [Quickstart (local development)](#quickstart-local-development)
- [Configuration & Environment](#configuration--environment)
- [Testing](#testing)
- [Deployment](#deployment)
- [Operational Notes](#operational-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features

- Multi-source aggregation: Pyth, Switchboard, DEX (Orca) price feeds, and CoinGecko.
- Formal verification: Percolator-spec validations (bounds, continuity, staleness).
- Anomaly & manipulation detection: z-score, sharp-movement detectors, and formal checks.
- Confidence scoring: Composite, component-level scores and reasoning.
- Outage prediction & validator health monitoring.
- Webhooks and WebSocket API for real-time notifications and integrations.
- Demo-ready frontend with realistic synthetic data and Vercel deployment config.

## Architecture

Oracle Sentinel is organized into modular layers:

- `backend/`: TypeScript Node service with collectors, processors, storage adapters, and API/websocket server.
  - `aggregators/`: adapters that fetch and normalize oracle sources.
  - `detection/`: anomaly, manipulation, and formal verification logic.
  - `scoring/`: confidence scoring and validator health analysis.
  - `storage/`: Postgres (persistent) and InfluxDB (time-series) adapters.
  - `webhooks/`: subscription manager and reliable dispatch.
- `frontend/`: React + Vite + Tailwind demo dashboard capable of connecting to the backend or running with a deterministic mock data generator for demos.
- `docker-compose.yml`: local stack (Postgres, InfluxDB, Redis) for development.

The code is structured for clear separation of concerns, testability, and production readiness.

## Quickstart (local development)

Prerequisites

- Node.js 18+ and pnpm
- Docker (optional, recommended for running Postgres/Influx locally)

Run the services locally (recommended)

1. Start infrastructure (from repository root):

```bash
cd oracle-sentinel
docker-compose up -d
```

2. Backend: install and run in development

```bash
cd oracle-sentinel/backend
pnpm install
cp .env.example .env
# Edit .env with your database and influx credentials
pnpm dev
```

3. Frontend (demo mode without backend)

```bash
cd oracle-sentinel/frontend
pnpm install
# Development demo (no backend required):
VITE_USE_MOCK=true pnpm dev
# Or connect to a running backend at http://localhost:3000 by leaving VITE_USE_MOCK unset
```

## Configuration & Environment

Critical environment variables (see `.env.example` in `backend/`):

- `PORT` — backend HTTP port (default 3000)
- `POSTGRES_URL` — Postgres connection string
- `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET` — InfluxDB config
- `REDIS_URL` — Redis URL (used for caching / dedupe)
- `JWT_SECRET` — JWT signing secret for API keys

For production, populate environment variables in your deployment platform (Vercel, Docker Compose, Kubernetes secrets, etc.).

## Testing

Unit tests are implemented with Vitest in the backend. To run tests:

```bash
cd oracle-sentinel/backend
pnpm install
pnpm test
```

The test suite includes formal verification tests, detection logic tests, and scoring unit tests.

## Deployment

Backend

- Docker: use the provided Dockerfile and the Compose file for local stacks. For production, containerize with your preferred registry and orchestrator.
- Kubernetes: use the Docker image and create deployments, statefulsets for Postgres/Influx as appropriate.

Frontend

- The frontend is a static site built with Vite. A Vercel configuration (`frontend/vercel.json`) is included for zero-configuration deploys. Set the environment variable `VITE_USE_MOCK=true` on the Vercel project to enable demo mode.

CI/CD

- Recommended: run the backend `pnpm build && pnpm test` and frontend `pnpm build` in CI on pull requests. Consider protecting `main` and requiring PR reviews and passing checks before merging.

## Operational Notes

- Observability: the service writes metrics to InfluxDB and persistent records to Postgres. Instrument additional metrics (Prometheus/OpenTelemetry) as needed.
- Webhook delivery: the webhook manager supports retries and backoff; ensure you configure delivery endpoints and timeouts.
- Security: rotate `JWT_SECRET`, secure Postgres with network restrictions, and enable TLS for external endpoints.

## Contributing

Contributions are welcome. Suggested workflow:

1. Fork the repository and create a feature branch.
2. Run tests locally and add unit tests for new logic.
3. Submit a pull request and request reviews.

Please follow the existing code style and add documentation for new public interfaces.

## License

The project is provided under the MIT License — see the LICENSE file in the repository root.

---

If you want, I can now:

1. Commit this README to `main` and push it to origin (I will add and commit only oracle-sentinel/README.md),
2. Create a PR template and CI workflow, or
3. Add branch protection rules (require PR reviews and status checks).

Which should I do next?
