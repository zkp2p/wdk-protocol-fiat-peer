import type { PeerFiatErrorCode } from './types.ts';

export class PeerFiatError extends Error {
  readonly code: PeerFiatErrorCode;

  constructor(code: PeerFiatErrorCode, message: string) {
    super(message);
    this.name = 'PeerFiatError';
    this.code = code;
  }
}
