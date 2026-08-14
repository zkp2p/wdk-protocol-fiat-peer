# @zkp2p/wdk-protocol-fiat-peer

Peer Cash for Tether WDK. The module implements WDK's `IFiatProtocol` for cashing out Base USDC to supported fiat payment platforms at the live oracle rate.

Peer Cash is off-ramp only. `quoteBuy()` and `buy()` reject with a typed `unsupported_operation` error.

## Install

```sh
npm install @zkp2p/wdk-protocol-fiat-peer
```

## Quote a cash-out

```ts
import PeerFiatProtocol from '@zkp2p/wdk-protocol-fiat-peer';

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

Amounts follow the WDK contract: `cryptoAmount` is in Base USDC base units and `fiatAmount` is in the fiat currency's minor unit. A quote is an oracle estimate, not a locked rate. The binding rate is the live oracle rate when a buyer fills the order.

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

The WDK host must inspect, sign, and submit `prepared.txs` in order. The module never accepts a private key or broadcasts a transaction. If `prepared.accessPolicyRequired` is true, finalize the confirmed create-deposit receipt with `@zkp2p/cash`, then prepare and submit its access-policy transaction.

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
- Fiat currencies and payout platforms: read live from `@zkp2p/cash`
- Pricing: 0% protocol spread, live oracle rate at fill time
- Countries: Peer exposes availability by payout platform and currency rather than by country, so `getSupportedCountries()` returns an empty list instead of inventing a country gate
- Runtime: browser and Node.js 20.19+

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
