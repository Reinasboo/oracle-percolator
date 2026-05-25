# Phase 4: API & Webhooks - Complete Integration Guide

## Overview
Phase 4 implements production-ready webhook infrastructure with authentication, rate limiting, and multi-destination support. Real-time oracle events trigger webhook deliveries to Discord, Telegram, Slack, and HTTP endpoints.

## Architecture

### Components
1. **WebhookManager** - Lifecycle management, event routing, retry logic, persistence
2. **Rate Limiter** - Token bucket algorithm, per-endpoint/global limits
3. **JWT Auth** - Access token + refresh token generation, role-based permissions
4. **API Endpoints** - 12 REST endpoints for webhook management and authentication

### Event Flow
```
Data Collection Loop
  ↓
  Event Generated (price_updated, anomaly_detected, etc.)
  ↓
  WebhookManager.dispatchEvent()
  ↓
  Filter Matching Webhooks
  ↓
  Format Payload (Discord/Telegram/Slack/HTTP)
  ↓
  Queue Delivery
  ↓
  Exponential Backoff Retry
  ↓
  Log to PostgreSQL
```

## API Reference

### Authentication

#### 1. Login (Generate Tokens)
```
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com"
}

Response 200:
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

**Token Details**:
- Access Token: Expires in 1 hour (configurable)
- Refresh Token: Expires in 7 days (configurable)
- Algorithm: HS256
- Default Secret: Change in production via `JWT_ACCESS_SECRET` env var

#### 2. Refresh Token
```
POST /auth/refresh
Authorization: Bearer <refreshToken>

Response 200:
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### Webhook Management

#### 3. Create Webhook
```
POST /api/webhooks
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "url": "https://api.example.com/webhook",
  "destination": "http|discord|telegram|slack",
  "events": ["price_updated", "anomaly_detected"],
  "filters": {
    "feed_id": "SOL/USDC",
    "severity": ["critical", "warning"]
  },
  "format": "json",
  "name": "SOL Price Alerts",
  "rate_limit_per_minute": 60,
  "max_retries": 3,
  "timeout_ms": 5000
}

Response 201:
{
  "webhookId": "wh_1234567890",
  "message": "Webhook created"
}
```

**Destination Types**:
- `http`: Raw HTTP POST to your endpoint
- `discord`: Discord webhook embed format
- `telegram`: Telegram bot message format
- `slack`: Slack message attachment format

**Supported Events**:
- `price_updated`: Sent every 5 seconds when price changes
- `anomaly_detected`: When price anomaly detected
- `manipulation_detected`: When oracle manipulation pattern detected
- `spec_violation`: When Percolator spec violated
- `outage_warning`: When outage probability > 50%
- `test`: Manual test event

**Filter Options**:
```json
{
  "feed_id": "SOL/USDC|ETH/USDC",
  "severity": ["critical", "warning", "info"],
  "source": "pyth|switchboard|dex|coingecko",
  "min_confidence": 0.8,
  "include_events": ["price_updated", "anomaly_detected"]
}
```

#### 4. List Webhooks
```
GET /api/webhooks
Authorization: Bearer <accessToken>

Response 200:
[
  {
    "id": "wh_1234567890",
    "url": "https://api.example.com/webhook",
    "destination": "discord",
    "events": ["price_updated", "anomaly_detected"],
    "filters": {...},
    "created_at": "2026-05-26T10:00:00Z",
    "status": "active",
    "deliveries_total": 1250,
    "deliveries_failed": 3,
    "last_delivery_at": "2026-05-26T10:30:00Z"
  },
  ...
]
```

#### 5. Delete Webhook
```
DELETE /api/webhooks/:webhookId
Authorization: Bearer <accessToken>

Response 200:
{
  "success": true,
  "message": "Webhook deleted"
}
```

#### 6. Webhook Delivery History
```
GET /api/webhooks/:webhookId/history?limit=50
Authorization: Bearer <accessToken>

Response 200:
[
  {
    "id": "del_1234567890",
    "webhook_id": "wh_1234567890",
    "event_type": "price_updated",
    "status": "delivered",
    "http_status_code": 200,
    "timestamp": "2026-05-26T10:30:00Z",
    "response_time_ms": 145,
    "payload": {...}
  },
  ...
]
```

