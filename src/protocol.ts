import type { IWalletAccount, IWalletAccountReadOnly } from '@tetherto/wdk-wallet';
import type {
  BuyOptions,
  BuyResult,
  FiatQuote,
  FiatTransactionStatus,
  SellOptions,
  SupportedCountry,
  SupportedCryptoAsset,
  SupportedFiatCurrency,
} from '@tetherto/wdk-wallet/protocols';
import { FiatProtocol } from '@tetherto/wdk-wallet/protocols';
import { type CashCapabilities, type CashPayeeInput, type CurrencyType, createCashClient } from '@zkp2p/cash';
import BigNumber from 'bignumber.js';
import { PeerFiatError } from './errors.ts';
import type {
  PeerFiatConfig,
  PeerFiatQuote,
  PeerPayeeInput,
  PeerQuoteSellOptions,
  PeerSellOptions,
  PeerSellResult,
  PeerTransactionDetail,
} from './types.ts';

type WdkAccount = IWalletAccount | IWalletAccountReadOnly;

const DEFAULT_APP_URL = 'https://app.peer.xyz/cash';
const USDC_DECIMALS = 6;
const FIAT_DECIMALS = 2;

const FIAT_NAMES: Readonly<Record<string, string>> = {
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  EUR: 'Euro',
  GBP: 'Pound Sterling',
  IDR: 'Indonesian Rupiah',
  MXN: 'Mexican Peso',
  NZD: 'New Zealand Dollar',
  PHP: 'Philippine Peso',
  SGD: 'Singapore Dollar',
  TRY: 'Turkish Lira',
  USD: 'United States Dollar',
  ZAR: 'South African Rand',
};

export class PeerFiatProtocol extends FiatProtocol {
  private readonly client;
  private readonly appUrl: string;

  constructor(account?: WdkAccount, config: PeerFiatConfig = {}) {
    super(account);
    this.client = createCashClient({
      environment: config.environment ?? 'production',
      referralCode: config.referralCode,
      referrer: 'tether-wdk',
    });
    this.appUrl = PeerFiatProtocol.validateAppUrl(config.appUrl ?? DEFAULT_APP_URL);
  }

  async quoteBuy(_options: Omit<BuyOptions, 'recipient'>): Promise<FiatQuote> {
    throw new PeerFiatError('unsupported_operation', 'Peer Cash is an off-ramp and does not support fiat buys');
  }

  async buy(_options: BuyOptions): Promise<BuyResult> {
    throw new PeerFiatError('unsupported_operation', 'Peer Cash is an off-ramp and does not support fiat buys');
  }

  async quoteSell(options: PeerQuoteSellOptions): Promise<PeerFiatQuote> {
    const amount = PeerFiatProtocol.exactCryptoAmount(options);
    const capabilities = this.client.capabilities();
    PeerFiatProtocol.assertCryptoAsset(options.cryptoAsset);
    const currency = PeerFiatProtocol.resolveCurrency(capabilities, options.fiatCurrency);
    const platform = options.config?.platform;
    if (platform) {
      PeerFiatProtocol.assertPlatformCurrency(capabilities, platform, currency);
    }
    const estimate = await this.client.estimate(
      { amount, currency, platform },
      { includeEta: options.config?.includeEta },
    );
    const fiatAmount = BigInt(
      new BigNumber(estimate.receiveAmount).shiftedBy(FIAT_DECIMALS).integerValue(BigNumber.ROUND_FLOOR).toFixed(0),
    );
    return {
      cryptoAmount: amount,
      fiatAmount,
      fee: 0n,
      rate: estimate.rate.toString(),
      metadata: {
        kind: estimate.kind,
        asOf: estimate.asOf,
        oracleUpdatedAt: estimate.oracleUpdatedAt,
        stale: estimate.stale,
        platform,
        receiveAmount: estimate.receiveAmount,
        eta: estimate.eta,
      },
    };
  }

