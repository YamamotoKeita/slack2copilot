# SlackからCopilot CLIを叩く最小構成のサンプル

## 開発環境構築
Copilot CLIとDenoが必要。
以下はMac (+Homebrew) での構築手順。

```shell
brew install copilot-cli

# Denoは2.7.12にSlackBoltとの相性の問題があったので、2.7.5にバージョン固定
curl -fsSL https://deno.land/install.sh | sh -s v2.7.5
```

## Slack Appの作成

Slackで任意のWorkspaceにログインしたら以下の手順で Slack App の設定をする。

1. https://api.slack.com/apps?new_app=1 にアクセスして `From Scratch` を選択。App Nameに任意の名前を入れ、使いたいWorkspaceを選んで `Create App`。
2. Socket Mode > Enable Socket ModeをONにする
    - App-Level Token が作成されるのでコピーしておく (※1)
3. Event Subscriptions で Enable Events をONにする
4. Subscribe to bot events に以下を追加
    - message.channels
    - message.im
    - message.groups
5. OAuth & Permissions > Bot Token Scopeに以下を追加
    - channels:history
    - chat:write
    - groups:history
    - im:history
6. OAuth & Permissions > OAuth Tokens で Install to workspace名をクリック
    - Slackへのアクセスを許可する
    - OAuth Token ができるのでコピーしておく (※2)

(※1)App-Level Token、(※2)OAuth Token を後ほどプログラム利用する。

### .envにTokenを設定

`.env.example` をコピーして `.env` を作る。

```shell
cp .env.example .env
```

`.env` に次の値を設定する。

```txt
SLACK_OAUTH_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

`.env` は `deno task start` 実行時に自動で読み込まれる。

### Slack Channelの作成

Slackで `copilot_request` channel を作成。
channelで `/invite` を実行して、作ったSlack Appを追加する。

## Copilot CLIプロンプトモードの使い方

- `-p` 対話モードではなく同期的なプロンプトモードでCopilotを呼び出す。このオプションの直後でプロンプトを渡す
- `--continue` 直前のセッションから再開する
- `--allow-all (または--yolo)` すべてのツール、パス、URL を許可する
- `--autopilot`
- `--max-autopilot-continues=500`
- `--silent` 使用状況などを消して応答だけ出力する。

```shell
copilot -p "挨拶して" --continue --allow-all --autopilot --max-autopilot-continues=500 --silent
```

※ `--allow-all (yolo)` オプションはユーザーの承認なしに全てのツール・URLへのアクセスを許可するので注意

## コマンド
- 起動: `deno task start`