**Status Values**:
- `delivered`: HTTP 2xx response received
- `failed`: All retries exhausted
- `pending`: Queued for delivery
- `retry`: Currently retrying

#### 7. Webhook Statistics
```
GET /api/webhooks/:webhookId/stats
Authorization: Bearer <accessToken>

Response 200:
{
  "webhook_id": "wh_1234567890",
  "total_deliveries": 1250,
  "successful": 1247,
  "failed": 3,
  "pending": 0,
  "success_rate": "99.76%",
  "last_delivery": "2026-05-26T10:30:00Z",
  "events_subscribed": ["price_updated", "anomaly_detected"]
}
```

#### 8. Test Webhook
```
POST /api/webhooks/:webhookId/test
Authorization: Bearer <accessToken>

Response 200:
{
  "success": true,
  "message": "Test event sent to webhook"
}
```

## Webhook Payload Examples

### HTTP/JSON Format
```json
{
  "event": "price_updated",
  "timestamp": "2026-05-26T10:30:00Z",
  "data": {
    "feed_id": "SOL/USDC",
    "feed_name": "Solana/USD",
    "price": 128.45,
    "source": "pyth",
    "confidence": 0.98,
    "timestamp": "2026-05-26T10:30:00Z"
  }
}
```

### Discord Format
```json
{
  "embeds": [
    {
      "title": "🚨 Anomaly Detected",
      "description": "Unusual price movement detected",
      "color": 16711680,
      "fields": [
        {
          "name": "Feed",
          "value": "SOL/USDC",
          "inline": true
        },
        {
          "name": "Price",
          "value": "$128.45",
          "inline": true
        },
        {
          "name": "Severity",
          "value": "WARNING",
          "inline": true
        },
        {
          "name": "Expected Range",
          "value": "$125-130",
          "inline": true
        }
      ],
      "footer": {
        "text": "Oracle Sentinel"
      },
      "timestamp": "2026-05-26T10:30:00Z"
    }
  ]
}
```

### Telegram Format
```json
{
  "text": "🚨 *Anomaly Detected*\n\n*Feed:* SOL/USDC\n*Price:* $128.45\n*Severity:* WARNING\n*Expected:* $125-130\n\n_Oracle Sentinel_",
  "parse_mode": "Markdown"
}
```

### Slack Format
```json
{
  "attachments": [
    {
      "color": "danger",
      "title": "🚨 Anomaly Detected",
      "fields": [
        {
          "title": "Feed",
          "value": "SOL/USDC",
          "short": true
        },
        {
          "title": "Price",
          "value": "$128.45",
          "short": true
        },
        {
          "title": "Severity",
          "value": "WARNING",
          "short": true
        },
        {
          "title": "Expected",
          "value": "$125-130",
          "short": true
        }
      ],
      "footer": "Oracle Sentinel",
      "ts": 1685079000
    }
  ]
}
```

## Rate Limiting

### Default Limits
- **Global**: 100 requests/minute
- **Per User**: 60 requests/minute
- **Per Webhook**: 30 deliveries/minute
- **API Endpoints**: 120 requests/minute

### Rate Limit Headers
```
RateLimit-Limit: 100
RateLimit-Remaining: 87
RateLimit-Reset: 1685079060
```

### Rate Limit Response
```
HTTP 429 Too Many Requests

{
  "error": "Rate limit exceeded",
  "reset_at": "2026-05-26T10:31:00Z"
}
```

## Retry Strategy

### Exponential Backoff
```
Attempt 1: 1 second delay
Attempt 2: 2 second delay
Attempt 3: 4 second delay
```

### Retry Conditions
- HTTP 5xx errors (server error)
- Network timeouts
- Connection refused
- DNS resolution errors

### Non-Retryable Errors
- HTTP 4xx errors (except 408, 429)
- Invalid webhook URL
- JSON parsing errors

## Security

### Environment Variables
```bash
# JWT Configuration
JWT_ACCESS_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=7d

# API Configuration
API_KEY=your-api-key-here
WEBHOOK_BASE_URL=https://your-domain.com

# Database
DATABASE_URL=postgresql://oracle:sentinel@localhost:5432/oracle_sentinel

# Rate Limiting
RATE_LIMIT_GLOBAL=100
RATE_LIMIT_PER_USER=60
RATE_LIMIT_WEBHOOK=30
```

