import type { CashCapabilities, CashEstimate, CashOrder, PrepareResult } from '@zkp2p/cash';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cash = vi.hoisted(() => ({
  capabilities: vi.fn(),
  estimate: vi.fn(),
  prepare: vi.fn(),
  order: vi.fn(),
}));

vi.mock('@zkp2p/cash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zkp2p/cash')>();
  return { ...actual, createCashClient: vi.fn(() => cash) };
});

import { PeerFiatError, PeerFiatProtocol } from '../src/index.ts';

const capabilities: CashCapabilities = {
  chainId: 8453,
  token: { address: '0x0000000000000000000000000000000000000001', symbol: 'USDC', decimals: 6 },
  environment: 'production',
  destination: {
    chainId: 8453,
    token: { address: '0x0000000000000000000000000000000000000001', symbol: 'USDC', decimals: 6 },
  },
  source: {
    default: {
      chainId: 8453,
      token: { address: '0x0000000000000000000000000000000000000001', symbol: 'USDC', decimals: 6 },
    },
  },
  platforms: [
    {
      platform: 'wise',
      currencies: ['EUR', 'USD'],
      payeeHint: 'Wisetag',
      requiresIdentityAttestation: false,
      requiresAtomicAccessPolicy: false,
    },
  ],
  currencies: ['EUR', 'USD'],
  amount: { min: 10_000n, recommendedMin: 1_000_000n, max: null },
  pricing: { kind: 'oracle-market-rate', spreadBps: 0 },
};

const estimate: CashEstimate = {
  kind: 'oracle-estimate',
  currency: 'EUR',
  amount: 10_000_000n,
  rate: 0.8765,
  receiveAmount: 8.765,
  asOf: 1_786_700_000,
  oracleUpdatedAt: 1_786_699_990,
};

const prepared: PrepareResult = {
  txs: [],
  steps: [],
  register: { hashedOnchainIds: ['0x01'] },
  accessPolicyRequired: false,
};

function order(state: CashOrder['state']): CashOrder {
  return {
    depositId: '0xescrow_7',
    state,
    fills: [],
    totalAmount: 10_000_000n,
    filledAmount: state === 'delivered' ? 10_000_000n : 0n,
    pendingAmount: 0n,
    returnedAmount: state === 'returned' ? 10_000_000n : 0n,
    nextActions: [],
    payouts: [
      {
        platform: 'wise',
        platformHash: '0xplatform',
        currency: 'EUR',
        currencyHash: '0xcurrency',
        payeeHash: '0xpayee',
        active: true,
        pricing: { marketRate: true },
      },
    ],
    isInFlight: state !== 'delivered' && state !== 'returned',
    explain: () => state,
  };
}

beforeEach(() => {
  cash.capabilities.mockReset().mockReturnValue(capabilities);
  cash.estimate.mockReset().mockResolvedValue(estimate);
  cash.prepare.mockReset().mockResolvedValue(prepared);
  cash.order.mockReset().mockResolvedValue(order('awaiting-buyer'));
});

