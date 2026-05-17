# hensa（偏差）

Amazon のレビュー星分布から**標準偏差**（評価のばらつき）を計算して、商品ページに表示する Chrome 拡張です。

## できること

- 星1〜5の分布から加重平均・標準偏差を算出
- 「評価が一致している」「賛否が大きく分かれる」など4段階でばらつきを可視化
- 平均評価も5段階で表示

![ウィジェット例](https://raw.githubusercontent.com/ma2/hensa/main/screenshot.png)

## インストール

1. このリポジトリを ZIP ダウンロード、または `git clone`
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパーモード」をオン
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. クローンしたフォルダを選択

## 対応サイト

- amazon.co.jp
- amazon.com

## ファイル構成

```
hensa/
├── manifest.json   # 拡張機能の設定
└── content.js      # レビュー取得・計算・表示ロジック
```

## ライセンス

MIT
