# Oracle Sentinel 🔍
## Oracle Intelligence & Manipulation Detection System for Solana Percolator

Oracle Sentinel is a sophisticated real-time oracle monitoring and intelligence platform that detects price manipulation, validates oracle accuracy, and provides confidence scoring for on-chain perpetual futures trading on Solana.

**Status**: Phase 1 Complete (Core Infrastructure & Data Aggregation)

---

## 🎯 Key Features

### Data Aggregation
- **Multi-source Oracle Integration**
  - Pyth Network (primary oracle)
  - Switchboard (fallback oracle)
  - DEX liquidity prices (Orca)
  - CoinGecko API (off-chain reference)

### Anomaly Detection
- **Z-Score Statistical Detection**: Identifies extreme price deviations
- **Sharp Movement Detection**: Flags rapid price changes
- **Staleness Detection**: Monitors oracle feed latency
- **Multi-Source Disagreement**: Cross-protocol validation
- **Composite Scoring**: Combines multiple detection methods

### Confidence Scoring
- Real-time confidence calculations
- Validator health tracking
- Cross-protocol consistency analysis
- Formal specification validation (Percolator invariants)

### Real-Time Monitoring
- WebSocket live updates
- REST API for queries
- Alert system with severity levels
- Audit trail for all events

---

## 📋 Prerequisites

- **Node.js** 18+
- **Docker** (for InfluxDB, PostgreSQL, Redis)
- **Solana RPC endpoint** (mainnet-beta)
- **Pyth oracle access**

---

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd oracle-sentinel/backend
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start Infrastructure (Docker)

```bash
cd ..
docker-compose up -d
```

This starts:
- InfluxDB (time-series data)
- PostgreSQL (persistent storage)
- Redis (caching)

### 4. Run Server

```bash
cd backend
npm run dev
```

Server will start on `http://localhost:3000`

### 5. Check Health

```bash
curl http://localhost:3000/health
```

---

## 📚 API Reference

### Prices

**GET /api/prices**
```bash
curl http://localhost:3000/api/prices
```
Response:
```json
[
  {
    "feed_id": "dd08f0a40...",
    "feed_name": "STOXX50_ETF/EUR",
    "source": "pyth",
    "price": 5432.10,
    "confidence": 0.92,
    "timestamp": "2024-05-25T10:30:00Z",
    "is_stale": false
  }
]
```

**GET /api/prices/:feedId**
```bash
curl http://localhost:3000/api/prices/dd08f0a40...
```

### Confidence Scores

**GET /api/confidence**
```bash
curl http://localhost:3000/api/confidence
```
Response:
```json
[
  {
    "feed_id": "dd08f0a40...",
    "confidence": 0.92
  }
]
```

### Anomalies

**GET /api/anomalies?hours=24**
```bash
curl "http://localhost:3000/api/anomalies?hours=24"
```
Response:
```json
[
  {
    "anomaly_id": "uuid",
    "feed_id": "dd08f0a40...",
    "feed_name": "STOXX50_ETF/EUR",
    "method": "zscore",
    "expected_price": 5430.00,
    "actual_price": 5150.00,
    "deviation_pct": -5.17,
    "deviation_sigma": -3.2,
    "severity": "alert",
    "is_manipulation": false,
    "likely_cause": "Extreme deviation: 3.2σ",
    "recommendation": "Reduce leverage, increase monitoring",
    "detected_at": "2024-05-25T10:30:00Z"
  }
]
```

### Price History

**GET /api/history/:feedId?timeRange=60**
```bash
curl "http://localhost:3000/api/history/dd08f0a40...?timeRange=60"
```

### Composite Price (STOXX50/SOL)

**GET /api/composite/stoxx50-sol**
```bash
curl http://localhost:3000/api/composite/stoxx50-sol
```
Response:
```json
{
  "composite_price": 100.50,
  "components": [
    { "feed_name": "STOXX50_ETF/EUR", "price": 5432.10 },
    { "feed_name": "EUR/USD", "price": 1.08 },
    { "feed_name": "SOL/USD", "price": 152.30 }
  ],
  "confidence": 0.89
}
```

---

## 🔌 WebSocket Events

Connect to `ws://localhost:3000`:

```javascript
const socket = io('http://localhost:3000');

// Receive initial state
socket.on('initial_state', (data) => {
  console.log('Prices:', data.prices);
  console.log('Anomalies:', data.anomalies);
  console.log('Confidence:', data.confidence);
});

// Real-time price updates
socket.on('price_update', (data) => {
  console.log(`${data.feed_id}: ${data.price} (confidence: ${data.confidence})`);
});

// Anomaly alerts
socket.on('anomaly_detected', (anomaly) => {
  console.log(`⚠️ ${anomaly.feed_name}: ${anomaly.likely_cause}`);
});
```

---

## 📊 Project Structure

```
oracle-sentinel/
├── backend/
│   ├── src/
│   │   ├── aggregators/        # Data source connectors
│   │   │   ├── pyth.ts         # Pyth oracle
│   │   │   ├── switchboard.ts  # Switchboard oracle
│   │   │   ├── dex.ts          # DEX prices (Orca)
│   │   │   └── coingecko.ts    # CoinGecko reference
│   │   ├── detection/          # Anomaly & manipulation detection
│   │   │   ├── anomaly.ts      # Statistical detector
│   │   │   ├── formal-verify.ts # Spec validation
│   │   │   ├── manipulation.ts # Manipulation scorer
│   │   │   └── outage.ts       # Outage predictor
│   │   ├── scoring/            # Confidence scoring
│   │   │   ├── confidence.ts
│   │   │   └── validator-health.ts
│   │   ├── storage/            # Database layer
│   │   │   ├── influxdb.ts     # Time-series DB
│   │   │   └── postgres.ts     # Persistent storage
│   │   ├── api/                # REST & WebSocket API
│   │   │   └── routes.ts
│   │   ├── types.ts            # TypeScript types/schemas
│   │   └── index.ts            # Entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # React dashboard (Phase 5)
├── docker-compose.yml          # Infrastructure
└── README.md
```

