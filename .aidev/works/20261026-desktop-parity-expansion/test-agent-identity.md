# Node専用の所有者鍵基盤

既存Store/Protector/ACL/WindowsMetadata/WindowsPowerShellをclient-coreの明示.node subpathへ移動し、server旧pathはre-exportする。固定helper resource depth/既存vaultとrequired marker/peer許可/排他writer/atomic syncを維持。Node専用localIdentity()はload→restore→load後にclosed/policy/publicKey/secretを再検査し、activeはowner close/policy変更で失効する。暗黙の初期化やtrust、RPC公開はない。外部Store/別processの変更を自動監視するAPIではなく、単一ownerと呼出し側のsource/process epochを契約として明記する。

独立設計点検review_transferのshould（単一owner・外部変更非監視）はmethod/designへ明記して解消。実装taskcheck/全体review_pointerもmust/shouldなし。5モジュールはimportと新API以外の実装が同じであることを独立確認。

source fresh build/typecheck、新直接source単体6件、既存server鍵/endpoint52件、全体12000件/804filesを通過。生成Node fixtureもgenerated_node_local_identity_agent_handshake_pass。ブラウザ用index bundleは前段とexact bytesが同一（SHA256 bdd6f57a2d3e651ca13c4d1cf77821474da83525fdea4005cbfdee81b7149e87）で、Nodeコードを標準indexに公開しないことを確認。

source暗号browser6件を一つのprocessで通過（crypto9lane/replay、2browser Wire rotation/隔離失効、private backplane生成PNG/生CtrlSpace、production EOF drain、暗号別monitor窓、暗号file受信）。rootも同じ6件を一つのprocessで通過。実OS capture/inputを行っていない。

独立check WTはmain a154ba93から差分/新fileを適用しfresh install/build/smoke PASS。負例5件は新Node APIのrestore後policy、key snapshot、final-read owner、issued active policy/ownerを個別に外し、直接source単体が期待assertで失敗することを確認。finallyで各file exact bytesを復元・照合。unit負例でcompiled artifactを変更していないため、browser用の再buildは不要。以下は生出力。

Windows CI: source b1ebd9c3のNode identity run40575978109/job122442407400 SUCCESS（20:13:44 UTC）、既存protected boundaries run40575978093/job122442407567 SUCCESS（20:13:12 UTC）。Node24/pnpm9.15.9を固定し、生成LOCALAPPDATA一時ディレクトリだけACL設定、実CurrentUser DPAPIの保存/復元・固定helper path・生成agent/provider暗号を検査した。実peerのtrust、ユーザーの鍵、desktop、音声、service/driverを変更していない。

CLI identityコマンドとagent recipient route・MCP/model/UIは未公開で後続。task10全体は未完了。root全体と配備結果は後記。

