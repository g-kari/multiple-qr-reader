# テスト用QRコード

このディレクトリには、アプリケーションのテスト用QRコードが含まれています。

## 使用方法

1. 下記のQRコードをスクリーンショットまたは印刷
2. アプリケーションの「ファイルから読み取り」機能でテスト
3. 複数のQRコードを同時に含む画像でテスト

## テストケース

### 単一QRコード

- **テキスト**: "Hello, World!"
- **URL**: "https://github.com/g-kari/multiple-qr-reader"
- **JSON**: {"name": "Test", "version": "1.0"}

### 複数QRコード

- 2個のQRコードが含まれる画像
- 4個のQRコードが含まれる画像
- 異なるサイズのQRコードの組み合わせ

### 困難なケース

- 低コントラスト画像
- 歪んだ角度のQRコード
- 部分的に隠れたQRコード
- 小さいサイズのQRコード

## QRコード生成

QRコードの生成には以下のツールが利用できます：

- [QR Code Generator](https://www.qr-code-generator.com/)
- [Google Chart API](https://developers.google.com/chart/infographics/docs/qr_codes)
- [qrcode.js](https://github.com/davidshimjs/qrcodejs)

## テスト結果の評価

- **検出率**: 正しく検出されたQRコードの割合
- **精度**: 誤検出の数
- **処理時間**: 検出にかかった時間
- **信頼度**: 各検出の信頼度スコア