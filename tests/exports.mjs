import assert from 'node:assert/strict';
import PeerFiatProtocol, { PeerFiatError } from '@zkp2p/wdk-protocol-fiat-peer';

assert.equal(typeof PeerFiatProtocol, 'function');
assert.equal(typeof PeerFiatError, 'function');
