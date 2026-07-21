# 构建与部署流程

## 文件结构

```
src/
├── common/             ← 公共模块（base64js / blake2b / x25519 / ec）
├── html/
│   ├── index.html      ← 页面模板（占位 js/app.js）
│   ├── test.html       ← 测试页模板
│   └── fmt.html        ← 格式说明
├── index.ts            ← 主页面逻辑
└── test.ts             ← 测试页逻辑
css/style.css           ← CSS 源文件
build.mjs               ← esbuild 构建脚本
www/                    ← 构建产物（已从 git 忽略）
├── index.html          ← 内联 CSS + IIFE(com+index) 的最终文件
├── test.html           ← 内联 IIFE(com+test)
├── fmt.html
├── README.html
└── css/style.min.css
```

## 构建流程

### 本地构建

```bash
# 开发构建（保留 console，DEBUG 标记）
npm run test

# 发布构建（去掉 console，Release 标记）
npm run build
```

### 构建步骤（build.mjs）

1. **buildTS** - 逐文件编译 `src/common/*` → 拼接为 `tmp/com.js`
2. **buildIndex** - 编译 `src/index.ts` → `tmp/index.js`
3. **buildTest** - 编译 `src/test.ts` → `tmp/test.js`
4. **cpTemplate** - 复制 HTML 模板到 `www/`
5. **cssMin** - 压缩 CSS → `www/css/style.min.css`
6. **genReadMe** - README.md → `www/README.html`
7. **inlineHtml** - 内联 CSS；将 `js/app.js` 占位替换为单个 IIFE 包裹的脚本：
   - `index.html` = IIFE(`com.js` + `index.js`)
   - `test.html` = IIFE(`com.js` + `test.js`)

构建信息通过 esbuild `define` 注入：`__BUILD_MOD__`、`__BUILD_TIME__`（读取 `hash.txt` 写入 commit 短哈希）。

## 自动部署

### GitHub Actions 配置

位置: [`.github/workflows/pages.yml`](.github/workflows/pages.yml)

```yaml
on:
  push:
    branches: ["master"]  # 推送到 master 时触发

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - checkout 代码
      - setup-node@v4（node 20 + npm cache）
      - npm ci
      - git log -1 --format=%h > hash.txt
      - npm run build          # node build.mjs → www/
      - 在 www/ 目录 git init
      - force push 到 page 分支
```

### 部署流程

1. 推送代码到 `master` 分支
2. GitHub Actions 自动触发
3. 写入 `hash.txt` 后执行 `npm run build` 生成 `www/`
4. 将 `www/` 目录 force push 到 `page` 分支
5. GitHub Pages 从 `page` 分支部署

## 注意事项

- `www/` 目录已从 git 中忽略，不会被提交
- 构建产物通过 CI 自动部署到 `page` 分支
- 本地开发时 `www/` 目录由构建命令生成
- CI 不再使用 gulp；统一走 `build.mjs`（esbuild）
