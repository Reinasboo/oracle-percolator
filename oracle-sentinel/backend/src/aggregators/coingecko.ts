// CoinGecko Price Aggregator (Off-chain Reference)
import axios from 'axios';
import { OraclePrice } from '../types';

export class CoinGeckoAggregator {
  private baseUrl = 'https://api.coingecko.com/api/v3';
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private cacheTtlMs = 60000; // 60 second cache
  private feeds: Map<string, { coinId: string; vsCurrency: string; name: string }> =
    new Map();

  constructor(private apiKey?: string) {}

  async initialize() {
    // Register feed mappings
    this.feeds.set('stoxx50', {
      coinId: 'stoxx-europe-600',
      vsCurrency: 'eur',
      name: 'STOXX50/EUR',
    });
    this.feeds.set('eur_usd', {
      coinId: 'euro',
      vsCurrency: 'usd',
      name: 'EUR/USD',
    });
    this.feeds.set('sol', {
      coinId: 'solana',
      vsCurrency: 'usd',
      name: 'SOL/USD',
    });
  }

  /**
   * Fetch current price from CoinGecko
   */
  async fetchPrice(feedKey: string): Promise<OraclePrice | null> {
    try {
      const feed = this.feeds.get(feedKey);
      if (!feed) {
        console.warn(`Feed ${feedKey} not registered`);
        return null;
      }

      // Check cache first
      const cached = this.priceCache.get(feedKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
        return this.createOraclePrice(
          feedKey,
          feed.name,
          cached.price,
          0.85 // Cached prices have lower confidence
        );
      }

      // Fetch from CoinGecko
      const price = await this.fetchFromCoinGecko(feed.coinId, feed.vsCurrency);

      if (price > 0) {
        // Cache the result
        this.priceCache.set(feedKey, {
          price,
          timestamp: Date.now(),
        });

        return this.createOraclePrice(feedKey, feed.name, price, 0.9);
      }

      return null;
    } catch (error) {
      console.error(`Error fetching CoinGecko price for ${feedKey}:`, error);
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
   * Fetch price from CoinGecko API
   */
  private async fetchFromCoinGecko(coinId: string, vsCurrency: string): Promise<number> {
    try {
      const params = {
        ids: coinId,
        vs_currencies: vsCurrency,
        include_market_cap: true,
        include_24hr_vol: true,
        include_last_updated_at: true,
      };

      // Add API key if available
      if (this.apiKey) {
        (params as any).x_cg_pro_api_key = this.apiKey;
      }

      const response = await axios.get(`${this.baseUrl}/simple/price`, { params });

      const priceData = response.data[coinId];
      if (!priceData) {
        return 0;
      }

      return priceData[vsCurrency] || 0;
    } catch (error) {
      console.error(`CoinGecko API error for ${coinId}:`, error);
      return 0;
    }
  }

  /**
   * Get historical price data for analysis
   */
  async fetchHistoricalPrices(
    feedKey: string,
    days: number = 30
  ): Promise<Array<{ timestamp: Date; price: number }>> {
    try {
      const feed = this.feeds.get(feedKey);
      if (!feed) {
        return [];
      }

      const params = {
        id: feed.coinId,
        vs_currency: feed.vsCurrency,
        days: days.toString(),
        interval: 'daily',
      };

      if (this.apiKey) {
        (params as any).x_cg_pro_api_key = this.apiKey;
      }

      const response = await axios.get(
        `${this.baseUrl}/coins/${feed.coinId}/market_chart`,
        { params }
      );

      return response.data.prices.map(([timestamp, price]: [number, number]) => ({
        timestamp: new Date(timestamp),
        price,
      }));
    } catch (error) {
      console.error(`Error fetching historical prices for ${feedKey}:`, error);
      return [];
    }
  }

  /**
   * Get market data (market cap, volume, etc.)
   */
  async getMarketData(feedKey: string): Promise<{
    market_cap: number;
    volume_24h: number;
    price_change_24h_pct: number;
  } | null> {
    try {
      const feed = this.feeds.get(feedKey);
      if (!feed) {
        return null;
      }

      const params = {
        id: feed.coinId,
        localization: false,
      };

      if (this.apiKey) {
        (params as any).x_cg_pro_api_key = this.apiKey;
      }

      const response = await axios.get(`${this.baseUrl}/coins/${feed.coinId}`, { params });

      const data = response.data.market_data;

      return {
        market_cap: data.market_cap?.[feed.vsCurrency] || 0,
        volume_24h: data.total_volume?.[feed.vsCurrency] || 0,
        price_change_24h_pct: data.price_change_percentage_24h || 0,
      };
    } catch (error) {
      console.error(`Error fetching market data for ${feedKey}:`, error);
      return null;
    }
  }

  /**
   * Register a new feed
   */
  registerFeed(feedKey: string, coinId: string, vsCurrency: string, name: string) {
    this.feeds.set(feedKey, { coinId, vsCurrency, name });
  }

  /**
   * Get registered feeds
   */
  getRegisteredFeeds(): Array<{ feedKey: string; coinId: string; vsCurrency: string; name: string }> {
    return Array.from(this.feeds.entries()).map(([feedKey, { coinId, vsCurrency, name }]) => ({
      feedKey,
      coinId,
      vsCurrency,
      name,
    }));
  }

  /**
   * Helper: Create OraclePrice object
   */
  private createOraclePrice(
    feedId: string,
    feedName: string,
    price: number,
    confidence: number
  ): OraclePrice {
    return {
      feed_id: feedId,
      feed_name: feedName,
      source: 'coingecko',
      price,
      price_e6: BigInt(Math.floor(price * 1e6)),
      confidence,
      timestamp: new Date(),
      is_stale: false,
      max_age_seconds: 0,
    };
  }
}

// Export factory
export async function createCoinGeckoAggregator(apiKey?: string): Promise<CoinGeckoAggregator> {
  const aggregator = new CoinGeckoAggregator(apiKey);
  await aggregator.initialize();
  return aggregator;
}
