# 暗号化接続の終端応答検証

local Relayがbusy応答/capabilityを送った直後にprivate WSを閉じると、EndpointServiceのwire.closeが未seal queueを破棄することを確認。monitor段階のencrypted fresh joinでshared_deltas_availableだけ届き、後続capabilityが消えてgeneric暗号確立失敗になる現象を2回再現したため、独立の修正へ切り出した。

新endpointClose bit3をparentで交渉、childは継承する。local終了後の新app要求を転送せず、受理済ciphertextをdrainしcontrol FIFOにEOF4、browserのACK5または2秒でcontext終了。permit/epoch/transport失効は即close、wire queue上限は維持。

独立taskcheck review_pointerのEOFと待機send/Blob変換競合をending state/前後guard/終端後send catch抑止で修正、公開factoryのFakeWire/NativeSocketと遅延Blob/seal回帰2件を追加し再点検通過。全体review_transferはmust/shouldなし。

source/root build/typecheckと全体source11970件/799files、root12032件/807files通過。初回buildは新unit fixtureのmock.calls[0]がundefined可能というTS2件で停止、非null明示を修正後fresh buildした。全体テストはその後に実行。Drainer7、Service10、browser公開factory2の関連回帰も通過。

browser: 既存shared cursor4/shared clipboard3がsource/root各7件通過。追加encrypted busyの3回再接続では、browser AES-GCM復号を20ms遅延して、終端までcapability/static errorを保持しgeneric暗号失敗で上書きしないこと、その後同じcohortへjoinして実cursor canvas pixelが描かれ続けることを確認。追加1件はsource18.1秒/root18.3秒で通過（unique8件）。最初のfixtureはBの詳細を秘匿するstatic errorを異なる設定の詳細文言と誤期待し修正。続いて無効な再同期button、設定欄に隠れる既定monitor retry buttonを押してtimeoutしたため、実際に操作可能な画質欄の「適用して再接続」を使うfixtureへ修正。retry buttonのoverlay問題は次のmonitor UI作業で対応する。rootではcancelled startの既存generic handler error logが出たが、browserのcap/error表示と再接続は通過。

独立check WT: baseebdefaf3から追加file/diff適用、fresh build/smoke PASS。

## 負例

check WTで対象だけを戻し、失敗を確認後finallyで元bytesを復元・一致照合。browser負例ではServiceのlocal close callbackを旧immediate closeへ戻しserverをfresh build、実browserでcapability欠落/generic失敗を再現。復元後serverをfresh buildしている。

### queue-before-eof

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-endpoint-close-drain-check

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointDrain.test.ts (7 tests | 1 failed | 6 skipped) 10ms
   × waits for accepted ciphertext, sends one EOF and closes only after acknowledgement 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointDrain.test.ts > waits for accepted ciphertext, sends one EOF and closes only after acknowledgement
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopEndpointDrain.test.ts:31:26
     29|   f.drain.begin(true);
     30|   await flush();
     31|   expect(f.terminal).not.toHaveBeenCalled();
       |                          ^
     32|   expect(f.close).not.toHaveBeenCalled();
     33|   release();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  03:16:00
   Duration  222ms (transform 63%, import 18%, tests 12%, worker 6%)


```

### revoked-drain

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-endpoint-close-drain-check

 ❯ |@sodashitsu/server| src/desktop/DesktopEndpointDrain.test.ts (7 tests | 1 failed | 6 skipped) 10ms
   × does not extend a revoked scope while accepted encryption is pending 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopEndpointDrain.test.ts > does not extend a revoked scope while accepted encryption is pending
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopEndpointDrain.test.ts:56:26
     54|   release();
     55|   await flush();
     56|   expect(f.terminal).not.toHaveBeenCalled();
       |                          ^
     57|   expect(f.close).toHaveBeenCalledTimes(1);
     58| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  03:16:02
   Duration  277ms (transform 63%, import 17%, tests 12%, worker 7%)


```

