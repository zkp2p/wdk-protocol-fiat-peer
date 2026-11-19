# wdk-protocol-fiat-peer

Peer Cash for Tether WDK. The module implements WDK's `IFiatProtocol` for cashing out Base USDC to supported fiat payment platforms at the live oracle rate.

Peer Cash is off-ramp only. `quoteBuy()` and `buy()` reject with a typed `unsupported_operation` error.

## Install

```sh
npm install wdk-protocol-fiat-peer@0.1.1
```

## Quote a cash-out

```ts
import PeerFiatProtocol from 'wdk-protocol-fiat-peer';

const fiat = new PeerFiatProtocol(account);

const quote = await fiat.quoteSell({
  cryptoAsset: 'usdc',
  fiatCurrency: 'EUR',
  cryptoAmount: 25_000_000n,
  config: { platform: 'revolut', includeEta: true },
});

quote.cryptoAmount;
quote.fiatAmount;
quote.rate;
quote.metadata;
```

Supply a positive `cryptoAmount` in Base USDC base units (six decimals). The adapter reports `fiatAmount` with two decimals for every supported currency and rounds down. Each buyer locks their oracle rate when they signal an intent.

## Prepare a cash-out

Supply a payout platform and payee to have `sell()` return unsigned transactions:

```ts
const result = await fiat.sell({
  cryptoAsset: 'usdc',
  fiatCurrency: 'EUR',
  cryptoAmount: 25_000_000n,
  config: {
    platform: 'revolut',
    payee: '@alice',
  },
});

for (const [index, transaction] of result.prepared?.txs.entries() ?? []) {
  console.log(result.prepared?.steps[index], transaction);
}
```

The published adapter pins `@zkp2p/cash@0.4.9`. Inspect the prepared result before signing anything. If `prepared.accessPolicyRequired` is true, use the hosted Peer cash-out flow instead: that plan depends on a retired group policy. For other plans, the host signs and submits the transactions in order, confirms each receipt, and passes the create-deposit receipt to `finalizePreparedCashout()` on a Cash 0.4.9 client to recover the deposit ID.

Some payout platforms require a pre-existing verified payee. For those platforms, a new bare handle returns the SDK's `PAYEE_VERIFICATION_REQUIRED` error; pass prepared curator payee data or complete verification in the Peer app.

If `config.platform` and `config.payee` are both omitted, `sell()` returns `https://app.peer.xyz/cash` as the standard WDK `sellUrl` and does not register a payee or prepare transactions.

## Resume an order

Use the composite Peer deposit ID as WDK's transaction ID:

```ts
const transaction = await fiat.getTransactionDetail(depositId);

transaction.status;
transaction.metadata.order;
```

Peer states map to WDK as follows:

- `delivered` → `completed`
- `returned` → `failed`
- all active states → `in_progress`

## Supported surface

- Asset: USDC on Base, 6 decimals
- Fiat currencies and payout platforms: from the bundled Cash version’s capability catalog
- Pricing: 0% protocol spread, oracle rate at intent signal
- Countries: Peer exposes availability by payout platform and currency rather than by country, so `getSupportedCountries()` returns an empty list instead of inventing a country gate
- Runtime: browser or Node.js 22+ (required by the Cash dependency)

## Configuration

```ts
const fiat = new PeerFiatProtocol(account, {
  environment: 'production',
  referralCode: 'ABC123',
  appUrl: 'https://app.peer.xyz/cash',
});
```

`refundAddress` is rejected. Peer Cash returns any withdrawal to the depositing wallet, so the module never silently promises a different refund destination.

## Development

```sh
npm install
npm run validate
```
