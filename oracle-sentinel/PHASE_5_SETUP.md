# Phase 5: Dashboard & UI - Project Setup Guide

**Phase**: 5 of 5 (Final Phase)  
**Duration**: Weeks 8-10  
**Status**: Initialization  
**Start Date**: May 26, 2026

---

## 🎯 Project Vision

Build a **futuristic, cutting-edge dashboard** for Oracle Sentinel that:
- Displays real-time oracle prices, confidence scores, and anomalies
- Monitors manipulation detection and outage predictions
- Manages webhooks and alerts with intuitive UI
- Features glassmorphism, neon accents, and sci-fi aesthetics
- Delivers exceptional UX with real-time data visualization
- **NOT a template** - completely custom and purpose-built

---

## 📁 Project Structure

```
frontend/
├── public/
│   ├── icons/
│   ├── logos/
│   └── images/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with providers
│   │   ├── page.tsx            # Dashboard home
│   │   ├── api/                # API routes
│   │   ├── auth/               # Authentication pages
│   │   ├── webhooks/           # Webhook management
│   │   ├── alerts/             # Alert center
│   │   └── feeds/              # Individual feed pages
│   │
│   ├── components/
│   │   ├── dashboard/          # Dashboard-specific
│   │   │   ├── PriceCard.tsx
│   │   │   ├── ConfidenceGauge.tsx
│   │   │   ├── AnomalyTimeline.tsx
│   │   │   ├── CrossProtocolAnalysis.tsx
│   │   │   ├── ValidatorHealthMatrix.tsx
│   │   │   └── RealTimeChart.tsx
│   │   │
│   │   ├── layout/             # Layout components
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Navigation.tsx
│   │   │   └── Footer.tsx
│   │   │
│   │   ├── ui/                 # Base UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── Skeleton.tsx
│   │   │
│   │   ├── alerts/             # Alert components
│   │   │   ├── AlertBanner.tsx
│   │   │   ├── AlertNotification.tsx
│   │   │   └── AlertHistory.tsx
│   │   │
│   │   └── webhooks/           # Webhook UI
│   │       ├── WebhookForm.tsx
│   │       ├── WebhookList.tsx
│   │       ├── DeliveryLogs.tsx
│   │       └── WebhookStats.tsx
│   │
│   ├── hooks/
│   │   ├── usePrices.ts        # Real-time prices
│   │   ├── useConfidence.ts    # Confidence scores
│   │   ├── useAnomalies.ts     # Anomaly detection
│   │   ├── useWebhooks.ts      # Webhook management
│   │   ├── useAuth.ts          # Authentication
│   │   └── useWebSocket.ts     # WebSocket connection
│   │
│   ├── lib/
│   │   ├── api.ts              # API client
│   │   ├── socket.ts           # WebSocket manager
│   │   ├── auth.ts             # Auth utils
│   │   ├── formatting.ts       # Number/date formatting
│   │   ├── colors.ts           # Color utilities
│   │   └── cn.ts               # Class name merger
│   │
│   ├── context/
│   │   ├── AuthContext.tsx     # Authentication state
│   │   ├── ThemeContext.tsx    # Dark mode
│   │   └── AppContext.tsx      # Global app state
│   │
│   ├── styles/
│   │   ├── globals.css         # Global styles
│   │   ├── variables.css       # CSS variables from brand.md
│   │   ├── animations.css      # Custom animations
│   │   └── tailwind.config.ts  # Tailwind configuration
│   │
│   ├── types/
│   │   ├── api.ts              # API response types
│   │   ├── oracle.ts           # Oracle types
│   │   ├── webhook.ts          # Webhook types
│   │   └── ui.ts               # UI component types
│   │
│   └── utils/
│       ├── validators.ts       # Form validation
│       ├── calculators.ts      # Calculation utilities
│       └── constants.ts        # App constants
│
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── pnpm-lock.yaml
└── README.md
```

---

## 🛠️ Tech Stack

### Core
- **Framework**: Next.js 14+ (App Router)
- **Runtime**: Node.js 20+
- **Language**: TypeScript 5+
- **Package Manager**: pnpm

### Styling & UI
- **CSS Framework**: Tailwind CSS 3.4+
- **Component Library**: shadcn/ui
- **Icons**: Lucide React
- **Animations**: Framer Motion

### Data & State
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Real-time**: Socket.io client
- **API Client**: Axios / Fetch API

### Data Visualization
- **Charts**: Recharts (primary)
- **Fallback**: Chart.js
- **Time-series**: Custom components

### Authentication
- **JWT**: jsonwebtoken
- **Storage**: localStorage + secure cookies
- **Provider**: Custom JWT flow

### Testing & Quality
- **Testing**: Vitest + React Testing Library
- **Linting**: ESLint + TypeScript strict mode
- **Formatting**: Prettier
- **Git Hooks**: husky + lint-staged

---

## 📋 Setup Instructions

### 1. Create Project Structure
```bash
cd c:/Users/Admin/toly\ percolator/oracle-sentinel
mkdir frontend
cd frontend
```

### 2. Initialize Next.js Project
```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --no-git \
  --no-eslint \
  --import-alias '@/*'
```

### 3. Install Dependencies
```bash
pnpm add \
  socket.io-client \
  zustand \
  @tanstack/react-query \
  axios \
  framer-motion \
  recharts \
  lucide-react \
  clsx \
  tailwind-merge \
  date-fns \
  @radix-ui/react-*
```

