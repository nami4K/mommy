# 함께 들어 있는 라이브러리

| 파일 | 라이브러리 | 버전 | 라이선스 |
| --- | --- | --- | --- |
| `anthropic-sdk.min.js` | `@anthropic-ai/sdk` (esbuild로 묶음, `window.Anthropic`) | 1.8.0 | Apache-2.0 (`LICENSE-anthropic-sdk.txt`) |
| `qrcode.js` | `qrcode-generator` (Kazuhiko Arase) | 2.0.4 | MIT |
| `jsQR.js` | `jsqr` | 1.4.0 | Apache-2.0 (`LICENSE-jsqr.txt`) |

다시 만들기: `npm install @anthropic-ai/sdk@1.8.0 esbuild` 후
`echo "import A from '@anthropic-ai/sdk'; window.Anthropic = A;" > entry.js && npx esbuild entry.js --bundle --minify --format=iife --platform=browser --target=es2020 --outfile=anthropic-sdk.min.js`
