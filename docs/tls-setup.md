# TLS の証明書と、LAN（別マシン・スマートフォン）からの接続

AC11（`--host 0.0.0.0 --cert … --key …` で起動し、別のマシンのブラウザから `https://` でログインして
AC1〜AC9 の操作を行う）と、WSL2 環境からの LAN 公開（design.md「WSL2」）の手順をまとめる。
構成ごとのファイアウォールの開け方（手順4）・動かし続けるときの注意（「起動と運用の注意」）・リバースプロキシの後ろに
置く場合（「リバースプロキシの後ろに置く」）もここに書く。

## この docs のコマンドの書き方（`soda` は PATH に無い）

`@sodashitsu/server` は公開していない（`private`）ワークスペースのパッケージなので、`pnpm install && pnpm -s build` の後も
**`soda` というコマンドはどこにも入らない**（PATH に無い）。実体は `packages/server/dist/main.js` で、リポジトリの直下で
次のように起動する：

```sh
node packages/server/dist/main.js --help     # 使い方（`serve --help` ではない。`serve` の後ろの --help は未知のオプションになる）
node packages/server/dist/main.js serve      # 手元用（127.0.0.1:7780・HTTP）
```

**この docs の `soda …` は `node <リポジトリ>/packages/server/dist/main.js …` の略**。同じように打てるようにするなら：

```sh
# bash / zsh（リポジトリの直下で実行する。$PWD はこの場で展開される。~/.bashrc 等に書くなら $PWD ではなく実際のパスを書く）
alias soda="node $PWD/packages/server/dist/main.js"
```

```powershell
# PowerShell（Windows ネイティブ）。パスは自分の clone の場所に置き換える。常用するなら $PROFILE に書く
function soda { node "C:\src\sodashitsu\packages\server\dist\main.js" @args }
```

alias・関数はその shell の中でしか使えない（`setsid`・systemd 等から起動するときは `node <main.js のフルパス>` と書く。
「起動と運用の注意」の例を参照）。

## なぜ TLS が要るか

- `soda serve` は、**ループバック（`localhost`/`127.0.0.1`/`::1`）以外のホストへ証明書なしで bind しようと
  すると起動を拒否する**（`packages/server/src/config.ts` の `cannot bind to non-loopback host "…" without
  a certificate`。終了コード 2）。これは zellij の Web クライアントと同じ方針（research.md F9.1）——ネットワーク越しに
  端末の入出力を平文で流さないための設計上の制約で、フラグでは無効化できない。
