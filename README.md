# discord-jukebox-v3

Discord Jukebox BOT🤖.  
Running on Node.js (in TypeScript)

---

## 実行方法

1. `.env.example` を参考に `.env` を作成
    > PaaS 環境の場合は `.env.example` を参考に環境変数を設定
2. 以下コマンドを実行

    ```
    # 初回起動時
    $ npm install
    $ npm start
    ```

---

## 環境構築メモ

### 環境情報

```
$ node -v
v22.9.0

$ npm -v
10.8.3
```

### インストール済みライブラリ

-   typescript
-   @types/node@22
    > `TypeScript v22` 用インテリセンス
-   ts-node
    > TypeScript を即時コンパイル、実行する
-   nodemon
    > ファイルの変更監視、変更時に `ts-node` を再起動する
    >
    > > 詳細な使用内容は `package.json` の `run-scripts` を参照
-   discord.js
    > [discord.js - Documentation](https://discord.js.org/#/docs/discord.js/main/general/welcome)  
    > [discord.js - Guide](https://discordjs.guide/)
-   @discordjs/voice
    > `discord.js` 音声操作用ライブラリ
-   dotenv
    > 環境変数参照用ライブラリ（ローカル⇔本番の環境差異吸収）

### トラブルシューティング

---

## TODO