### Best Practices
1. **Change all secrets** in production
2. **Use HTTPS** for webhook URLs
3. **Rotate tokens** regularly
4. **Monitor delivery logs** for failures
5. **Implement webhook signature verification** (optional)
6. **Use strong API keys** (minimum 32 characters)
7. **Restrict webhook events** to necessary ones only

## Monitoring & Debugging

### Webhook Delivery Logs
View delivery logs for debugging:
```
GET /api/webhooks/:webhookId/history?limit=100
```

Common failure reasons:
- `timeout`: Webhook endpoint took >5 seconds to respond
- `connection_refused`: Server not reachable
- `invalid_response`: HTTP 4xx error
- `parse_error`: Invalid JSON in response
- `rate_limited`: Webhook temporarily disabled (too many failures)

### Health Checks
Monitor webhook health via statistics:
```
GET /api/webhooks/:webhookId/stats
```

Alert if:
- Success rate < 95%
- More than 3 failures in last hour
- No deliveries in last 5 minutes (for active webhooks)

## Integration Examples

### Node.js Express Server
```javascript
app.post('/webhook', (req, res) => {
  const { event, data } = req.body;
  console.log(`Event: ${event}`, data);
  
  // Process event
  if (event === 'anomaly_detected') {
    sendAlert(data);
  }
  
  // Acknowledge receipt
  res.status(200).json({ received: true });
});
```

### Discord Bot
```python
@app.route('/discord-webhook', methods=['POST'])
def discord_webhook():
    data = request.json
    # Forward to Discord webhook URL
    response = requests.post(
        DISCORD_WEBHOOK_URL,
        json=data
    )
    return {'status': response.status_code}
```

### Telegram Bot
```python
@app.route('/telegram-webhook', methods=['POST'])
def telegram_webhook():
    data = request.json
    bot.send_message(
        chat_id=CHAT_ID,
        text=data['text'],
        parse_mode=data['parse_mode']
    )
    return {'status': 'ok'}
```

## Testing

### Manual Testing
```bash
# Get access token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}' \
  | jq -r '.accessToken'

# Create webhook
curl -X POST http://localhost:3000/api/webhooks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/unique-id",
    "destination": "http",
    "events": ["price_updated"]
  }'

# Test webhook
curl -X POST http://localhost:3000/api/webhooks/<id>/test \
  -H "Authorization: Bearer <token>"

# View delivery history
curl -X GET http://localhost:3000/api/webhooks/<id>/history \
  -H "Authorization: Bearer <token>"
```

## Performance Metrics

### Expected Throughput
- **Price Updates**: 1000+ webhooks/second
- **Anomaly Events**: 100+ webhooks/second
- **Concurrent Deliveries**: 50 in-flight requests

### Database Schema
```sql
-- Webhooks table
CREATE TABLE webhooks (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255),
  url VARCHAR(2048),
  destination VARCHAR(50),
  events JSONB,
  filters JSONB,
  status VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Webhook delivery logs
CREATE TABLE webhook_delivery_logs (
  id UUID PRIMARY KEY,
  webhook_id UUID REFERENCES webhooks(id),
  event_type VARCHAR(100),
  payload JSONB,
  http_status_code INTEGER,
  response_time_ms INTEGER,
  status VARCHAR(50),
  retry_count INTEGER,
  created_at TIMESTAMP
);
```

## Troubleshooting

### Webhooks Not Delivering
1. Check webhook URL is accessible from server
2. Verify firewall rules allow outbound connections
3. Check delivery history for error messages
4. Ensure webhook is not rate limited
5. Test manually: `POST /api/webhooks/:id/test`

### Authentication Failures
1. Verify JWT token not expired
2. Check `JWT_ACCESS_SECRET` matches between server instances
3. Try refreshing token: `POST /auth/refresh`
4. Check Authorization header format: `Authorization: Bearer <token>`

### Rate Limiting Issues
1. Check `RateLimit-Remaining` header
2. Wait until `RateLimit-Reset` time
3. Increase webhook `rate_limit_per_minute` if needed
4. Consider batching requests

---

**Version**: 4.0
**Last Updated**: May 26, 2026
**Status**: Production Ready
