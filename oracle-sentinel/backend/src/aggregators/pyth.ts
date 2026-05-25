// Pyth Oracle Feed Aggregator
import { Connection, PublicKey } from '@solana/web3.js';
import { PythConnection } from '@pythnetwork/client';
import { OraclePrice } from '../types';

export class PythAggregator {
  private connection: Connection;
  private feeds: Map<string, string> = new Map(); // feed_id -> feed_name
  private lastPrices: Map<string, number> = new Map();

  constructor(
    private rpcUrl: string,
    private pythProgramId: string,
  ) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async initialize() {
    // Initialize Pyth feeds mapping
    this.feeds.set(
      'dd08f0a40e21ce42178b25bdd9461a2beebccbaa2a781a6e02b323576c4072ab',
      'STOXX50_ETF/EUR'
    );
    this.feeds.set(
      'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b',
      'EUR/USD'
    );
    this.feeds.set(
      'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
      'SOL/USD'
    );
  }

  /**
   * Fetch current price for a specific feed (mock data for development)
   */
  async fetchPrice(feedId: string): Promise<OraclePrice | null> {
    try {
      // Generate deterministic mock prices based on time for testing
      const now = Date.now();
      const timeFactor = (now % 60000) / 60000; // 0-1 over 60s
      
      // Create realistic price variations
      const basePrices: { [key: string]: number } = {
        'dd08f0a40e21ce42178b25bdd9461a2beebccbaa2a781a6e02b323576c4072ab': 4800,
        'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b': 1.08,
        'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d': 145.2,
      };

      const basePrice = basePrices[feedId] || 100;
      const variation = Math.sin(timeFactor * Math.PI * 2) * (basePrice * 0.001);
      const price = basePrice + variation;
      
      // Store for comparison
      const lastPrice = this.lastPrices.get(feedId) || price;
      this.lastPrices.set(feedId, price);

      return {
        feed_id: feedId,
        feed_name: this.feeds.get(feedId) || 'Unknown',
        source: 'pyth',
        price,
        price_e6: BigInt(Math.floor(price * 1e6)),
        confidence: 0.95,
        timestamp: new Date(),
        is_stale: false,
        max_age_seconds: Math.random() * 5, // 0-5 seconds old
      };
    } catch (error) {
      console.error(`Error fetching Pyth price for ${feedId}:`, error);
      return null;
    }
  }

  /**
   * Fetch all registered feed prices
   */
  async fetchAllPrices(): Promise<OraclePrice[]> {
    const prices: OraclePrice[] = [];

    for (const feedId of this.feeds.keys()) {
      const price = await this.fetchPrice(feedId);
      if (price) {
        prices.push(price);
      }
    }

    return prices;
  }

  /**
   * Subscribe to real-time price updates
   */
  subscribeToUpdates(
    feedId: string,
    callback: (price: OraclePrice) => void,
    intervalMs: number = 5000
  ): NodeJS.Timer {
    return setInterval(async () => {
      const price = await this.fetchPrice(feedId);
      if (price) {
        callback(price);
      }
    }, intervalMs);
  }

  /**
   * Get composite price (for 3-leg STOXX50/SOL = (leg1 × leg2) ÷ leg3)
   */
  async fetchCompositePrice(): Promise<{
    composite_price: number;
    component_prices: OraclePrice[];
    confidence: number;
  } | null> {
    const leg1 = await this.fetchPrice(
      'dd08f0a40e21ce42178b25bdd9461a2beebccbaa2a781a6e02b323576c4072ab'
    ); // STOXX50/EUR
    const leg2 = await this.fetchPrice(
      'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b'
    ); // EUR/USD
    const leg3 = await this.fetchPrice(
      'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
    ); // SOL/USD

    if (!leg1 || !leg2 || !leg3) {
      return null;
    }

    // (STOXX50/EUR × EUR/USD) ÷ SOL/USD = STOXX50/SOL
    const composite_price = (leg1.price * leg2.price) / leg3.price;

    // Confidence is minimum of all components
    const confidence = Math.min(leg1.confidence, leg2.confidence, leg3.confidence);

    return {
      composite_price,
      component_prices: [leg1, leg2, leg3],
      confidence,
    };
  }

  /**
   * Calculate confidence based on Pyth metadata
   */
  private calculateConfidenceFromPyth(): number {
    // Return fixed high confidence for mock data
    return 0.95;
  }

  /**
   * Register a new feed to track
   */
  registerFeed(feedId: string, feedName: string) {
    this.feeds.set(feedId, feedName);
  }

  /**
   * Get registered feeds
   */
  getRegisteredFeeds(): Array<{ feedId: string; feedName: string }> {
    return Array.from(this.feeds.entries()).map(([feedId, feedName]) => ({
      feedId,
      feedName,
    }));
  }
}

// Export factory
export async function createPythAggregator(
  rpcUrl: string,
  pythProgramId: string
): Promise<PythAggregator> {
  const aggregator = new PythAggregator(rpcUrl, pythProgramId);
  await aggregator.initialize();
  return aggregator;
}
