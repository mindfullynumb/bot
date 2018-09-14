import {SdkManager, RadarRelay} from '@radarrelay/sdk';
import {promisify} from 'es6-promisify';
import BigNumber from 'bignumber.js';

// CLI dependencies
import program = require('commander');
import prompt = require('prompt');
import colors = require('colors/safe');

// Libs
import {getConfig, walletExists, checkGasPrice} from './helpers';
import {Balances, Transfers, CCXT} from './lib';

// Strategies
// NOTE: import additional strategies here
import {BasicMakerStrategy} from './strategies';

// ---- Setup ---- //
console.log('-----------------------------------------');
console.log('         📡  Radar Relay Bot  📡          ');
console.log('-----------------------------------------');

// Get config
const config = getConfig();

// Handle errors
process.on('unhandledRejection', (reason, p) => {
  const message = reason.message ? reason.message.split('\n')[0] : reason;
  if (message !== 'canceled') {
    console.error(colors.red(message));
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
    process.exit(0);
  }
});


// Setup prompt
const getPrompt = promisify(prompt.get);
prompt.start();

// Init CCXT
const ccxt = new CCXT(config);

// App logic
(async () => {

  // Get password
  const passPrompt = await getPrompt([{
    name: 'password',
    description: colors.green("Enter wallet password"),
    default: config.wallet && config.wallet.password,
    hidden: true,
    replace: '*',
    required: true
  }]);
  
  // Async check gas price
  checkGasPrice(config.gasPrice);

  console.log(colors.green('Connecting to Ethereum...'));
  const exists = walletExists();

  // Setup Radar SDK
  const rr = SdkManager.Setup({
    wallet: {
      password: passPrompt.password
    },
    sdkInitializationTimeoutMs: config.sdkInitializationTimeoutMs || 30000,
    dataRpcUrl: config.dataRpcUrl,
    defaultGasPrice: new BigNumber(config.gasPrice),
    radarRestEndpoint: config.radarRelayRestEndpoint,
    radarWebsocketEndpoint: config.radarRelayWebSocketEndpoint
  });

  // Listen for loading event
  rr.events.on('loading', data => {
    process.stdout.write('...');
    if (data.progress === 100) {
      process.stdout.write('🚀\n');
    }
  });

  // Initialize SDK
  await SdkManager.InitializeAsync(rr);
  
  // Display Seed
  if (!exists) {
    console.log('\n\nWallet Created. Please write down your seed phrase: ');
    console.log(colors.cyan(await rr.account.exportSeedPhraseAsync(passPrompt.password)));
  }
  
  // Check for ETH
  let curEthBal = await rr.account.getEthBalanceAsync();
  if (curEthBal.lte(0)) {
    console.log(colors.yellow("\n" + `ETH is required to run this bot, send ETH to your address ${rr.account.address}`));
    process.stdout.write('Waiting for ETH...');
    while(curEthBal.lte(0)) {
      curEthBal = await rr.account.getEthBalanceAsync();
      process.stdout.write('...');
      await new Promise(resolve => {setTimeout(resolve, 3000)});
    }
    console.log(colors.green(`${curEthBal.toNumber()} ETH received!`));
  }
  
  // NOTE: Additional Strategies can 
  // be added to the bot menu here.
  // ------------------------------------

  // Prompt options menu
  // TODO make this more dynamic
  const optionsPrompt = async function() {
    console.log('');
    console.log(colors.green('\nWhat do you want to do?'));
    const selected = await getPrompt([{
      name: 'option',
      type: 'number',
      description: (colors.magenta("[1] view balances, ") +
                    colors.cyan("[2] transfer tokens, ") +
                    colors.blue("[3] run bot, ") +
                    colors.red("[4] bye.")),
      default: '1',
      required: true,
      conform: value => {
        return /[1-4]/.test(value);
      }
    }]);

    // Selected option logic
    switch(selected.option) {

      // Balances
      case 1:
        const balances = new Balances(rr);
        await balances.run();
        break;

      // Transfer
      case 2:
        const transfers = new Transfers(rr, prompt);
        await transfers.run();
        break;

      // Basic Maker Strategy
      case 3:
        const bot = new BasicMakerStrategy(rr, prompt, ccxt, config);
        await bot.run();
        break;

      // Exit
      case 4:
        process.exit(0);
        break;
    }

    // Try again?
    await optionsPrompt();
  };

   await optionsPrompt();
})();
