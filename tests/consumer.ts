import PeerFiatProtocol, { type IFiatProtocol, type PeerFiatQuote, type PeerSellResult } from 'wdk-protocol-fiat-peer';

const protocol: IFiatProtocol = new PeerFiatProtocol();
const quote: Promise<PeerFiatQuote> = new PeerFiatProtocol().quoteSell({
  cryptoAsset: 'usdc',
  fiatCurrency: 'USD',
  cryptoAmount: 1_000_000n,
});
const result: Promise<PeerSellResult> = new PeerFiatProtocol().sell({
  cryptoAsset: 'usdc',
  fiatCurrency: 'USD',
  cryptoAmount: 1_000_000n,
});

void protocol;
void quote;
void result;
