const assert = require('node:assert/strict');
const peer = require('wdk-protocol-fiat-peer');

assert.equal(typeof peer.default, 'function');
assert.equal(peer.default, peer.PeerFiatProtocol);
assert.equal(typeof peer.PeerFiatError, 'function');