- ブラウザの Clipboard API（`Ctrl+Shift+V` の貼り付け・M4 の選択時コピー）は
  [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
  （HTTPS か `localhost`）でしか動かない。LAN の IP に平文 HTTP でつなぐ構成では、これらの機能がすべて
  使えなくなる（research.md F9.4）。
- 同一マシン（`localhost`）だけで使うなら、`--cert`/`--key` を付けずに起動すればよい（既定の HTTP のまま）。

## 手順1：証明書を用意する

3 通りの入手手段がある（research.md F9.5）。**どれでも `--cert`/`--key` に渡す形式は同じ**（PEM 形式の
証明書ファイルと秘密鍵ファイル）。`soda serve` を動かすユーザーが**両方のファイルを読める**こと（読めなければ
`soda: cannot read --key …` で終了コード 2。下の「鍵の権限」）。

### mkcert（ローカルで自己署名。最も手軽）

[mkcert](https://github.com/FiloSottile/mkcert) はローカル CA を作り、その CA をブラウザ・OS に
信頼させたうえで証明書を発行するツール。**自己署名証明書と違い、mkcert の CA を各クライアント端末に
インストールしておけば警告なしで開ける**。

```sh
# サーバを動かすマシンで（初回のみ）ローカル CA を作り、OS の信頼ストアへ登録する
mkcert -install

# ブラウザが開く名前・IP を SAN に含めて証明書を発行する（例：ホスト名 myhost、LAN の IP 192.168.1.50）。
# SAN に要るのは「サーバのインタフェースの IP」ではなく「ブラウザのアドレスバーに入る名前・IP」。
# WSL2 では、mirrored モードでも NAT＋portproxy でも、別のマシンが開くのは母艦（Windows）の LAN の IP なので、
# それを入れる（WSL の 172.x ではない）。構成ごとの表は下の「手順2」。
mkcert -cert-file soda.pem -key-file soda-key.pem myhost 192.168.1.50 localhost 127.0.0.1

soda serve --host 0.0.0.0 --port 8443 --cert soda.pem --key soda-key.pem
```

**別マシン（スマートフォン等）からアクセスする場合**、そのマシンにも mkcert の CA
（サーバのマシンで `mkcert -CAROOT` が示すディレクトリの `rootCA.pem`）を入れないと、ブラウザが警告を出す。
**渡すのは `rootCA.pem` だけ**（同じディレクトリの `rootCA-key.pem` は CA の秘密鍵で、渡すとそれを持つ誰でも、入れた
マシンに信頼される証明書を作れてしまう。どこにも写さない）。入れ方（[mkcert の README「Installing the CA on other systems」・
「Mobile devices」](https://github.com/FiloSottile/mkcert#installing-the-ca-on-other-systems)）：

- **PC（Linux・macOS・Windows）の OS の信頼ストア**：そのマシンにも mkcert を入れ、`rootCA.pem` を置いたディレクトリを
  `CAROOT` に指定して `mkcert -install` する（CA の鍵は要らない）。例：`rootCA.pem` を `~/soda-ca` に置いたなら
  `CAROOT=~/soda-ca mkcert -install`（PowerShell は `$env:CAROOT = "$HOME\soda-ca"; mkcert -install`）。Chrome・Edge は OS の
  信頼ストアを使う。
- **Firefox**：OS とは別の証明書ストアを持つ。Linux・macOS では上の `mkcert -install` が Firefox にも入れる（Linux は
  `certutil`——Debian・Ubuntu なら `libnss3-tools`——が要る）。入らなければ Firefox の設定の「プライバシーとセキュリティ」→
  「証明書を表示...」→「認証局証明書」→「読み込む...」で `rootCA.pem` を読み込み、ウェブサイトの識別に使うことを
  信頼する旨にチェックを入れる。
- **iOS・iPadOS**：`rootCA.pem` を AirDrop・メール等で送って開き、「設定」に出る「プロファイルがダウンロードされました」から
  インストールしたうえで、「設定」→「一般」→「情報」→「証明書信頼設定」でその CA を全面的に信頼する設定をオンにする
  （これを忘れると警告が消えない）。
- **Android**：「設定」の「セキュリティ」→「暗号化と認証情報」→「証明書のインストール」→「CA 証明書」で `rootCA.pem` を
  入れる（利用者が入れる CA。メニューの名前・場所は機種・版で違う）。Chrome は利用者が入れた CA も信頼する
  （この検証環境では実機で未確認）。

CA を配れない環境（会社支給の iPad 等）では、後述の自己署名の代わりに `tailscale cert` を検討する。

### tailscale cert（Tailscale ネットワーク内。Let's Encrypt 由来）

[Tailscale](https://tailscale.com/) の tailnet に参加しているマシン同士なら、正規の Let's Encrypt
証明書を無料で取得できる——警告なしで開け、CA の配布も不要（tailnet の管理画面で MagicDNS と HTTPS を有効にしておく。
[Tailscale の docs](https://tailscale.com/kb/1153/enabling-https)）。

```sh
# 下の「鍵の権限」の方法1（operator）を済ませてから、sudo を付けずに実行する
tailscale cert your-machine.your-tailnet.ts.net
# カレントディレクトリに your-machine.your-tailnet.ts.net.crt / .key が生成される

# MagicDNS の名前はサーバのインタフェースに無いので --origin で渡す（手順2）。起動時に先頭に表示される。
soda serve --host 0.0.0.0 --port 7780 \
  --cert your-machine.your-tailnet.ts.net.crt --key your-machine.your-tailnet.ts.net.key \
  --origin https://your-machine.your-tailnet.ts.net:7780
```

**鍵の権限**：`sudo tailscale cert …` で作ると、鍵（`.key`）は **root が持ち主で、持ち主しか読めない（0600）**。
一般ユーザーで `soda serve --key …` すると読めずに止まる：

```
soda: cannot read --key your-machine.your-tailnet.ts.net.key: EACCES: permission denied, open 'your-machine.your-tailnet.ts.net.key'
--key のファイルのパスと読み取り権限を確かめてください。
```

（終了コード 2）。どちらかで直す：

```sh
# 方法1：soda を動かすユーザーを tailscale の operator にし、sudo なしで tailscale cert を実行する（ファイルはそのユーザーのものになる）。
# operator は sudo なしで tailscale を操作できるようになる（tailscale up/down 等）ことに注意。
sudo tailscale set --operator=$USER
tailscale cert your-machine.your-tailnet.ts.net

# 方法2：sudo で作ったファイルの持ち主を、soda を動かすユーザーに変える（鍵は 0600 のままでよい）
sudo tailscale cert your-machine.your-tailnet.ts.net
sudo chown "$USER" your-machine.your-tailnet.ts.net.crt your-machine.your-tailnet.ts.net.key
```

`tailscale set --operator` の後も `tailscale cert` が権限で断られる版があれば、方法2を使う（この検証環境には Tailscale が無く、
どちらも実機では未確認。Tailscale の docs も参照）。Let's Encrypt の証明書は約 90 日で切れる。`tailscale cert` を実行し直して
更新し、soda は起動時にしか証明書を読まないので **soda を再起動する**。

**注意（research.md F9.5）**：取得したマシン名（`your-machine.your-tailnet.ts.net`）は
[Certificate Transparency ログ](https://tailscale.com/kb/1153/enabling-https)に公開される
（ドメイン名だけで、tailnet 内部の IP やその他の情報は漏れない）。

### 自己署名（お試し用）

CA を配れず、tailscale も使わない場合の最終手段。`openssl` で自己署名証明書を直接作れるが、
**ブラウザは「安全でない接続」の警告を出す**（初回にユーザーが例外を承認する必要がある）。
**iPad では自己署名証明書がそもそも読み込めない例が報告されている**（code-server のガイド。
research.md F9.5）——iOS/iPadOS の実機検証では mkcert か tailscale cert を優先すること
（`docs/verification.md`「実機（iOS Safari・Android Chrome。AC12）」参照）。

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout soda-key.pem -out soda.pem -subj "/CN=myhost" \
  -addext "subjectAltName=DNS:myhost,IP:192.168.1.50"
```

## 手順2：Origin の許可（別マシンから繋ぐ場合の注意）

`soda serve --host 0.0.0.0` で待ち受けると、**サーバが自分自身のネットワークインタフェースから検出した
IP と OS のホスト名（`hostname` の値そのもの。`myhost.local`・FQDN 等の別名は含まない）を、待ち受けのポートと
組にしたものだけが自動で許可される**（DNS rebinding 対策として、それ以外の `Host`
ヘッダは拒否する。`packages/server/src/auth/OriginPolicy.ts`）。サーバは、ブラウザが実際にどの宛先
（アドレス・ポート・名前）を開くかを知ることができない。

**ブラウザが開く宛先のアドレス・ポート・名前のどれかが、サーバのインタフェースと待ち受けのポートに無いときは、
ブラウザが開く Origin を `--origin` で渡す必要がある**。例：WSL2 の NAT＋portproxy（母艦の LAN の IP で開く）、
ポート転送（転送元のポートが待ち受けのポートと違う）、リバースプロキシ、Tailscale の MagicDNS 名。
渡した Origin は、起動時に開ける URL の**先頭**に表示される。渡さずに開くと `/api/login` が 403 になり、
ログイン画面にその説明と、写せる形の `--origin <このページの Origin>` の行が出る（その行を起動オプションに加える）。
サーバのログ（標準エラーと `<state-dir>/server.log`）にも `origin rejected` が、ブラウザの `Origin`・`Host`
と許可しているアドレスの一覧つきで出る——**この拒否は token とは関係ない（token はまだ確かめていない）ので、
`soda token reset` しても直らない**。

ログイン済み（Cookie が有効）のまま許可外になったとき（`--origin` で許可していた名前で開いたまま `--origin` を付けずに起動し
直した・同じ名前の別のポート（転送したポート）で開き直した等。Cookie は名前ごとでポートを区別しないので、別のポートにも
送られる）は、ページを開くときの確認 `GET /api/session` も 403 になる（Cookie を確かめた後に `Host` を見る。Cookie が無効なら
`Host` を問わず 401 でログイン画面に進む。D106）。WebSocket（`/ws`）も断られると、端末の画面に「接続できません（このアドレスは
許可されていません）」の枠と、同じ `--origin <このページの Origin>` の行・「再試行」ボタンが出る（自動では繋ぎ直さない。起動し
直してから「再試行」を押す。D107）。`/api/session` は通るのに `/ws` だけが続けて断られるとき（前段のプロキシが `Host` を許可された名前で渡していて、
`--origin` が無い等）は、3 回目から「再接続中…」の下に同じ `--origin` の行が添えられる（`docs/verification.md`
「うまくいかないとき」）。

| 構成 | `--port` | `--origin` | ブラウザで開く URL | 証明書の SAN |
|---|---|---|---|---|
| Linux（LAN に直接つながる） | 任意（例 8443） | IP か OS のホスト名（`hostname` の値そのもの）で開くなら不要。それ以外の名前（`myhost.local`・FQDN 等）で開くなら**必須**：`https://<その名前>:<port>` | `https://<LAN の IP>:<port>`（表示される） | その LAN の IP（名前で開くならその名前も） |
| WSL2 の mirrored モード（方法A） | 任意 | 不要 | `https://<母艦の LAN の IP>:<port>`（表示される） | 母艦の LAN の IP |
| WSL2 の NAT＋portproxy（方法B） | portproxy の `connectport`（`listenport` と同じ値。例 8443） | **必須**：`https://<母艦の LAN の IP>:<listenport>` | `--origin` の URL（表示の先頭） | 母艦の LAN の IP |
| Windows ネイティブ | 任意（除外ポート範囲の外） | 不要 | `https://<LAN の IP>:<port>`（表示される） | その LAN の IP |
| Tailscale（`tailscale cert`） | 任意（例 7780） | **必須**：`https://<machine>.<tailnet>.ts.net:<port>` | `--origin` の URL（表示の先頭） | その ts.net の名前 |
| リバースプロキシ（TLS はプロキシ側。「リバースプロキシの後ろに置く」） | プロキシの転送先 | **必須**：`https://<プロキシの名前>[:<port>]` | `--origin` の URL（表示の先頭） | プロキシの証明書 |

```sh
# 例：tailscale cert で発行した名前でアクセスする場合
soda serve --host 0.0.0.0 --cert … --key … --origin https://your-machine.your-tailnet.ts.net:7780
```

`--origin` には**完全な Origin**（`scheme://host[:port]`）を渡す。複数回指定できる。**ポートも含める**
（既定は 7780。ブラウザで開く URL のポートが 443 のときだけ省ける——ブラウザは既定ポートを Origin から省くため）。
`--origin` のホスト（名前とポート）は、`/api/session` が見る `Host` の許可にも使う。既定ポートの Origin（`https://<名前>`・
`http://<名前>`）なら、`Host: <名前>` に加えて、ポートを付けて送る前段の `Host: <名前>:443`（http は `:80`）も許す（D106）。
既定でないポートの Origin（`https://<名前>:7780`）はそのポートだけ。

起動時に表示される LAN の IP の URL からは、docker・libvirt 等の仮想ブリッジ（`docker0`・`br-*`・`virbr*` 等）と
Windows の Hyper-V の内部スイッチ（`vEthernet (WSL)`・`vEthernet (Default Switch)` 等）のアドレスを除いている
（別のマシンからは届かないため）。ただし名前で見分けているので、すべては除けない（WSL2 の mirrored モードの
仮想アダプタは `eth1` 等の名前で見える）。表示された URL が別のマシンから開けないときは、そのマシンから届く
LAN の IP を使う。

## 手順3（WSL2 のみ）：LAN・スマートフォンへ出す

design.md「WSL2」・research.md F9.6 のとおり、WSL2 の既定の NAT モードでは **Windows 側（母艦）からは
`localhost` でそのまま届く**が、**LAN やスマートフォンからは追加の設定が要る**。どちらか一方を選ぶ。

### 方法A：mirrored ネットワークモード（Windows 11 22H2 以降。推奨）

`%UserProfile%\.wslconfig`（無ければ新規作成）に以下を書き、`wsl --shutdown` してから WSL2 を起動し直す。

```ini
[wsl2]
networkingMode=mirrored
```

mirrored モードでは WSL2 のネットワークインタフェースが Windows 側と共有され、WSL2 内で
`soda serve --host 0.0.0.0 …` を起動すれば、**追加のポート転送なしで LAN から届く**。ただし LAN からの着信は
**Hyper-V ファイアウォール**が止めるので、そのポートを開ける（手順4「WSL2 の mirrored モード」。通常の Windows の
ファイアウォールの規則 `New-NetFirewallRule` では開かない）。母艦の LAN の IP が WSL2 のインタフェースに
見えるので `--origin` は要らない。証明書の SAN には母艦の LAN の IP を入れる。

起動時の表示には、母艦の LAN の IP のほかに、Windows の仮想アダプタ（Hyper-V の `vEthernet (WSL)` 等）の
172.x などが並ぶことがある——mirrored モードでは Windows のアダプタが WSL2 の中で `eth1` 等の名前で見えるため、
名前では見分けられず、表示から除けない。別のマシンからは母艦の LAN の IP の URL を開く。

mirrored モードでは Windows と WSL2 が同じポートの空間を使うので、同じポートで Windows ネイティブの soda 等を
同時に待ち受けることはできない（後から起動した方が待ち受けに失敗する）。

### 方法B：portproxy（mirrored モードが使えない環境）

管理者権限の PowerShell（Windows 側）で、WSL2 のポートを Windows のポートへ転送する。
**`listenport`（別のマシンがつなぐ母艦のポート）と `connectport`（soda が待ち受けるポート）は同じ値にそろえる**
（例は 8443）。

```powershell
# WSL2 側の IP を確認（WSL2 のシェルで）：ip addr show eth0 | grep inet
$wslIp = "172.x.x.x"  # 上で確認した WSL2 の IP に置き換える
netsh interface portproxy add v4tov4 listenport=8443 listenaddress=0.0.0.0 connectport=8443 connectaddress=$wslIp

# 張った転送の確認・外すとき
netsh interface portproxy show v4tov4
netsh interface portproxy delete v4tov4 listenport=8443 listenaddress=0.0.0.0
```

LAN からの着信を許可するファイアウォールの規則も要る（手順4「WSL2 の NAT＋portproxy」。portproxy は Windows 側で
待ち受けるので、こちらは通常の Windows のファイアウォールの規則で開く）。

WSL2 の中では、`--port` を `connectport` に合わせ、**別のマシンが開く `https://<母艦の LAN の IP>:<listenport>`
を `--origin` で渡して**起動する（母艦の LAN の IP は WSL2 のインタフェースに無いので、渡さないと
`/api/login` が 403 になる。手順2）。

```sh
soda serve --host 0.0.0.0 --port 8443 --cert … --key … --origin https://<母艦の LAN の IP>:8443
# 例：母艦の LAN の IP が 192.168.1.50（Windows 側の ipconfig で確認する）なら --origin https://192.168.1.50:8443
```

- **証明書の SAN には母艦の LAN の IP（例 192.168.1.50）を入れる**（手順1。WSL2 の 172.x ではない）。
- 起動時には `--origin` の URL が先頭に表示される。別のマシンからはこれを開く。
- 続けて表示される WSL2 の IP（172.x）の URL は、**母艦の Windows からしか開けない**（NAT の内側のアドレス）。
- portproxy を通ると、soda からは**すべての接続元が同じアドレス**（母艦）に見える。ログインの失敗の回数の制限
  （「リバースプロキシの後ろに置く」の「ログインの失敗の回数の制限」）は、LAN の全員で 1 つを共有することになる。

WSL2 の IP は再起動のたびに変わりうるので、`.wslconfig` の mirrored モード（方法A）が使えるなら
そちらを優先する。portproxy は WSL2 が再起動されるたびに `$wslIp` を確認し直して張り直す必要がある。

## 手順4：ファイアウォール（構成ごと）

別のマシンから届かない（ブラウザが「接続できません」・タイムアウトになる）ときは、まずここを確かめる。例のポートは 8443。
以下のうち、**自分の構成の節だけ**を行う。

### Linux（ufw・firewalld）

ファイアウォールを動かしていなければ何もしなくてよい（`sudo ufw status` が `inactive`・`firewall-cmd` が無い等）。

```sh
# ufw（Ubuntu 等）
sudo ufw allow 8443/tcp
# LAN の中だけに絞るなら（例：192.168.1.0/24）
sudo ufw allow from 192.168.1.0/24 to any port 8443 proto tcp
sudo ufw status            # 8443/tcp が ALLOW で並ぶこと

# firewalld（Fedora・RHEL 等）。--permanent は再起動後も残す設定で、--reload で今の設定へ反映する
sudo firewall-cmd --permanent --add-port=8443/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports   # 8443/tcp が並ぶこと
```

firewalld で、LAN の I/F が既定と違うゾーンに入っているなら、`--zone=<ゾーン>` を付ける
（`sudo firewall-cmd --get-active-zones` で確かめる）。Tailscale 越しに使い ufw を動かしているなら、tailnet からの着信も
許可が要る（例：`sudo ufw allow in on tailscale0`。Tailscale の docs「UFW」を参照）。
WSL2 の中の Linux のファイアウォールは通常は動いていない。WSL2 で着信を止めているのは、通常は Windows 側（下の 2 節）。

### WSL2 の mirrored モード（Hyper-V ファイアウォール）

mirrored モードでは、LAN から WSL2 への着信は **Hyper-V ファイアウォール**が扱い、既定では止まる。通常の Windows の
ファイアウォールの規則（`New-NetFirewallRule`）では開かない。管理者権限の PowerShell（Windows 側）で、WSL の VM を
表す固定の値 `{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}` を指定して開ける
（[Microsoft の docs「Accessing network applications with WSL」の mirrored モード・Hyper-V ファイアウォール](https://learn.microsoft.com/windows/wsl/networking)）：

```powershell
# そのポートだけを開ける（推奨）
New-NetFirewallHyperVRule -Name "soda-8443" -DisplayName "soda (8443)" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 8443

# 確かめる・外すとき
Get-NetFirewallHyperVRule -Name "soda-8443"
Remove-NetFirewallHyperVRule -Name "soda-8443"
```

WSL2 への着信をすべて許す方法もある（WSL2 で動くすべてのサーバが LAN に見えるので、上の規則を優先する）：

```powershell
Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
```

### WSL2 の NAT＋portproxy（Windows のファイアウォール）

portproxy は Windows 側（母艦）で待ち受けるので、通常の Windows のファイアウォールの規則で開ける（管理者権限の PowerShell）：

```powershell
New-NetFirewallRule -DisplayName "soda (8443)" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow -Profile Private

# 確かめる・外すとき
Get-NetFirewallRule -DisplayName "soda (8443)"
Remove-NetFirewallRule -DisplayName "soda (8443)"
```

`-Profile Private` は「プライベート ネットワーク」のときだけ開ける指定。LAN が「パブリック」になっていると開かないので、
下の「Windows ネイティブ」の「ネットワークのプロファイル」を確かめる（家庭・社内の LAN をパブリックのまま使うなら `-Profile Private` を外すが、
その場合は公衆 Wi-Fi 等でも開くことに注意）。

### Windows ネイティブ（node.exe の許可・ネットワークのプロファイル）

- **初回の許可のダイアログ**：`soda serve --host 0.0.0.0 …` を初めて起動すると、Windows セキュリティの
  「このアプリの機能のいくつかが Windows Defender ファイアウォールでブロックされています」のダイアログが node.exe
  （「Node.js JavaScript Runtime」等の名前で出る）について出る。**「プライベート ネットワーク」にチェックを入れて「アクセスを許可する」**。
- ダイアログを「キャンセル」した・「パブリック」だけを許可した等で届かないときは、コントロール パネルの
  「Windows Defender ファイアウォール」→「Windows Defender ファイアウォールを介したアプリまたは機能を許可」で、
  node.exe の行の「プライベート」にチェックを入れる。**ブロックの規則は許可の規則より優先される**ので、
  ポートの許可の規則（上の `New-NetFirewallRule`）を足しても、node.exe のブロックの規則が残っていれば届かない——
  「セキュリティが強化された Windows Defender ファイアウォール」の「受信の規則」で node.exe の「ブロック」の規則を
  無効にするか削除する。node.exe に付いている規則は次で一覧できる：

  ```powershell
  Get-NetFirewallApplicationFilter -Program (Get-Command node).Source | Get-NetFirewallRule | Format-Table DisplayName, Direction, Action, Profile, Enabled
  ```

  node を nvm-windows・volta・fnm 等で入れていると、`(Get-Command node).Source` はシム（中継の実行ファイル）や
  シンボリックリンクのパスで、規則に書かれた実際の node.exe のパスと一致せず、何も出ないことがある。そのときは、
  プログラムが `node.exe` の規則をすべて出す（全部の規則を調べるので少し時間がかかる）か、「受信の規則」の一覧を
  「プログラム」の列で見る。`soda serve` が動いていれば、実際に動いている node.exe のパスも分かる：

  ```powershell
  Get-NetFirewallApplicationFilter -All | Where-Object Program -like '*\node.exe' | Get-NetFirewallRule | Format-Table DisplayName, Direction, Action, Profile, Enabled
  Get-Process node | Select-Object -ExpandProperty Path -Unique
  ```

  （この検証環境は Linux で Windows が無く、この節の PowerShell のコマンドはどれも実機では未確認。
  Microsoft の docs の `Get-NetFirewallApplicationFilter` も参照。）

- **ネットワークのプロファイル**：LAN の接続が「パブリック」だと、プライベート向けの許可は効かない。

  ```powershell
  Get-NetConnectionProfile                                                    # NetworkCategory が Private か
  Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private   # 管理者権限。InterfaceAlias は上の表示の値
  ```

  （設定アプリの「ネットワークとインターネット」→ 接続のプロパティ →「ネットワーク プロファイルの種類」でも変えられる。）

## 起動と運用の注意

### 起動時の表示

待ち受けに成功すると、次の形で表示する（design「起動時の表示」・D101〜D103）。**token 付きの URL は token を作った
初回の起動の 1 回だけ**表示する。

```
soda: listening on 0.0.0.0 port 8443 (https)
soda: open https://192.168.1.50:8443/#token=…      ← --origin を渡したら、その URL が先頭（例は portproxy の --origin）
soda: open https://localhost:8443/#token=…
soda: open https://172.29.160.5:8443/#token=…      ← このマシンの LAN の IPv4 ごとに 1 行（仮想ブリッジは除く。手順2）
soda: (token 付きの URL は今だけ表示します)
```

- `soda: listening on` の行は待ち受けの指定そのもので、URL ではない（`0.0.0.0` はブラウザでは開けない）。開くのは
  `soda: open` の行。その前に `{"ts":"…","level":"info","msg":"agent manifests loaded",…}` のようなログの行も出る
  （`<状態ディレクトリ>/server.log` と同じもの）。
- 手元用（`--host` を付けない）なら `soda: listening on 127.0.0.1 port 7780 (http)` と `soda: open http://127.0.0.1:7780/#token=…`。
- 2 回目以降の起動は `soda: open https://…/` を並べ、最後に「token を忘れた場合は「soda token reset」で作り直せます」。
- 開ける URL を 1 つも組み立てられないとき（`--host` にゾーン付きの IPv6 `fe80::1%eth0` を渡した等）は、その旨と
  「ブラウザで開く URL を --origin で渡すと、ここに表示します」を出し、token は `soda: token（今回作成）: <token>` の形で出す。
- 起動の途中で失敗・終了した場合も、作った token は `soda: token（今回作成・この表示が最後）: <token>` で必ず一度表示する。
- 待ち受けに失敗したら（ポートが使用中・権限の無いポート等）、token を作らずに理由と対処を出して終了コード 2 で終わる。

### 手元用と LAN 用を並行して動かす（`--state-dir` を分ける）

状態ディレクトリ（既定は Linux・WSL2 が `~/.local/state/sodashitsu`（`$XDG_STATE_HOME` があればその下）、
Windows が `%LOCALAPPDATA%\sodashitsu`）を使う `soda serve` は、**ポートが違っても 1 つしか動かせない**
（`<状態ディレクトリ>/soda.lock`。D103）。2 つ目は何も起動せずに止まる（終了コード 2）：

```
soda: the state dir /home/you/.local/state/sodashitsu is already in use by another soda (pid 12345)
同じ --state-dir を別の soda（soda serve か soda token reset）が使っています（…）。別のポートで並行して動かすなら、--session <名前> で別の名前付き session にするか、--state-dir に別のディレクトリを指定してください。…
```

手元用（7780・HTTP）と LAN 用（8443・HTTPS）を並行して動かすなら、状態ディレクトリを分ける：

```sh
soda serve                                                   # 手元用：127.0.0.1:7780・既定の状態ディレクトリ
soda serve --host 0.0.0.0 --port 8443 --cert soda.pem --key soda-key.pem \
  --state-dir ~/.local/state/soda-lan                        # LAN 用：別の状態ディレクトリ
```

`--state-dir` のパスを自分で決める代わりに、下の「名前付き session」の `--session lan` でも同じように分けられる。
状態ディレクトリごとに token と workspace・pane は別になる（別のセッション）。**同じ pane を手元と LAN の両方から
使いたいなら、1 つの soda を `--host 0.0.0.0 --cert … --key …` で動かし、手元からも表示される
`https://localhost:<port>` の URL を開く**。

### 名前付き session（`--session <名前>`。herdr の `--session` 相当）

状態ディレクトリのパスを自分で決める代わりに、**名前だけで**別の状態（token・workspace・pane・連携の設定・ログ）を
使い分けられる（20260926-named-session）。名前付き session の状態は、既定の状態ディレクトリの下の
`sessions/<名前>/` に置く（`--state-dir D` と併せると `D/sessions/<名前>/`）。無ければ作る。

```sh
soda serve                                                   # 既定の session（今までどおり。127.0.0.1:7780）
soda serve --session lan --host 0.0.0.0 --port 8443 --cert soda.pem --key soda-key.pem
                                                            # 名前付き session「lan」：~/.local/state/sodashitsu/sessions/lan/
soda session list                                            # 一覧（動いているか・状態ディレクトリ）
soda session list --json                                     # 同じ内容を JSON で（delete も --json を受ける）
soda token reset --session lan                               # その session の token だけを作り直す（止めてから。無い名前は断る）
soda session stop lan                                        # 動いている session を止める（Ctrl+C と同じ正常な停止。既定の session は default）
soda session delete lan                                      # 動いていない名前付き session を丸ごと消す
```

- **`--session` を付けなければ何も変わらない**。今までの状態（`session.json`・`auth.json` 等）は動かさず、そのまま
  既定の session として使う。`--session default` は付けないのと同じ。
- 名前付き session も**初めての起動の既定のポートは 7780**。並行して動かすなら `--port` を分ける（同じポートは `EADDRINUSE` で止まる）。
  同じ名前の 2 つ目は `soda.lock` で止まる（既定の session と同じ）。
- **ポートは session ごとに覚える**（20260926-named-session-ui）：待ち受けに成功したポートを状態ディレクトリの `serve.json`（0600。
  pid・ホスト名・ポート・TLS か・待ち受けのホスト。秘密は含まない）に書き、名前付き session は次に `--port` を付けずに起動すると
  そのポートを使う（`soda: session lan が前回使ったポート 8443 で待ち受けています…` と出る）。`--port` を付ければそれを使い、記録も
  変わる。記録が無い・壊れていれば 7780。そのポートが使用中なら案内に「前回使ったポート」と `--port` が出る。**既定の session
  （`--session` 無し）は記録を書くが起動には使わない**（今までどおり `--port` が無ければ 7780）。覚えるのはポートだけ
  （`--host`・`--cert` 等は毎回渡す）。
- **環境変数 `SODA_SESSION`**（herdr の `HERDR_SESSION`）：`--session` を付けない `soda serve`・`soda token reset` は `SODA_SESSION` の
  名前を使う（`--session` が優先。空は無いのと同じ、`default` は既定の session）。規則外の値は何も作らずに終了コード 2。
  `soda session list`・`delete` は見ない。名前付き session の pane には `SODA_SESSION=<その名前>` が入る（サーバを起動した環境の値は
  pane に渡さない。既定の session の pane には無い）ので、pane の中のスクリプトは自分の session を知れる。pane の中で
  `soda serve` を打つと同じ session を選ぶので `soda.lock` で止まる（案内に `SODA_SESSION` から選んだことと `--session default` が出る）。
  **`--state-dir` を付けて起動した session では、pane に渡るのは名前だけ**（根のパスは渡らない）ので、pane の中の `soda` にも同じ
  `--state-dir` を付ける（付けないと既定の根の同じ名前の session を指す）。
- 起動すると `soda: listening on …` の次の行に `soda: session lan（状態ディレクトリ: …）` と出る。token を作り直す案内も
  `soda token reset --session lan`（`--state-dir` を渡して起動したなら `--state-dir …` も）になる（`--session` を付けずに
  作り直すと、既定の session の token が変わる）。`soda token reset --session <名前>` は、その名前付き session が
  無ければ何も作らずに断る（終了コード 2。打ち間違いで空の session を作らない。作るのは `soda serve --session`）。
- 名前に使えるのは **1〜64 文字の ASCII の英数字と `.` `_` `-`**。`.`・`..`・先頭の `-`・末尾の `.`・Windows の予約名
  （`con`・`nul`・`com1`・`lpt1` 等。`con.txt` のように `.` の前が予約名のものも）は使えない（`/` や `..` で状態
  ディレクトリの外を指せないようにするため。どの OS でも同じ規則）。規則外なら何も作らずに終了コード 2 で止まる。
- **名前は短めに**（Linux・macOS・WSL2）：公式フック連携の socket（`<状態ディレクトリ>/agent-report.sock`）のパスには
  OS の上限（Linux は 108 バイト、macOS は 103 バイト。macOS は未検証）があり、超えると
  `soda: the state dir path is too long: …` で起動しない（終了コード 2）。既定の状態ディレクトリ
  （Linux の `/home/<ユーザー名>/.local/state/sodashitsu`）なら、ユーザー名が 8 文字で 42 文字の名前まで通る。
  同じ状態ディレクトリには、pane の中の `sodactl ask` 向けのログイン不要の受け口 `pane.sock`（0600。`docs/sodactl.md`「ログイン不要の受け口（pane.sock）」）も置く。
  長さの検査は `agent-report.sock` で測っていて、`pane.sock` はそれより短いので、検査を通れば収まる。
- `soda session list` の `status` は `soda.lock` から判定する（`running` なら行末に `(pid …)` を添える。別のホストのロックは
  `(pid … on <ホスト名>)`）。規則外の名前のディレクトリ・シンボリックリンク・ファイルは一覧に出さない。
- **`soda session stop <名前> [--json]`**（20260927-session-stop。Linux・macOS。macOS は未検証）：動いている `soda serve` を、
  起動した端末に触れずに止める。止め方は Ctrl+C と同じ（`session.json`・`--pane-history` なら画面履歴を保存し、pane のプロセスを
  終わらせ、`soda.lock` を放す）ので、同じ名前で起動し直すとレイアウト（と画面履歴）が戻る。既定の session は `soda session stop default`
  （名前は必須。`SODA_SESSION` は見ない——名前付き session の pane には `SODA_SESSION` が入っているので、打ち間違いでその pane ごと止めない）。
  `--state-dir D` で起動した session には同じ `--state-dir D` を付ける。
  - 止める指示は、その session の状態ディレクトリの `handoff.sock`（`soda handoff` と同じ制御の socket。0600 で同じ利用者だけが繋げる）に
    送る。**新しいネットワークの待ち受けは作らず、pid へのシグナルも送らない**（`soda.lock` の pid が別のプロセスに再利用されていても
    無関係なプロセスを止めない）。返事の pid が `soda.lock` の持ち主と一致することを確かめ、持ち主が居なくなるまで最長 30 秒待つ。
  - 終了コード：`0` 止まった（`soda: stopped session <名前>`）／`1` 断られた・繋げない・時間切れ等（理由と次の手を出す。サーバは
    指示の前のまま動き続けるか、時間切れなら止まる途中）／`2` 名前の誤り・無い session・Windows／`3` 動いていない
    （`session <名前> is not running`。何も作らない）。`--json` は成功を `{"stopped":true,"session":{…}}`、失敗を
    `{"error":{"code":…,"message":…}}` で出す（`code` は `not_running`・`older_server`・`refused_busy`・`timeout` 等）。
  - 断られる場面：`soda handoff` の最中（終わってからもう一度）・`stop` を知らない古い版の `soda serve`（起動した端末で Ctrl+C）・
    まだ起動の途中（復元が終わるまで制御の socket が無い）・別のホストで動いている（そのホストで打つ）。
  - 止まる途中の `soda serve` への `soda handoff` は断られる（`handoff refused (stopping)`。起動し直すなら `soda serve`）。
  - **pane の中から自分の session を止める**と、その pane のシェルごと終わるので、結果の行が出ないことがある（止まりはする）。
  - Windows では非対応（終了コード 2。起動した窓で Ctrl+C）。
  - `soda session delete`・`soda token reset` が「動いている」と断るときは、案内に `soda session stop <名前>` が出る。
- `soda session delete <名前>` は、`default`・動いている session・存在しない名前・シンボリックリンクを消さずに断る
  （終了コード 1。規則外の名前は `soda serve` と同じく終了コード 2）。動いていないのに断られる（落ちて残った・別のホストの
  `soda.lock`）ときは、案内のとおりその session の `soda.lock` を消してからやり直す（下の「別のホスト・作り直したコンテナの
  `soda.lock` は手で消す」と同じ）。名前は `soda session list` が表示する綴りのとおりに
  （大文字小文字を区別しない FS でも、別の綴りでは消さない）。消すときは、まず `soda.lock` を取ったまま
  `sessions/<名前>~deleting-…` へ名前を変えてから中身を消す。名前を変える前に同じ名前の `soda serve` を起動すると
  `soda.lock` で止まり、変えた後なら空の新しい session として起動する（消している途中のものとは混ざらない）。
- **herdr との違い**：
  - `soda session stop`（herdr の `herdr session stop <name>`）：経路は制御の socket（`handoff.sock`）の `stop`、止まったかは
    socket への接続ではなく `soda.lock` の持ち主で見る、待つ上限は 30 秒（herdr は 15 秒。本製品は画面履歴の保存を含むため）、
    動いていないときは終了コード 3（herdr は 1）、Windows は非対応（herdr は名前付きパイプで対応）。
  - **`attach` の代わりに、画面の session の一覧から別の session を新しいタブで開く**（下の「画面での session の表示と切り替え」）。
    別の session は別の URL（ポート）で、開いた先ではその session のログイン（token）が要る。
  - `SODA_SESSION` の空は「無い」として扱う（herdr は空を誤りにする。`export SODA_SESSION=` で外せるようにした）。
  - ポートの記憶は本製品だけのもの（herdr は socket なのでポートが無い）。
  - `--state-dir` と併せられる（herdr の状態の置き場所は設定ディレクトリ固定）。
  - sodactl は URL で繋ぐので、名前付き session には `--url http://127.0.0.1:<そのポート>` を渡す（ログインのキャッシュは
    URL ごとなので混ざらない）。

### 画面での session の表示と切り替え（20260926-named-session-ui）

- 名前付き session の画面では、デスクトップのサイドバーの最上段に `session: <名前> ⇄` のボタンが出て、ブラウザのタブのタイトルが
  `<ホスト名> [<名前>]: <workspace>` になる。既定の session はタイトルが今までどおりで、ボタンは名前付き session が 1 つでもあるとき
  だけ `session: default ⇄` と出る（1 つも無ければ画面は今までどおり）。サイドバーを畳んでいるときは `⇄` だけ（名前はツールチップ）。
- ボタン（クリック・Enter・Space）で **session の一覧**が開く。同じ状態ディレクトリの根の session（既定と名前付き）が並び、動いていて
  開ける session を ↑↓（j/k）で選んで Enter（またはクリック）すると**新しいブラウザのタブ**で開く。Esc・閉じるボタン・外側のクリックで
  何も開かずに閉じ、フォーカスはボタンへ戻る。開けない session は理由を出す：いま開いている／止まっている（起動のコマンド。`--state-dir` で起動した session なら同じ `--state-dir` を足す）／
  このマシンのブラウザからだけ開ける（ループバックで待ち受け）／開く先が分からない（`serve.json` が無い・古い版で起動した・別のマシン〔コンテナ〕で動いている・`soda token reset` の途中等）。
- 一覧はログイン済みの接続でだけ取れ、名前・動いているか・ポート・TLS か・待ち受けのホストだけを返す（token・Cookie・状態
  ディレクトリのパスは返さない）。**別の session を開いてもログインは引き継がない**——開いた先ではその session の token でログインする。
- **同じブラウザで複数の session にログインしたままでいられる**：名前付き session のログインの Cookie は `soda_session_<名前>`
  （既定の session は今までどおり `soda_session`）。Cookie はポートで分かれないので、以前は同じホスト名の別ポートの session に
  ログインすると他方がログアウトされた。名前付きでない並行起動（`--state-dir` を分けて同じホスト名で開く）は今も同じ Cookie を
  使うので、同じブラウザでは片方ずつしかログインしていられない（名前付き session にすれば分かれる）。Cookie の名前は session の名前だけで
  決まるので、`--state-dir` の違う根で**同じ名前**の session（`--state-dir A --session work` と `--state-dir B --session work`）を同じホスト名で
  開いても上書きし合う（名前を変える）。
- **開く URL の決め方と限界**：ループバックで待ち受ける session は待ち受けのホスト（`127.0.0.1` 等）で開き、いまのページを
  ループバック以外（LAN の IP 等）で開いているときは開けないとする。全インタフェース（`0.0.0.0`・`::`）の session は、いまのページが
  ループバックなら `127.0.0.1`／`[::1]`、そうでなければいまのページのホスト名で開く。特定のアドレスで待ち受ける session はそのアドレス。
  次の場合は開いた先が拒否する（ログインの画面が 403 の理由を出す）か、別のマシンを指す：いまのページを `--origin` で足した名前
  （ポート転送・リバースプロキシ・Tailscale の名前）・`--host` に付けた名前・`os.hostname()` と違う名前（FQDN・mDNS）で開いている
  （相手の session に同じ `--origin` を付けるか、IP アドレスで開く）、ループバックへのポート転送（`ssh -L`・devcontainer 等）で
  `localhost` を開いている（転送していない先のポートはブラウザ側のマシンを指す）。
- モバイルの 1 列表示にはサイドバーの session のボタンと一覧は無い（タブのタイトルの `[<名前>]` は付く）。キーの割り当ても無い（後続。`.aidev/backlog/product-roadmap.md`）。

### worktree の作成先（`--worktree-dir`）

`--worktree-dir <path>` で、workspace のメニュー・`prefix+G` で作る Git worktree の作成先を変えられる
（既定は `~/.sodashitsu/worktrees`。herdr の `worktrees.directory` に相当）。別ディスク・共有ストレージ等へ
変えるなら：

```sh
soda serve --worktree-dir /data/soda-worktrees
```

指定しなければ既定の `~/.sodashitsu/worktrees` のまま変わらない。

指定した場所が存在する・書き込めることの起動時の事前確認はしない。**`--state-dir`・`--cert`・`--key`
とは失敗が分かるタイミングが違う**——それらは起動の早い段階（`readPem`・`StateDirLock` 等）で読み書きを
試すため、値が誤っていれば起動直後に `ConfigError`（終了コード 2）で分かる。`--worktree-dir` の値は
起動時には一切使われず、実際に worktree を作る操作（`prefix+G` 等。別の利用者・別のタイミングの場合も
ある）まで誤りに気づけない。

### token を作り直す（`soda token reset` は `soda serve` を止めてから）

```sh
# 先に、同じ状態ディレクトリの soda serve を止める（Ctrl+C 等）
soda token reset                                   # 既定の状態ディレクトリ
soda token reset --state-dir ~/.local/state/soda-lan
# → soda: new token: <新しい token>
```

動いている `soda serve` は token をメモリに持ったまま読み直さないので、**`soda serve` が動いている間は断る**
（`soda: cannot reset the token: the state dir … is in use by a running soda (pid …)`・終了コード 2）。作り直すと、
ログイン済みのブラウザもすべてログインし直しになる。起動し直した後、ログイン画面に新しい token を入れる
（2 回目以降の起動なので token 付きの URL は表示されない）。（以前の版では `soda token reset` 自体が
`unknown option: reset` で動かなかった。D103 で直した。）

### 端末を閉じると soda も終わる（SIGHUP。`nohup` でも同じ）

`soda serve` は Ctrl+C（SIGINT）・SIGTERM・**SIGHUP** を受けると、`session.json` を書いて `soda.lock` を放し、終了コード 0 で
終わる（`soda: received SIGHUP, shutting down`）。**`soda serve` を起動した端末を閉じると SIGHUP で終わる**。
`nohup soda serve …` でも同じ（Node は起動時にシグナルの扱いを既定に戻し、soda は SIGHUP を受けて閉じる。D103）。
端末を閉じても動かし続けるなら：

```sh
# tmux の中で動かす（端末を閉じても tmux ごと残る。token 付きの URL も tmux の画面に残る）
tmux new -s soda
soda serve --host 0.0.0.0 --port 8443 --cert soda.pem --key soda-key.pem
# Ctrl+B d で tmux から離れる。戻るときは tmux attach -t soda。止めるときは戻って Ctrl+C

# setsid：新しいセッションで動かし、端末から切り離す（alias は使えないので main.js をフルパスで書く。
# ~/src/sodashitsu は clone した場所に置き換える）。出力はファイルへ。token 付きの URL もそこに書かれるので、
# 他のユーザーに読めないよう umask 077 で作る
( umask 077; setsid node ~/src/sodashitsu/packages/server/dist/main.js serve --host 0.0.0.0 --port 8443 \
    --cert soda.pem --key soda-key.pem > ~/soda-serve.log 2>&1 < /dev/null & )
# 止めるとき：soda session stop default（Linux・macOS。Ctrl+C と同じ正常な停止）。kill <pid>（SIGTERM）でも閉じて終わるが、
# pid は <状態ディレクトリ>/soda.lock の 1 行目で、別のプロセスに再利用されていないか確かめてから送る
```

常駐させるなら systemd のユーザー単位のサービス等も使える（書き方は systemd の docs を参照。WSL2 で systemd を使うには
`/etc/wsl.conf` で有効にする——Microsoft の docs「WSL で systemd を使う」）。WSL2 では、WSL の端末（`wsl.exe`）を
すべて閉じると、しばらくして WSL2 自体が止まり、中の soda も止まることがある（WSL の版・設定による。この検証環境では
未確認）。その場合は WSL の端末を 1 つ開いたままにする。

### 別のホスト・作り直したコンテナの `soda.lock` は手で消す

`soda.lock` には持ち主の pid とホスト名を書く。同じホストで落ちたプロセスの残りなら、次の起動が pid を見て自動で
取り直す。**ホスト名が違う**（別のマシンと共有しているディレクトリ・作り直してホスト名が変わったコンテナ）と、
持ち主の生死をこちらから確かめられないので使用中とみなして止まる：

```
soda: the state dir … is already in use by another soda (pid 1 on old-container-host)
…そちらで soda が動いていなければ（落ちて残ったロック。コンテナを作り直してホスト名が変わった等）、…/soda.lock を消してからやり直してください。
```

その soda が本当に動いていないことを確かめてから、`<状態ディレクトリ>/soda.lock` を消して起動し直す。pid が別の
プロセスに再利用されている（前の soda が落ちた後、同じ pid の別のプロセスが動いている）場合も同じく手で消す。

### scrollback の行数とメモリ（`--scrollback`）

`--scrollback N` は pane ごとに遡れる行数（既定 5,000。0 以上の整数で、10,000 より大きい値は 10,000 にする）。
サーバのミラーはこの行数を持つ。ブラウザの端末（xterm.js）の行数は、**ブラウザごとの設定**（`prefix+s` の「端末」、モバイルは
上のバーの「設定」）で選べる。既定の「自動」では、デスクトップのブラウザは `--scrollback` と同じ行数（D107。以前のブラウザは
xterm.js の既定の 1,000 行で切っていた）、スマートフォン等のモバイルのブラウザは 1,000 行（メモリを抑えるため。`--scrollback` が
1,000 より小さくても 1,000 のまま——以前からの振る舞い）。**数を選んだときだけ** `--scrollback` の値で頭を押さえる
（それより大きい値は選択肢に出ない。サーバのミラーにある分しか届かないので、選んでも意味が無い）。

メモリの目安：

- ブラウザ：xterm.js は 1 セル 12 バイトなので、120 列なら 1 行 約 1.4KB、5,000 行で 1 端末 約 7MB。デスクトップのブラウザは
  最近表示した端末を 24 個まで持つので、全部が埋まると 約 170MB（`--scrollback 10000` なら 約 340MB）。行は出力が溜まった分
  だけ使うので、出力の少ない pane はそこまで使わない。
- サーバ：同じ行数を pane ごとのミラーに持つ（design.md「ドメイン固有の考慮」の scrollback のメモリの見込みで、5,000 行なら 1 pane
  約 12MB・16 pane で 約 200MB）。

減らしたいときは `--scrollback` を下げて起動し直す（ブラウザもサーバも減る）。ブラウザ側だけを減らすなら、そのブラウザの
設定の「端末」で行数を選ぶ（効くのは新しく開く pane から）。開いたままのページの端末は前の行数のままなので、ページも開き直す。

### 画面履歴の保存と再生（`--pane-history`。既定は無効）

`soda serve --pane-history` で起動すると、各 pane の画面とスクロールバック（サーバのミラーが持つ分。色つき）を状態ディレクトリの
`session-history.json` に保存し、**サーバを止めて起動し直したとき**に、復元した pane に前回の画面を先に表示する（herdr の
`[experimental] pane_history` 相当。20260926-screen-history-replay）。前回の画面の後ろに
`--- 前回のセッションの画面（<保存した時刻> に保存）---` の行が出て、その下が新しいシェル。古いプロセスは戻らない（見えるのは画面だけ）。

```bash
soda serve --pane-history
# → soda: 画面履歴を保存します（--pane-history）: <状態ディレクトリ>/session-history.json。pane の出力（秘密を含みうる）がディスクに残ります
```

- **既定は無効**。pane の出力には token・パスワードのプロンプト・コマンドの出力が含まれうるので、使うときだけ付ける。
  `session-history.json` は端末の履歴と同じく扱う（POSIX では 0600。Windows では状態ディレクトリの置き場所〔`%LOCALAPPDATA%`〕で守る）。
- **付けずに起動すると、残っている `session-history.json` を消す**（一度付けて保存した分も、次に付けずに起動した時点で消える）。
- 保存するのは 30 秒ごと（出力のあった pane だけ取り直し、何も変わらなければ書かない）と、正常な停止（Ctrl+C・SIGTERM・SIGHUP〔起動した端末を閉じたとき〕）のとき。
  異常終了（`kill -9`・停電）では、最後の保存より後の出力は戻らない。
- 保存するのは通常の画面の側。vim・less 等の全画面のアプリ（代替画面）の中で止めても、そのアプリの画面ではなく、その前の履歴が戻る。
  端末のモード（マウス報告等）は戻さない。120 桁より広い端末で保存した行は、空白の幅が詰まって見えることがある（既知の制約）。
- 公式フック連携でエージェントの会話を自動再開する pane には流さない（会話の再開が画面を描く。herdr と同じ）。
- `session.json` が無い・壊れていて新しく始めた起動では、古い画面を取り違えないよう `session-history.json` を消す。
- 大きさの上限：pane ごと 2MiB（超えた分は古い側を捨てる）、ファイル全体 64MiB（超えるファイルは読まない）。壊れた・大きすぎる
  ファイルでは起動を止めず、画面履歴なしで復元して `server.log` に残す（退避コピーは作らない）。
- 流す前に、文字・色・カーソルの移動以外の制御（端末への問い合わせ・モードの変更・タイトル等）を取り除く（ファイルを書き換えられても、
  新しいシェルへの入力に化けない）。
- 名前付き session（`--session`）では session ごとの状態ディレクトリに置く（`soda session delete` で一緒に消える）。

### 更新時の引き継ぎ（`soda handoff`。Linux・macOS）

soda を新しい版に入れ替える（`git pull` して `pnpm build` した等）とき、`soda serve` を止めて起動し直すと、各 pane のプロセス（シェル・
実行中のビルドやテスト・Claude Code 等のエージェント）はすべて終わる。**`soda handoff` を使うと、pane のプロセスを止めずに、動いている
`soda serve` をディスク上の soda に入れ替える**（herdr の `herdr update --handoff` に当たる。20260926-live-handoff）。

```bash
# 新しい版をビルドしてから（soda serve はそのまま動かしておく）
soda handoff
# → soda: handing off 3 pane(s) of pid 12345 to the soda on disk…
# → soda: handoff complete: 3 pane(s) kept running
soda handoff --session work     # 名前付き session（SODA_SESSION でもよい。--state-dir も同じ）
```

- 入れ替わるのは同じプロセス（pid は変わらない）。起動した端末・`systemd` 等から見ても同じ `soda serve` が動き続け、同じポートで待ち受け直す。
  ブラウザは一度切れて「再接続中…」になり、数秒で同じ画面に戻る（ログインし直さない）。`soda serve` の出力には起動の表示がもう一度出る。
- pane のプロセス・pane の id・レイアウト・フォーカス・直前の画面とスクロールバックはそのまま。会話の自動再開のコマンドも画面履歴
  （`--pane-history`）も流さない（プロセスが続いているため）。全画面のアプリ（vim・エージェントの TUI）は大きさの変化の合図で描き直す。
- **入れ替える前に、新しい版を同じ Node で確かめる**（読み込めるか・引き継ぎの形式の版が合うか・その Node で PTY が入れ替わりをまたいで残るか）。
  確かめられなければ何も変えずに断り、`soda serve` はそのまま動き続ける（`soda handoff` は理由を表示して終了コード 1）。
- 終了コード：0 成功／1 断った・失敗・一部の pane を引き継げなかった／2 指定の誤り・非対応（Windows・`process.execve` の無い Node）／3 `soda serve` が動いていない。
- 指示の経路は状態ディレクトリの `handoff.sock`（0600。同じ利用者だけ）で、新しいネットワークの待ち受けは作らない。入れ替えの間だけ、
  状態ディレクトリに `handoff.json`（0600。直前の画面の内容を含む）ができ、新しい版が読んだらすぐ消す。
- 仕組み：Node.js の `process.execve`（Experimental）で同じプロセスを新しい版に置き換え、PTY の端末（close-on-exec の付いていない fd）を
  そのまま持ち越す。herdr のように別のプロセスへ fd を送る（`SCM_RIGHTS`）のではない。
- 既知の制約：
  - **Windows では使えない**（`process.execve` が無く、ConPTY は fd でもない。herdr も非対応）。**macOS は未検証**（同じ仕組みで動く設計。
    PTY の確かめは master と slave を区別できない弱いもの）。
  - 引き継いだ pane のシェルが後で終わると、サーバが終わるまで `<defunct>`（ゾンビ）として残る（Node から回収できない。数は引き継いだ pane の数まで。
    メモリは使わない）。その pane は今までどおり閉じる。終了コードは Linux では正しく出るが、macOS では 0 になる。
  - 確かめの後に新しい版が起動の途中で落ちると、pane のプロセスは終わる（普通に起動し直したのと同じ結果。`session.json` は入れ替える前に保存済みなので、
    次の起動でレイアウトは戻る）。
  - 入れ替えの瞬間に多バイト文字の出力の途中だった pane では、その 1 文字が化けることがある。Kitty graphics の画像は引き継がない：
    転送の途中だった画像は出ず、その残り（base64 の文字）が画面に文字として出ることがある。入れ替えの前に送った画像を、後から配置し直すこともできない。実行中の要求・購読・`sodactl pane attach` の接続は切れる（繋ぎ直す）。

## リバースプロキシの後ろに置く

TLS をリバースプロキシ（nginx 等）で終端し、soda はループバックの HTTP で動かす構成。注意点：

- **ルートのパス（`/`）で公開する**。Web の画面は `/api/…`・`/ws`・`/assets/…` を絶対パスで呼び、ログインの Cookie も
  `Path=/` なので、`https://example.com/soda/` のようなサブパスには置けない（名前・ポートを分ける）。
- **`/ws` の WebSocket の Upgrade を転送する**。転送しないと、ログインはできても端末がつながらない。
- **`--origin` にブラウザが開く Origin を渡す**（手順2。渡さないと `/api/login`・`/ws` が 403。ログイン済みのブラウザには
  「接続できません（このアドレスは許可されていません）」の枠か、「再接続中…」の下の `--origin` の行が出る——
  `docs/verification.md`「うまくいかないとき」）。soda 側は `--host 127.0.0.1` なら証明書は要らない。
- **`Host` を書き換えない**（D106）。soda は、ページを開くとき・繋ぎ直すたびの確認 `GET /api/session` を `Host` で確かめる
  （同じオリジンの GET にブラウザは `Origin` を付けないため。`/api/login`・`/ws` は `Origin` で確かめる）。下の nginx の例のように
  `proxy_set_header Host` を書かなければ `proxy_pass` の宛先（`127.0.0.1:7780`）が渡り、許可される。`proxy_set_header Host $host;`
  （`soda.example.com`）・`proxy_set_header Host $host:$server_port;`（`soda.example.com:443`）も、`--origin https://soda.example.com`
  の名前と一致するので通る。これら以外の名前に書き換える前段では `/api/session` が 403 になり、サーバのログに
  `origin rejected`（`"path":"/api/session"`）が出る——`/ws` は `Origin` で許されるのでつながるが、`/api/session` は繋ぎ直すたびに
  拒否される（ログは、同じ接続元・`Origin`・`Host` の組ごとに 60 秒に 1 回まで。その間の件数は次の行の `suppressed`）。
  `/ws` も断られる構成なら、画面は「接続できません（このアドレスは許可されていません）」で止まる。直すには、プロキシに元の
  `Host` を渡させるか、書き換え先の名前を `--origin` に足す。
- **ログインの失敗の回数の制限を、プロキシの後ろの全員で共有する**。soda は接続元の IP ごとに、token の誤り（401）を
  **1 分に 5 回、または 1 時間に 20 回**数えると、その IP からのログインをしばらく 429 で断る
  （`packages/server/src/auth/LoginRateLimiter.ts`）。プロキシ（と WSL2 の portproxy）の後ろでは全員が同じ接続元
  （プロキシのアドレス）に見えるので、誰かが token を 5 回間違えると、全員が最大 1 分（1 時間に 20 回に達したら最大 1 時間）
  ログインできなくなる（`X-Forwarded-For` は見ない）。数はメモリにだけ持つので、soda を再起動すれば数え直しになる。
- soda は WebSocket の ping を送らないので、何も出力の無い端末の接続は、プロキシの無通信のタイムアウト（nginx は既定 60 秒）
  で切られる（ブラウザは自動でつなぎ直すが、その間は入力できない）。タイムアウトを長くする。同じ理由で、接続が黙って切れた
  ことにブラウザが気づくまでの間に打った文字は消える（`docs/verification.md`「既知の制約」）。

nginx の例（`soda serve --host 127.0.0.1 --port 7780 --origin https://soda.example.com` で動かしている場合）：

```nginx
server {
    listen 443 ssl;
    server_name soda.example.com;
    ssl_certificate     /etc/ssl/soda.example.com.crt;
    ssl_certificate_key /etc/ssl/soda.example.com.key;

    location / {
        proxy_pass http://127.0.0.1:7780;
    }

    location = /ws {
        proxy_pass http://127.0.0.1:7780;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}
```

## 確認

`docs/verification.md`「別のマシンからの TLS 接続（AC11）」の手順で、Linux・WSL2・Windows ネイティブのそれぞれについて、
実際に別マシンのブラウザから `https://` でログインし、AC1〜AC9 の操作が一通りできることを確認する
（スマートフォンは同じく「実機（iOS Safari・Android Chrome。AC12）」）。