### client-ending

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-endpoint-close-drain-check

 ❯ |@sodashitsu/web| src/desktop/DesktopEndpointSocket.test.ts (2 tests | 2 failed) 45ms
   × drops queued application output after authenticated EOF while ACK is pending: blob 39ms
   × drops queued application output after authenticated EOF while ACK is pending: seal 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/DesktopEndpointSocket.test.ts > drops queued application output after authenticated EOF while ACK is pending: blob
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Event {
        "AT_TARGET": 2,
        "BUBBLING_PHASE": 3,
        "CAPTURING_PHASE": 1,
        "NONE": 0,
        Symbol(composed): false,
        Symbol(bubbles): false,
        Symbol(cancelable): false,
        Symbol(defaultPrevented): false,
        Symbol(eventPhase): 0,
        Symbol(timeStamp): 1939.040483,
        Symbol(type): "error",
        Symbol(dispatching): false,
        Symbol(immediatePropagationStopped): false,
        Symbol(propagationStopped): false,
        Symbol(target): DesktopEndpointSocket {
          "CLOSED": 3,
          "CLOSING": 2,
          "CONNECTING": 0,
          "OPEN": 1,
          "delegate": DesktopEndpointSocket {
            "CLOSED": 3,
            "CLOSING": 2,
            "CONNECTING": 0,
            "OPEN": 1,
            "delegate": undefined,
            "ending": false,
            "extensions": "",
            "handlers": Map {
              "open" => [Function anonymous],
              "message" => [Function anonymous],
              "error" => [Function anonymous],
              "close" => [Function anonymous],
            },
            "initialError": undefined,
            "invite": undefined,
            "native": NativeSocket {
              "binaryType": "arraybuffer",
              "bufferedAmount": 0,
              "onclose": [Function anonymous],
              "onerror": [Function anonymous],
              "onmessage": [Function anonymous],
              "onopen": [Function anonymous],
              "readyState": 3,
              Symbol(listeners): Object {
                "bubbling": Map {
                  "close" => Array [
                    [Function anonymous],
                  ],
                  "error" => Array [
                    [Function anonymous],
                  ],
                },
                "capturing": Map {},
              },
              Symbol(listenerOptions): Object {
                "bubbling": Map {
                  "close" => Array [
                    Object {
                      "once": true,
                    },
                  ],
                  "error" => Array [
                    Object {
                      "once": true,
                    },
                  ],
                },
                "capturing": Map {},
              },
            },
            "opening": false,
            "outputType": "blob",
            "pending": 0,
            "pendingBytes": 0,
            "protocol": "soda-desktop-input-v1",
            "protocols": Array [
              "soda-desktop-input-v1",
            ],
            "readyState": 3,
            "root": BrowserRoot {
              "closed": true,
              "credentials": Promise {},
              "invites": Map {},
              "machine": "generated",
              "session": "330d1dac-b2f7-49af-bb79-738a44a781c1",
              "sockets": Set {},
              "unsubscribe": [Function anonymous],
            },
            "select": undefined,
            "sending": Promise {},
            "session": "330d1dac-b2f7-49af-bb79-738a44a781c1",
            "stopReason": "暗号化接続の鍵・指紋・接続先の許可を確認してください",
            "stopped": true,
            "url": "ws://localhost/desktop-share",
            "wire": DesktopEndpointWire {
              "options": Object {
                "active": [Function active],
                "crypto": Crypto {},
                "expectedFingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "identity": Object {},
                "onClose": [Function onClose],
                "onReady": [Function onReady],
                "onRecord": [Function onRecord],
                "peerRole": "provider",
                "role": "viewer",
                "sendRaw": [Function sendRaw],
                "session": "330d1dac-b2f7-49af-bb79-738a44a781c1",
              },
              "records": Array [
                Uint8Array [
                  2,
                  123,
                  34,
                  116,
                  121,
                  112,
                  101,
                  34,
                  58,
                  34,
                  99,
                  111,
                  110,
                  110,
                  101,
                  99,
                  116,
                  34,
                  44,
                  34,
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  115,
                  34,
                  58,
                  91,
                  34,
                  115,
                  111,
                  100,
                  97,
                  45,
                  100,
                  101,
                  115,
                  107,
                  116,
                  111,
                  112,
                  45,
                  105,
                  110,
                  112,
                  117,
                  116,
                  45,
                  118,
                  49,
                  34,
                  93,
                  125,
                ],
                Uint8Array [
                  5,
                ],
                Uint8Array [
                  0,
                  7,
                  8,
                ],
              ],
            },
            Symbol(listeners): Object {
              "bubbling": Map {
                "open" => Array [
                  [Function anonymous],
                ],
                "message" => Array [
                  [Function anonymous],
                ],
                "error" => Array [
                  [Function anonymous],
                ],
                "close" => Array [
                  [Function anonymous],
                ],
              },
              "capturing": Map {},
            },
            Symbol(listenerOptions): Object {
              "bubbling": Map {
                "open" => Array [
                  Object {},
                ],
                "message" => Array [
                  Object {},
                ],
                "error" => Array [
                  Object {},
                ],
                "close" => Array [
                  Object {},
                ],
              },
              "capturing": Map {},
            },
          },
          "ending": false,
          "extensions": "",
          "handlers": Map {
            "error" => [Function Mock],
            "close" => [Function Mock],
          },
          "initialError": false,
          "invite": undefined,
          "native": undefined,
          "opening": false,
          "outputType": "blob",
          "pending": 0,
          "pendingBytes": 0,
          "protocol": "soda-desktop-input-v1",
          "protocols": Array [
            "soda-desktop-input-v1",
          ],
          "readyState": 3,
          "root": undefined,
          "select": [Function anonymous],
          "sending": Promise {},
          "session": "",
          "stopReason": "暗号化接続の鍵・指紋・接続先の許可を確認してください",
          "stopped": true,
          "url": "ws://localhost/desktop-share",
          "wire": undefined,
          Symbol(listeners): Object {
            "bubbling": Map {
              "close" => Array [
                [Function Mock],
              ],
              "error" => Array [
                [Function Mock],
              ],
            },
            "capturing": Map {},
          },
          Symbol(listenerOptions): Object {
            "bubbling": Map {
              "close" => Array [
                Object {},
              ],
              "error" => Array [
                Object {},
              ],
            },
            "capturing": Map {},
          },
        },
        Symbol(currentTarget): null,
        Symbol(isInPassiveEventListener): false,
      },
    ]