## restore-policy negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-identity-check

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts (6 tests | 1 failed | 5 skipped) 113ms
   × rejects a local identity restored across a completed policy change 111ms

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  05:11:43
   Duration  461ms (transform 37%, tests 34%, import 27%, worker 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts > rejects a local identity restored across a completed policy change
AssertionError: promise resolved "{ …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "04dead467b18cd4ff0cb8faf7cf0ab2f4b0ec7317037036c378d73447c0773e1a94c6a041b5579db8a4c0b786fa72cf8cdd08bc3c59457541d24521cde6159c036",
+   },
  }

 ❯ src/desktop/DesktopEndpointStore.node.test.ts:45:65
     43|   const f=await fixture();await f.store.initialize();const begun=gate(…
     44|   const restore=vi.spyOn(DesktopEndpointIdentity,"restore").mockImplem…
     45|   const pending=f.store.localIdentity(),rejected=expect(pending).rejec…
       |                                                                 ^
     46|   try{await begun.promise;await f.store.setRequired(true);release.reso…
     47|   finally{release.resolve();await Promise.allSettled([pending]);restor…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## vault-snapshot negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-identity-check

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts (6 tests | 1 failed | 5 skipped) 105ms
   × rejects a vault replacement completed during key restore 103ms

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  05:11:45
   Duration  494ms (transform 39%, import 30%, tests 29%, worker 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts > rejects a vault replacement completed during key restore
AssertionError: promise resolved "{ …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "043d5f0890f5003f76be89747a390e5cdb600d09b81e3e10bca834069b3dd8175d2845cee2234881d469a59fd4fb0008353fa71b9b54d9620e54ba4073e6268cf1",
+   },
  }

 ❯ src/desktop/DesktopEndpointStore.node.test.ts:53:65
     51|   const begun=gate(),release=gate(),original=DesktopEndpointIdentity.r…
     52|   const restore=vi.spyOn(DesktopEndpointIdentity,"restore").mockImplem…
     53|   const pending=f.store.localIdentity(),rejected=expect(pending).rejec…
       |                                                                 ^
     54|   try{await begun.promise;await writeFile(join(f.store.directory,"iden…
     55|   finally{release.resolve();await Promise.allSettled([pending]);restor…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## final-owner negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-identity-check

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts (6 tests | 1 failed | 5 skipped) 71ms
   × rechecks owner lifetime after the final asynchronous vault read 69ms

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  05:11:46
   Duration  498ms (import 40%, transform 36%, tests 21%, worker 3%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts > rechecks owner lifetime after the final asynchronous vault read
AssertionError: promise resolved "{ …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "active": [Function active],
+   "identity": DesktopEndpointIdentity {
+     "crypto": Crypto {},
+     "publicKey": "04ebdba48b9da23fd09812312242105837495e8f2b8a1de01936c25e23c6345253d2c6c8044c81b2898c25352d6e18b1a01a3d9d147576e2d31278422a13c8e16e",
+   },
  }

 ❯ src/desktop/DesktopEndpointStore.node.test.ts:60:44
     58|   const f=await fixture();await f.store.initialize();const local=f.sto…
     59|   const restore=vi.spyOn(local,"load").mockImplementation(async()=>{co…
     60|   try{await expect(f.store.localIdentity()).rejects.toThrow();}finally…
       |                                            ^
     61| });
     62|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## active-policy negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-identity-check

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts (6 tests | 1 failed | 5 skipped) 64ms
   × invalidates local identity permits immediately on owner policy change or close 62ms

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  05:11:48
   Duration  403ms (transform 46%, import 30%, tests 22%, worker 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts > invalidates local identity permits immediately on owner policy change or close
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopEndpointStore.node.test.ts:38:67
     36| it("invalidates local identity permits immediately on owner policy cha…
     37|   const f=await fixture();await f.store.initialize();const first=await…
     38|   const changing=f.store.setRequired(true);expect(first.active()).toBe…
       |                                                                   ^
     39|   const second=await f.store.localIdentity();expect(second.active()).t…
     40|   await expect(f.store.localIdentity()).rejects.toThrow();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## active-owner negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-agent-identity-check

 ❯ |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts (6 tests | 1 failed | 5 skipped) 158ms
   × invalidates local identity permits immediately on owner policy change or close 157ms

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  05:11:49
   Duration  484ms (tests 44%, transform 34%, import 20%, worker 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/desktop/DesktopEndpointStore.node.test.ts > invalidates local identity permits immediately on owner policy change or close
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopEndpointStore.node.test.ts:39:121
     37|   const f=await fixture();await f.store.initialize();const first=await…
     38|   const changing=f.store.setRequired(true);expect(first.active()).toBe…
     39|   const second=await f.store.localIdentity();expect(second.active()).t…
       |                                                                                                                         ^
     40|   await expect(f.store.localIdentity()).rejects.toThrow();
     41| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```


## 最終結果

rootはguarded three-way反映（既存5 server moduleはbaseと一致を先に確認）後、frozen install/build/typecheck、全体12062件/812filesを一回のrunで全通過。source全体12000件/804filesも一回で全通過。暗号browser6件はsource/rootがそれぞれ一processで通過。独立check install/build/smoke、直接source負例5件/exact bytes復元、独立taskcheck/全体reviewを通過。source runtimeはb1ebd9c3から変更していない。

これはNode専用鍵基盤の準備で、CLI identityのコマンドやagent recipient接続は未公開。統合/両端ビルド・handoffは後続し、配備receiptは既存変更を保持するrootに追記する。