describe('PeerFiatProtocol', () => {
  it('implements every IFiatProtocol method', () => {
    const protocol = new PeerFiatProtocol();
    for (const method of [
      'quoteBuy',
      'buy',
      'quoteSell',
      'sell',
      'getTransactionDetail',
      'getSupportedCryptoAssets',
      'getSupportedFiatCurrencies',
      'getSupportedCountries',
    ]) {
      expect(typeof protocol[method as keyof PeerFiatProtocol]).toBe('function');
    }
  });

  it('maps an oracle estimate onto the WDK quote shape', async () => {
    const protocol = new PeerFiatProtocol();
    const quote = await protocol.quoteSell({
      cryptoAsset: 'usdc',
      fiatCurrency: 'eur',
      cryptoAmount: 10_000_000n,
      config: { platform: 'wise', includeEta: true },
    });

    expect(quote).toEqual({
      cryptoAmount: 10_000_000n,
      fiatAmount: 876n,
      fee: 0n,
      rate: '0.8765',
      metadata: {
        kind: 'oracle-estimate',
        asOf: 1_786_700_000,
        oracleUpdatedAt: 1_786_699_990,
        stale: undefined,
        platform: 'wise',
        receiveAmount: 8.765,
        eta: undefined,
      },
    });
    expect(cash.estimate).toHaveBeenCalledWith(
      { amount: 10_000_000n, currency: 'EUR', platform: 'wise' },
      { includeEta: true },
    );
  });

  it('returns the Peer app when payout details are omitted', async () => {
    const protocol = new PeerFiatProtocol();

    await expect(
      protocol.sell({ cryptoAsset: 'usdc', fiatCurrency: 'USD', cryptoAmount: 1_000_000n }),
    ).resolves.toEqual({ sellUrl: 'https://app.peer.xyz/cash' });
    expect(cash.prepare).not.toHaveBeenCalled();
  });

  it('prepares unsigned transactions when payout details are supplied', async () => {
    const protocol = new PeerFiatProtocol();
    const result = await protocol.sell({
      cryptoAsset: 'usdc',
      fiatCurrency: 'EUR',
      cryptoAmount: 10_000_000n,
      config: { platform: 'wise', payee: '@alice' },
    });

    expect(result).toEqual({ sellUrl: 'https://app.peer.xyz/cash', prepared });
    expect(cash.prepare).toHaveBeenCalledWith({
      amount: 10_000_000n,
      receive: { platform: 'wise', currency: 'EUR', payee: '@alice' },
    });
  });

  it('rejects unsupported and ambiguous operations', async () => {
    const protocol = new PeerFiatProtocol();

    await expect(protocol.buy({ cryptoAsset: 'usdc', fiatCurrency: 'USD', fiatAmount: 100n })).rejects.toMatchObject({
      code: 'unsupported_operation',
    });
    await expect(
      protocol.quoteSell({ cryptoAsset: 'eth', fiatCurrency: 'USD', cryptoAmount: 1n }),
    ).rejects.toMatchObject({ code: 'unsupported_asset' });
    await expect(
      protocol.quoteSell({ cryptoAsset: 'usdc', fiatCurrency: 'USD', fiatAmount: 100n }),
    ).rejects.toMatchObject({ code: 'unsupported_operation' });
    await expect(
      protocol.sell({
        cryptoAsset: 'usdc',
        fiatCurrency: 'USD',
        cryptoAmount: 1_000_000n,
        refundAddress: '0xabc',
      }),
    ).rejects.toMatchObject({ code: 'invalid_argument' });
  });

  it('maps Peer order states onto WDK transaction states', async () => {
    const protocol = new PeerFiatProtocol();
    cash.order.mockResolvedValueOnce(order('delivered'));
    await expect(protocol.getTransactionDetail('0xescrow_7')).resolves.toMatchObject({
      status: 'completed',
      cryptoAsset: 'usdc',
      fiatCurrency: 'EUR',
    });
    cash.order.mockResolvedValueOnce(order('returned'));
    await expect(protocol.getTransactionDetail('0xescrow_7')).resolves.toMatchObject({ status: 'failed' });
    cash.order.mockResolvedValueOnce(order('matched'));
    await expect(protocol.getTransactionDetail('0xescrow_7')).resolves.toMatchObject({ status: 'in_progress' });
  });

  it('reports the precise supported surface', async () => {
    const protocol = new PeerFiatProtocol();

    await expect(protocol.getSupportedCryptoAssets()).resolves.toEqual([
      { code: 'usdc', networkCode: 'base', decimals: 6, name: 'USD Coin' },
    ]);
    await expect(protocol.getSupportedFiatCurrencies()).resolves.toEqual([
      { code: 'EUR', decimals: 2, name: 'Euro' },
      { code: 'USD', decimals: 2, name: 'United States Dollar' },
    ]);
    await expect(protocol.getSupportedCountries()).resolves.toEqual([]);
  });

  it('uses typed errors', () => {
    expect(() => new PeerFiatProtocol(undefined, { appUrl: 'http://example.com' })).toThrow(PeerFiatError);
    expect(() => new PeerFiatProtocol(undefined, { appUrl: 'ftp://localhost/cash' })).toThrow(PeerFiatError);
    expect(() => new PeerFiatProtocol(undefined, { appUrl: 'not a url' })).toThrow(PeerFiatError);
    expect(() => new PeerFiatProtocol(undefined, { appUrl: 'http://localhost:3000/cash' })).not.toThrow();
  });

  it('rejects unsafe numeric base-unit amounts with a typed error', async () => {
    const protocol = new PeerFiatProtocol();
    await expect(
      protocol.quoteSell({
        cryptoAsset: 'usdc',
        fiatCurrency: 'USD',
        cryptoAmount: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).rejects.toMatchObject({
      name: 'PeerFiatError',
      code: 'invalid_argument',
    });
  });
});
