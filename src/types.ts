import type { FiatQuote, FiatTransactionDetail, SellOptions, SellResult } from '@tetherto/wdk-wallet/protocols';

export type PeerEnvironment = 'production' | 'preproduction' | 'staging';

export interface PeerFiatConfig {
  environment?: PeerEnvironment;
  referralCode?: string;
  appUrl?: string;
}

export type PeerPayeeInput =
  | string
  | {
      offchainId: string;
      telegramUsername?: string | null;
      metadata?: Record<string, unknown> | null;
      identityAttestation?: Record<string, unknown> | null;
    };

export interface PeerSellConfig {
  platform?: string;
  payee?: PeerPayeeInput;
  includeEta?: boolean;
}

export type PeerSellOptions = SellOptions & { config?: PeerSellConfig };
export type PeerQuoteSellOptions = Omit<PeerSellOptions, 'refundAddress'>;

export interface PeerFillEta {
  seconds?: number;
  label: string;
}

export interface PeerQuoteMetadata {
  kind: 'oracle-estimate';
  asOf: number;
  oracleUpdatedAt?: number;
  stale?: boolean;
  platform?: string;
  receiveAmount: number;
  eta?: PeerFillEta;
}

export interface PeerPreparedTransaction {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  chainId: number;
}

export type PeerPreparedStepKind =
  | 'approve'
  | 'createDeposit'
  | 'pruneExpiredIntents'
  | 'withdrawDeposit'
  | 'removeFunds'
  | 'addFunds';

export interface PeerPreparedStep {
  kind: PeerPreparedStepKind;
  description: string;
}

export interface PeerPrepareResult {
  txs: PeerPreparedTransaction[];
  steps: PeerPreparedStep[];
  register: { hashedOnchainIds: string[] };
  accessPolicyRequired: boolean;
}

export type PeerOrderState = 'awaiting-buyer' | 'matched' | 'delivering' | 'delivered' | 'returned';

export interface PeerOrderPayout {
  platform: string;
  currency?: string;
  active: boolean;
}

export interface PeerCashOrder {
  depositId: string;
  state: PeerOrderState;
  totalAmount: bigint;
  filledAmount: bigint;
  pendingAmount: bigint;
  returnedAmount: bigint;
  nextActions: readonly string[];
  payouts?: readonly PeerOrderPayout[];
  isInFlight: boolean;
  explain(): string;
}

export type PeerFiatQuote = FiatQuote & { metadata: PeerQuoteMetadata };
export type PeerSellResult = SellResult & { prepared?: PeerPrepareResult };
export type PeerTransactionDetail = FiatTransactionDetail & {
  metadata: {
    depositId: string;
    order: PeerCashOrder;
  };
};

export type PeerFiatErrorCode =
  | 'unsupported_operation'
  | 'unsupported_asset'
  | 'unsupported_currency'
  | 'unsupported_platform'
  | 'invalid_argument';
