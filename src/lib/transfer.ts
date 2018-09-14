import {RadarRelay, LocalAccount, BaseAccount} from '@radarrelay/sdk';
import {promisify} from 'es6-promisify';
import colors = require('colors/safe');
import {BigNumber} from 'bignumber.js';
import {Balances} from "./balances";

export class Transfers<T extends BaseAccount> {

  private _rr: RadarRelay<T>;
  private _prompt: any;

  constructor(rr: RadarRelay<T>, prompt: any) {
    this._rr = rr;
    this._prompt = promisify(prompt.get);
  }

  public async run() {
    console.log('\n------- TRANSFER -------');

    // Retrieving Balances
    // ---------------------------
    console.log(colors.green('\nRetrieving balances...\n'));
    const balances = await Balances.getAllTokenBalances(this._rr);
    Object.keys(balances).forEach((key) => {
      console.log(`\t${key}: ${colors.green(balances[key].amount)}`);
    });

    let ok = false;
    let recipientAddress, amount, token, tokenAddress;
    do {
      const transferPrompt = await this.optionsPrompt(balances);
      recipientAddress = transferPrompt.address;
      amount = transferPrompt.amount;
      token = transferPrompt.token;
      tokenAddress = balances[token].address;
      if (amount > balances[token].amount) {
        console.log(colors.red('Insufficient balance to transfer'));
      } else {
        ok = true
      }
    } while (!ok);

    console.log('Transferring: ', colors.green(amount)
      + ' ' + colors.green(token)
      + ' to ' + colors.green(recipientAddress));

    // Confirm
    // ---------------------------
    const transferAccepted = await this._prompt([{
      name: 'confirm',
      type: 'string',
      description: colors.cyan('Would you like to confirm? Y/N'),
      required: true,
      conform: value => {
        return /Y|N|y|n/.test(value);
      }
    }]);
    if (/Y|y/.test(transferAccepted.confirm)) {
      return await this.transferToken(token, recipientAddress, amount, balances);
    }
  }
  
  /**
   * Prompt for parameters required for token transfer
   *
   * @param {any} balances  map of tokens and balances
   */
  public async optionsPrompt(balances): Promise<any> {
    
    // Token, Address, & Amount
    // ---------------------------
    console.log(colors.green('\nChoose transfer options.'));
    return this._prompt([{
      name: 'token',
      type: 'string',
      default: 'WETH',
      message: 'Invalid token',
      description: colors.cyan('Enter Token'),
      required: true,
      conform: value => {
        return balances[value];
      }
    }, {
      name: 'address',
      type: 'string',
      message: 'Invalid address',
      description: colors.cyan('Enter Recipient Address'),
      required: true,
      conform: value => {
        return (/^(0x){1}[0-9a-fA-F]{40}$/i.test(value));
      }
    }, {
      name: 'amount',
      type: 'number',
      description: colors.cyan(`Enter token amount`),
      required: true,
      message: 'Invalid number',
      conform: value => {
        return /\d+/.test(value)
      }
    }]);

  }
  
  /**
   * Transfer token functionality
   * 
   * @param {string} token
   * @param {string} recipientAddress
   * @param {string} amount    amount as string to be converted to BigNumber
   * @param {any}    balances  map of tokens and balances 
   */
  private async transferToken(token: string, recipientAddress: string, amount: string, balances: any) {
    let hash;
    if (token === 'ETH') {
      hash = await this._rr.account.transferEthAsync(recipientAddress, new BigNumber(amount));
    } else {
      hash = await this._rr.account.transferTokenAsync(balances[token].address, recipientAddress, new BigNumber(amount));
    }
    console.log("\nDone, " + colors.cyan(`tx: ${hash}`));
  }
}
