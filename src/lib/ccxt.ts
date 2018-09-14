import ccxt = require('ccxt');
import fs = require('fs');

export class CCXT {

  private _conf;

  constructor(config) {
    this._conf = config;
  }

  /**
   * Retrieve ticker data from multiple
   * defined markets in the config
   * for a specified market
   *
   * @param {string}  market  in the format of ZRX/WETH
   */
  public async getMarketTicker(market: string) {
    const marketExchanges = await this.getOrCacheMarketExchanges(market);
    
    let tExchanges = marketExchanges.length;
    let data = {
      bid: 0,
      ask: 0,
      bidSize: 0,
      askSize: 0 
    };
    for (const exchange of marketExchanges) {
      const exchangeInstance = new ccxt[exchange]();
      
      try {
        const ticker = await exchangeInstance.fetchTicker(market);
        // averaging.. TODO weighted by size?
        data.bid = data.bid + ticker.bid; // + (ticker.bid * (ticker.bidVolume || 1));
        data.ask = data.ask + ticker.ask; // + (ticker.ask * (ticker.askVolume || 1));
        data.bidSize = data.bidSize + (ticker.bidVolume || 1);
        data.askSize = data.askSize + (ticker.askVolume || 1);
      } catch(err) {
        tExchanges -= 1;
      }
    }

    return {
      bid : data.bid / tExchanges,
      ask : data.ask / tExchanges,
      bidSize : data.bidSize,
      askSize : data.askSize,
      confidence: ((tExchanges / this._conf.exchanges.length) * 100)
    };
  }

  /**
   * Fetch all exchanges a market resides
   * on and cache the results if recently
   * retrieved.
   *
   * @param {string}  market  in the format of ZRX/WETH
   */
  public async getOrCacheMarketExchanges(market: string) {
    if (this._conf.markets) {
      return this._conf.markets[market];
    }
    const markets = await this.cacheMarketExchanges();
    return markets[market];
  }

  /**
   * Retrieves all markets for each
   * exchange defined in the config
   * and caches the results in a
   * hidden file
   */
  public async cacheMarketExchanges() {
    
    // index all exchange markets
    const indexedMarkets = {};
    for(const exchange of this._conf.exchanges) {
      try {
        const exchangeInstance = new ccxt[exchange]();
        const markets = await exchangeInstance.fetchMarkets();
        for(const market of markets) {
          if (market.symbol.indexOf('/ETH') < 0) continue;
          if (typeof(indexedMarkets[market.symbol]) === 'undefined') {
            indexedMarkets[market.symbol] = [];
          }
          indexedMarkets[market.symbol].push(exchange);
        }
      } catch (err) {
        console.log(err);
      }
    }

    // write to cache
    // TODO need to append / update markets key in cache?
    fs.writeFileSync(`./.cache`, JSON.stringify({markets: indexedMarkets}));

    return indexedMarkets;
  }
  
}