Number of calls: 1

 ❯ src/desktop/DesktopEndpointSocket.test.ts:109:24
    107|     application.release();
    108|     await flushPromises();
    109|     expect(errors).not.toHaveBeenCalled();
       |                        ^
    110|     expect(wire.records.filter((b: Uint8Array) => b[0] === 0 || b[0] =…
    111|       phase === "blob" ? 0 : 1,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/web| src/desktop/DesktopEndpointSocket.test.ts > drops queued application output after authenticated EOF while ACK is pending: seal
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Event {
        "AT_TARGET": 2,
        "BUBBLING_PHASE": 3,
        "CAPTURING_PHASE": 1,
        "NONE": 0,
        Symbol(composed): false,
        Symbol(bubbles): false,
        Symbol(cancelable): false,
        Symbol(defaultPrevented): false,
        Symbol(eventPhase): 0,
        Symbol(timeStamp): 1973.205836,
        Symbol(type): "error",
        Symbol(dispatching): false,
        Symbol(immediatePropagationStopped): false,
        Symbol(propagationStopped): false,
        Symbol(target): DesktopEndpointSocket {
          "CLOSED": 3,
          "CLOSING": 2,
          "CONNECTING": 0,
          "OPEN": 1,
          "delegate": DesktopEndpointSocket {
            "CLOSED": 3,
            "CLOSING": 2,
            "CONNECTING": 0,
            "OPEN": 1,
            "delegate": undefined,
            "ending": false,
            "extensions": "",
            "handlers": Map {
              "open" => [Function anonymous],
              "message" => [Function anonymous],
              "error" => [Function anonymous],
              "close" => [Function anonymous],
            },
            "initialError": undefined,
            "invite": undefined,
            "native": NativeSocket {
              "binaryType": "arraybuffer",
              "bufferedAmount": 0,
              "onclose": [Function anonymous],
              "onerror": [Function anonymous],
              "onmessage": [Function anonymous],
              "onopen": [Function anonymous],
              "readyState": 3,
              Symbol(listeners): Object {
                "bubbling": Map {
                  "close" => Array [
                    [Function anonymous],
                  ],
                  "error" => Array [
                    [Function anonymous],
                  ],
                },
                "capturing": Map {},
              },
              Symbol(listenerOptions): Object {
                "bubbling": Map {
                  "close" => Array [
                    Object {
                      "once": true,
                    },
                  ],
                  "error" => Array [
                    Object {
                      "once": true,
                    },
                  ],
                },
                "capturing": Map {},
              },
            },
            "opening": false,
            "outputType": "blob",
            "pending": 0,
            "pendingBytes": 0,
            "protocol": "soda-desktop-input-v1",
            "protocols": Array [
              "soda-desktop-input-v1",
            ],
            "readyState": 3,
            "root": BrowserRoot {
              "closed": true,
              "credentials": Promise {},
              "invites": Map {},
              "machine": "generated",
              "session": "5e7969af-1573-41c9-a5c6-68a6ee09c2f4",
              "sockets": Set {},
              "unsubscribe": [Function anonymous],
            },
            "select": undefined,
            "sending": Promise {},
            "session": "5e7969af-1573-41c9-a5c6-68a6ee09c2f4",
            "stopReason": "暗号化接続の鍵・指紋・接続先の許可を確認してください",
            "stopped": true,
            "url": "ws://localhost/desktop-share",
            "wire": DesktopEndpointWire {
              "options": Object {
                "active": [Function active],
                "crypto": Crypto {},
                "expectedFingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "identity": Object {},
                "onClose": [Function onClose],
                "onReady": [Function onReady],
                "onRecord": [Function onRecord],
                "peerRole": "provider",
                "role": "viewer",
                "sendRaw": [Function sendRaw],
                "session": "5e7969af-1573-41c9-a5c6-68a6ee09c2f4",
              },
              "records": Array [
                Uint8Array [
                  2,
                  123,
                  34,
                  116,
                  121,
                  112,
                  101,
                  34,
                  58,
                  34,
                  99,
                  111,
                  110,
                  110,
                  101,
                  99,
                  116,
                  34,
                  44,
                  34,
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  115,
                  34,
                  58,
                  91,
                  34,
                  115,
                  111,
                  100,
                  97,
                  45,
                  100,
                  101,
                  115,
                  107,
                  116,
                  111,
                  112,
                  45,
                  105,
                  110,
                  112,
                  117,
                  116,
                  45,
                  118,
                  49,
                  34,
                  93,
                  125,
                ],
                Uint8Array [
                  1,
                  123,
                  34,
                  116,
                  121,
                  112,
                  101,
                  34,
                  58,
                  34,
                  99,
                  111,
                  110,
                  116,
                  114,
                  111,
                  108,
                  34,
                  44,
                  34,
                  101,
                  110,
                  97,
                  98,
                  108,
                  101,
                  100,
                  34,
                  58,
                  116,
                  114,
                  117,
                  101,
                  125,
                ],
                Uint8Array [
                  5,
                ],
              ],
            },
            Symbol(listeners): Object {
              "bubbling": Map {
                "open" => Array [
                  [Function anonymous],
                ],
                "message" => Array [
                  [Function anonymous],
                ],
                "error" => Array [
                  [Function anonymous],
                ],
                "close" => Array [
                  [Function anonymous],
                ],
              },
              "capturing": Map {},
            },
            Symbol(listenerOptions): Object {
              "bubbling": Map {
                "open" => Array [
                  Object {},
                ],
                "message" => Array [
                  Object {},
                ],
                "error" => Array [
                  Object {},
                ],
                "close" => Array [
                  Object {},
                ],
              },
              "capturing": Map {},
            },
          },
          "ending": false,
          "extensions": "",
          "handlers": Map {
            "error" => [Function Mock],
            "close" => [Function Mock],
          },
          "initialError": false,
          "invite": undefined,
          "native": undefined,
          "opening": false,
          "outputType": "blob",
          "pending": 0,
          "pendingBytes": 0,
          "protocol": "soda-desktop-input-v1",
          "protocols": Array [
            "soda-desktop-input-v1",
          ],
          "readyState": 3,
          "root": undefined,
          "select": [Function anonymous],
          "sending": Promise {},
          "session": "",
          "stopReason": "暗号化接続の鍵・指紋・接続先の許可を確認してください",
          "stopped": true,
          "url": "ws://localhost/desktop-share",
          "wire": undefined,
          Symbol(listeners): Object {
            "bubbling": Map {
              "close" => Array [
                [Function Mock],
              ],
              "error" => Array [
                [Function Mock],
              ],
            },
            "capturing": Map {},
          },
          Symbol(listenerOptions): Object {
            "bubbling": Map {
              "close" => Array [
                Object {},
              ],
              "error" => Array [
                Object {},
              ],
            },
            "capturing": Map {},
          },
        },
        Symbol(currentTarget): null,
        Symbol(isInPassiveEventListener): false,
      },
    ]


Number of calls: 1

 ❯ src/desktop/DesktopEndpointSocket.test.ts:109:24
    107|     application.release();
    108|     await flushPromises();
    109|     expect(errors).not.toHaveBeenCalled();
       |                        ^
    110|     expect(wire.records.filter((b: Uint8Array) => b[0] === 0 || b[0] =…
    111|       phase === "blob" ? 0 : 1,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed (2)
   Start at  03:16:04
   Duration  2.02s (transform 50%, environment 27%, import 20%, tests 2%)


```

### blob-ending

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-endpoint-close-drain-check

 ❯ |@sodashitsu/web| src/desktop/DesktopEndpointSocket.test.ts (2 tests | 1 failed | 1 skipped) 29ms
   × drops queued application output after authenticated EOF while ACK is pending: blob 25ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/DesktopEndpointSocket.test.ts > drops queued application output after authenticated EOF while ACK is pending: blob
AssertionError: expected [ Uint8Array[ 0, 7, 8 ] ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/DesktopEndpointSocket.test.ts:110:78
    108|     await flushPromises();
    109|     expect(errors).not.toHaveBeenCalled();
    110|     expect(wire.records.filter((b: Uint8Array) => b[0] === 0 || b[0] =…
       |                                                                              ^
    111|       phase === "blob" ? 0 : 1,
    112|     );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  03:16:08
   Duration  2.14s (transform 49%, environment 28%, import 21%, tests 1%)


```

### immediate-close-browser

```text

Running 1 test using 1 worker

(node:1588109) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-27T18:25:00.640Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T18:25:00.642Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T18:25:00.643Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T18:25:00.654Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-r6HEsa/commands.json","count":0}
{"ts":"2026-10-27T18:25:01.241Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T18:25:01.243Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T18:25:01.243Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T18:25:01.244Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-5UTf9t/commands.json","count":0}
{"ts":"2026-10-27T18:25:12.278Z","level":"info","msg":"machine link closed","machine":"ae267fcd37bb4e53484e5e3129aae053","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-endpoint-drain.spec.ts:10:3 › encrypted busy responses and capability drain encrypted (13.4s)


  1) src/specs/remote-desktop-endpoint-drain.spec.ts:10:3 › encrypted busy responses and capability drain encrypted 

    Error: expect(locator).toBeVisible() failed

    Locator: locator('[data-remote-desktop]').getByLabel('独立カーソルを共有（全ての窓で同じ選択が必要）', { exact: true })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" locator('[data-remote-desktop]').getByLabel('独立カーソルを共有（全ての窓で同じ選択が必要）', { exact: true }) with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').getByLabel('独立カーソルを共有（全ての窓で同じ選択が必要）', { exact: true })


      118 |       await view.locator("summary").filter({hasText:"画質・計測"}).click();
      119 |       for (let attempt = 0; attempt < 3; attempt++) {
    > 120 |         await expect(offered).toBeVisible();
          |                               ^
      121 |         await expect(view.getByRole("alert")).toContainText("共有を開始できません");
      122 |         await expect(view.getByRole("alert")).not.toContainText("暗号化接続を確立できません");
      123 |         await expect(
        at /workspaces/sodashitsu-desktop-endpoint-close-drain-check/packages/e2e/src/specs/remote-desktop-endpoint-drain.spec.ts:120:31

    Error Context: test-results/remote-desktop-endpoint-dr-c58f1--capability-drain-encrypted/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-endpoint-dr-c58f1--capability-drain-encrypted/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-endpoint-dr-c58f1--capability-drain-encrypted/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-endpoint-drain.spec.ts:10:3 › encrypted busy responses and capability drain encrypted 
undefined
/workspaces/sodashitsu-desktop-endpoint-close-drain-check/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-endpoint-drain.spec.ts

```