  async sell(options: PeerSellOptions): Promise<PeerSellResult> {
    PeerFiatProtocol.assertCryptoAsset(options.cryptoAsset);
    const amount = PeerFiatProtocol.exactCryptoAmount(options);
    if (options.refundAddress) {
      throw new PeerFiatError(
        'invalid_argument',
        'Peer Cash returns withdrawals to the depositing wallet and does not support a separate refundAddress',
      );
    }
    const platform = options.config?.platform;
    const payee = options.config?.payee;
    if (platform === undefined && payee === undefined) {
      return { sellUrl: this.appUrl };
    }
    if (!platform || payee === undefined) {
      throw new PeerFiatError(
        'invalid_argument',
        'Set both config.platform and config.payee to prepare a cash-out, or omit both to use the Peer app',
      );
    }
    const capabilities = this.client.capabilities();
    const currency = PeerFiatProtocol.resolveCurrency(capabilities, options.fiatCurrency);
    PeerFiatProtocol.assertPlatformCurrency(capabilities, platform, currency);
    const prepared = await this.client.prepare({
      amount,
      receive: { platform, currency, payee: PeerFiatProtocol.toCashPayee(payee) },
    });
    return { sellUrl: this.appUrl, prepared };
  }

  async getTransactionDetail(txId: string): Promise<PeerTransactionDetail> {
    const order = await this.client.order(txId);
    const fiatCurrency = order.payouts?.find((payout) => payout.currency)?.currency ?? '';
    return {
      status: PeerFiatProtocol.toWdkStatus(order.state),
      cryptoAsset: 'usdc',
      fiatCurrency,
      metadata: { depositId: order.depositId, order },
    };
  }

  async getSupportedCryptoAssets(): Promise<SupportedCryptoAsset[]> {
    return [{ code: 'usdc', networkCode: 'base', decimals: USDC_DECIMALS, name: 'USD Coin' }];
  }

  async getSupportedFiatCurrencies(): Promise<SupportedFiatCurrency[]> {
    return this.client.capabilities().currencies.map((currency) => ({
      code: currency,
      decimals: FIAT_DECIMALS,
      name: FIAT_NAMES[currency] ?? currency,
    }));
  }

  async getSupportedCountries(): Promise<SupportedCountry[]> {
    return [];
  }

  private static validateAppUrl(value: string): string {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new PeerFiatError('invalid_argument', 'appUrl must use HTTPS');
    }
    return url.toString();
  }

  private static assertCryptoAsset(value: string): void {
    if (value.toLowerCase() !== 'usdc') {
      throw new PeerFiatError('unsupported_asset', 'Peer Cash supports Base USDC only');
    }
  }

  private static exactCryptoAmount(options: Pick<SellOptions, 'cryptoAmount' | 'fiatAmount'>): bigint {
    if (options.cryptoAmount === undefined) {
      throw new PeerFiatError(
        'unsupported_operation',
        'Peer Cash requires an exact Base USDC cryptoAmount; exact fiat targets are not supported',
      );
    }
    const amount = BigInt(options.cryptoAmount);
    if (amount <= 0n) {
      throw new PeerFiatError('invalid_argument', 'cryptoAmount must be a positive integer in USDC base units');
    }
    return amount;
  }

  private static resolveCurrency(capabilities: CashCapabilities, value: string): CurrencyType {
    const normalized = value.toUpperCase();
    const currency = capabilities.currencies.find((candidate) => candidate === normalized);
    if (!currency) {
      throw new PeerFiatError('unsupported_currency', `Peer Cash does not support ${value}`);
    }
    return currency;
  }

  private static assertPlatformCurrency(
    capabilities: CashCapabilities,
    platformName: string,
    currency: CurrencyType,
  ): void {
    const platform = capabilities.platforms.find((candidate) => candidate.platform === platformName);
    if (!platform?.currencies.includes(currency)) {
      throw new PeerFiatError('unsupported_platform', `Peer Cash does not support ${platformName}:${currency}`);
    }
  }

  private static toWdkStatus(state: string): FiatTransactionStatus {
    if (state === 'delivered') {
      return 'completed';
    }
    if (state === 'returned') {
      return 'failed';
    }
    return 'in_progress';
  }

  private static toCashPayee(payee: PeerPayeeInput): CashPayeeInput {
    return payee as CashPayeeInput;
  }
}