---

## 🔍 Detection Methods

### 1. Z-Score Anomaly Detection
Identifies prices that deviate significantly from historical mean:
```
Z-score = (current_price - mean) / stddev
Alert if |Z| > 3.0 (99.7% confidence)
```

### 2. Sharp Movement Detection
Flags rapid price changes:
```
Movement% = |price_current - price_previous| / price_previous
Alert if > 5% in <10 seconds
```

### 3. Staleness Detection
Monitors oracle update frequency:
```
Alert if price.timestamp > 25 seconds old (Pyth max_age)
```

### 4. Multi-Source Disagreement
Cross-protocol consistency check:
```
max_deviation = (max_price - min_price) / avg_price
Alert if > 2% across Pyth, Switchboard, DEX, CoinGecko
```

### 5. Formal Verification
Validates prices against Percolator spec invariants:
```
- satisfies_bounds: Price within realistic range
- satisfies_continuity: No discontinuous jumps
- satisfies_staleness: Within acceptable age
```

---

## 📈 Confidence Scoring Algorithm

```
overall_confidence = 
  0.35 × pyth_confidence
  + 0.25 × switchboard_confidence
  + 0.20 × dex_consistency
  + 0.20 × cross_protocol_agreement

Penalties:
  - Stale price: -20%
  - Validator issues: -10% per validator
  - Cross-protocol disagreement: -15%

Final score: clipped to [0, 1]
```

---

## 🔄 Data Flow

```
┌─── Pyth ────┐
│  Switchboard│ ───┐
│  DEX (Orca) │    │
│  CoinGecko  │    │
└─────────────┘    │
                   ▼
           Data Aggregation (every 5s)
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
     InfluxDB            Anomaly Detection
   (time-series)         (Z-score, movement)
        │                     │
        ├─────────────┬───────┘
        │             │
        ▼             ▼
    PostgreSQL   Confidence Scoring
  (persistent)    (multi-source)
        │             │
        └─────────────┴────────┐
                               ▼
                       WebSocket/REST API
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
                  Users    Dashboards  Alerts
```

---

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Run Specific Test
```bash
npm test -- anomaly.test.ts
```

### Coverage
```bash
npm test -- --coverage
```

---

## 🚨 Alert Severity Levels

| Level | Z-Score | Action | Use Case |
|-------|---------|--------|----------|
| **INFO** | < 2.0 | Log & monitor | Normal anomalies |
| **WARNING** | 2.0-3.0 | Notify keepers | Watch closely |
| **ALERT** | 3.0-5.0 | Reduce leverage | Likely issue |
| **CRITICAL** | > 5.0 | Pause liquidations | Probable manipulation |

---

## 🔐 Security

### Threat Model
- **Oracle manipulation**: Detected via multi-source comparison
- **Feed outage**: Staleness detection + validator monitoring
- **Validator compromise**: Cross-oracle validation
- **Price injection**: Z-score bounds checking

### Mitigations
- ✅ Multi-source aggregation (not dependent on single oracle)
- ✅ Formal spec validation (Percolator invariants)
- ✅ Confidence scoring with component breakdown
- ✅ Immutable audit trail (PostgreSQL)
- ✅ Real-time alerting (WebSocket)

---

## 📊 Monitoring Dashboard (Phase 5)

The frontend dashboard will include:

- **Real-time price charts** (Pyth, Switchboard, DEX, CoinGecko overlay)
- **Confidence gauge** (visual indicator of oracle trust)
- **Anomaly timeline** (historical events with severity)
- **Cross-protocol comparison** table
- **Validator health matrix**
- **Alert history** (searchable, filterable)
- **Research data exporter** (CSV, Parquet)

---

## 🛠️ Development

### Build
```bash
npm run build
```

### Dev Server (with hot reload)
```bash
npm run dev
```

### Lint
```bash
npm run lint
```

---

## 📋 Roadmap

- ✅ **Phase 1**: Core infrastructure (aggregators, storage)
- ⏳ **Phase 2**: Detection engine (anomaly, manipulation, outage)
- ⏳ **Phase 3**: Confidence scoring (multi-source, Percolator integration)
- ⏳ **Phase 4**: API & webhooks (REST, WebSocket, Discord/Telegram)
- ⏳ **Phase 5**: Dashboard & UI (React, real-time charts)

---

## 🤝 Integration with Percolator

Oracle Sentinel validates prices against Percolator specification:

```typescript
// Percolator spec checks:
- satisfies_bounds: Price ∈ [min, max] from spec
- satisfies_continuity: ΔPrice < max_jump
- satisfies_staleness: age < 25 seconds

// Flag price if violates spec
if (!spec_compliant) {
  confidence_score *= 0.5;
  alert(CRITICAL, "Price violates Percolator invariant");
}
```

---

## 📞 Support

- **Documentation**: See [ARCHITECTURE.md](../ARCHITECTURE.md)
- **Issues**: GitHub issues
- **Discord**: [Percolator Community](https://discord.gg/...)

---

## 📄 License

MIT

---

## 🙏 Acknowledgments

- Pyth Network for oracle data
- Solana ecosystem for chain data
- Percolator team for spec validation

---

**Built with ❤️ for Solana perpetual futures traders**