### 4. Install Dev Dependencies
```bash
pnpm add -D \
  @types/node \
  @types/react \
  @types/react-dom \
  @tailwindcss/forms \
  @tailwindcss/typography \
  tailwindcss-animated \
  autoprefixer \
  postcss \
  vitest \
  @testing-library/react \
  @testing-library/jest-dom \
  eslint \
  eslint-config-next \
  prettier \
  typescript-eslint
```

### 5. Copy Brand Design System
```bash
cp ../brand.md ./public/docs/brand.md
```

---

## 🎨 Design System Implementation

### CSS Variables (styles/variables.css)
```css
:root {
  /* Colors from brand.md */
  --color-apex: #00D9FF;
  --color-apex-hover: #00E9FF;
  --color-sentinel: #7C3AED;
  --color-void: #0A0E27;
  --color-neon: #FF006E;
  --color-teal: #14B8A6;
  --color-warning: #F59E0B;
  
  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  
  /* Border Radius */
  --radius-sm: 0.5rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.1);
  --shadow-glow: 0 0 20px rgba(0, 217, 255, 0.3);
}
```

### Tailwind Configuration
```typescript
// tailwind.config.ts
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        apex: {
          50: '#E0FFFF',
          500: '#00D9FF',
          600: '#00B8D4',
        },
        sentinel: {
          500: '#7C3AED',
          600: '#6D28D9',
        },
        void: '#0A0E27',
      },
      backgroundImage: {
        'gradient-apex': 'linear-gradient(135deg, #00D9FF 0%, #00B8D4 100%)',
        'gradient-sentinel': 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan-line': 'scanLine 3s linear infinite',
      },
    },
  },
};
```

---

## 🚀 Development Workflow

### 1. Start Development Server
```bash
pnpm dev
# http://localhost:3000
```

### 2. Build Components
Create reusable, typed components following shadcn/ui patterns

### 3. Implement Features (In Order)
1. **Authentication** → Login, token refresh
2. **Dashboard Layout** → Sidebar, header, navigation
3. **Real-time Connection** → WebSocket to backend
4. **Price Cards** → Display live prices
5. **Confidence Gauges** → Visual score representation
6. **Charts** → Price history visualization
7. **Anomaly Timeline** → Alert visualization
8. **Cross-Protocol Analysis** → Multi-source comparison
9. **Webhook Management** → CRUD interface
10. **Alert Center** → Notification hub

### 4. Testing
```bash
pnpm test              # Run tests
pnpm test --watch      # Watch mode
pnpm build             # Full build test
```

---

## 📱 Key Pages

### Dashboard (/)
- Real-time price overview
- Confidence scores
- Recent anomalies
- Quick stats

### Feeds (/feeds/:feedId)
- Detailed feed analysis
- Price history chart
- Anomaly timeline
- Cross-protocol data
- Validator metrics

### Webhooks (/webhooks)
- List all webhooks
- Create/edit webhooks
- View delivery logs
- Webhook statistics

### Alerts (/alerts)
- Alert notification center
- Filter by severity
- Mark as read/archive
- Acknowledge critical alerts

### Settings (/settings)
- API key management
- Preferences
- Theme selection
- Profile

---

## 🔒 Security Considerations

1. **JWT Storage**: localStorage (consider secure cookie)
2. **Token Refresh**: Auto-refresh before expiry
3. **HTTPS Only**: Enforce in production
4. **CSP Headers**: Content Security Policy
5. **CORS**: Proper CORS configuration on backend

---

## 🎬 Animation Framework

### Entrance Animations
- Fade-in + slide-up on page load
- Staggered list animations
- Modal transitions

### Micro-interactions
- Button hover/press states
- Form input focus effects
- Real-time data pulse effects

### Real-time Updates
- Smooth number transitions
- Color transition on confidence change
- Notification slide-in/out

---

## 📊 Performance Targets

- **First Contentful Paint (FCP)**: < 2 seconds
- **Largest Contentful Paint (LCP)**: < 3 seconds
- **Time to Interactive (TTI)**: < 4 seconds
- **Cumulative Layout Shift (CLS)**: < 0.1
- **Bundle Size**: < 250KB gzipped

---

## 🧪 Quality Checklist

- [ ] All TypeScript types strict mode
- [ ] Unit tests for utilities (>80% coverage)
- [ ] Integration tests for API calls
- [ ] Accessibility (WCAG 2.1 AA)
- [ ] Mobile responsive (320px - 2560px)
- [ ] Dark mode fully implemented
- [ ] Performance optimized (Lighthouse 90+)
- [ ] SEO metadata complete
- [ ] Error boundaries implemented
- [ ] Loading states consistent

---

## 🚢 Deployment Checklist

- [ ] Environment variables configured
- [ ] API endpoint URLs correct
- [ ] SSL certificate ready
- [ ] CDN configured for static assets
- [ ] Database migrations run
- [ ] WebSocket connection tested
- [ ] Error tracking setup (Sentry)
- [ ] Analytics enabled (PostHog)
- [ ] Rate limiting active
- [ ] Backup strategy in place

---

## 📚 Documentation Requirements

- [ ] Component library documentation
- [ ] API integration guide
- [ ] Deployment guide
- [ ] User manual
- [ ] Architecture overview
- [ ] Troubleshooting guide

---

**Next Step**: Run `create-next-app` and start building the most beautiful oracle dashboard ever created! 🚀
