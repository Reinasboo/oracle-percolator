// Switchboard Oracle Feed Aggregator (Fallback)
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { OraclePrice } from '../types';

export class SwitchboardAggregator {
  private connection: Connection;
  private feeds: Map<string, { address: string; name: string }> = new Map();

  constructor(
    private rpcUrl: string,
    private switchboardProgramId: string,
  ) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async initialize() {
    // Register Switchboard feed addresses
    this.feeds.set('stoxx50_eur', {
      address: 'your_switchboard_stoxx50_eur_address',
      name: 'STOXX50/EUR',
    });
    this.feeds.set('eur_usd', {
      address: 'your_switchboard_eur_usd_address',
      name: 'EUR/USD',
    });
    this.feeds.set('sol_usd', {
      address: 'your_switchboard_sol_usd_address',
      name: 'SOL/USD',
    });
  }

  /**
   * Fetch current price from Switchboard
   */
  async fetchPrice(feedKey: string): Promise<OraclePrice | null> {
    try {
      const feed = this.feeds.get(feedKey);
      if (!feed) {
        console.warn(`Feed ${feedKey} not registered`);
        return null;
      }

      // Fetch via Switchboard RPC
      const feedAccount = await this.connection.getAccountInfo(
        new PublicKey(feed.address)
      );

      if (!feedAccount) {
        return null;
      }

      // Parse Switchboard aggregator account (simplified)
      const price = this.parseSwitchboardPrice(feedAccount.data);
      const confidence = this.calculateSwitchboardConfidence(feedAccount.data);
      const staleSeconds = this.calculateStaleness(feedAccount.data);

      return {
        feed_id: feedKey,
        feed_name: feed.name,
        source: 'switchboard',
        price,
        price_e6: BigInt(Math.floor(price * 1e6)),
        confidence,
        timestamp: new Date(),
        is_stale: staleSeconds > 30,
        max_age_seconds: staleSeconds,
      };
    } catch (error) {
      console.error(`Error fetching Switchboard price for ${feedKey}:`, error);
      return null;
    }
  }

  /**
   * Fetch all registered prices
   */
  async fetchAllPrices(): Promise<OraclePrice[]> {
    const prices: OraclePrice[] = [];

    for (const feedKey of this.feeds.keys()) {
      const price = await this.fetchPrice(feedKey);
      if (price) {
        prices.push(price);
      }
    }

    return prices;
  }

  /**
   * Parse price from Switchboard account data
   * (Simplified - actual Switchboard data layout is more complex)
   */
  private parseSwitchboardPrice(data: Buffer): number {
    try {
      // Switchboard V2 aggregator state is typically:
      // offset 0: discriminator (8 bytes)
      // offset 8: latest result (f64, 8 bytes)
      // offset 16: etc.

      const offset = 8; // After discriminator
      const buffer = data.slice(offset, offset + 8);
      const price = buffer.readDoubleLE(0);

      return Math.abs(price); // Ensure positive
    } catch {
      return 0;
    }
  }

  /**
   * Calculate confidence from Switchboard metadata
   */
  private calculateSwitchboardConfidence(data: Buffer): number {
    try {
      // Switchboard provides multiple observations
      // Higher number of oracle nodes agreeing = higher confidence

      // Simplified: check num_observations
      const observationCount = data[48] || 0; // Estimated offset
      const maxObservations = 20;

      const confidence = Math.min(1, observationCount / maxObservations);
      return Math.max(0.5, confidence); // Min 50% confidence
    } catch {
      return 0.7;
    }
  }

  /**
   * Calculate staleness in seconds
   */
  private calculateStaleness(data: Buffer): number {
    try {
      // Parse timestamp from Switchboard data
      const timestampOffset = 24;
      const buffer = data.slice(timestampOffset, timestampOffset + 8);
      const timestamp = Number(buffer.readBigUInt64LE(0));

      const ageSeconds = (Date.now() / 1000) - timestamp;
      return Math.max(0, ageSeconds);
    } catch {
      return 60; // Assume 1 minute old if parse fails
    }
  }

  /**
   * Register a new feed
   */
  registerFeed(feedKey: string, address: string, name: string) {
    this.feeds.set(feedKey, { address, name });
  }

  /**
   * Get registered feeds
   */
  getRegisteredFeeds(): Array<{ feedKey: string; address: string; name: string }> {
    return Array.from(this.feeds.entries()).map(([feedKey, { address, name }]) => ({
      feedKey,
      address,
      name,
    }));
  }
}

// Export factory
export async function createSwitchboardAggregator(
  rpcUrl: string,
  switchboardProgramId: string
): Promise<SwitchboardAggregator> {
  const aggregator = new SwitchboardAggregator(rpcUrl, switchboardProgramId);
  await aggregator.initialize();
  return aggregator;
}
