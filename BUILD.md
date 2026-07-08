# 构建与部署流程

## 文件结构

```
src/html/index.html     ← 原始模板（外部引用）
css/style.css           ← CSS 源文件
ts/*.ts                 ← TypeScript 源文件
www/                    ← 构建产物（已从 git 删除）
├── index.html          ← 内联 CSS/JS 的最终文件
├── css/style.min.css   ← 压缩后的 CSS
├── js/tool.js          ← 合并后的 JS
└── js/index.js         ← 压缩后的 JS
```

## 构建流程

### 本地构建

```bash
# 开发构建
npm run test

# 发布构建
npm run build
```

### 构建步骤

1. **clear** - 清理 tmp 目录
2. **genReadMe** - 生成 README.html
3. **cssmin** - 压缩 CSS → `www/css/style.min.css`
4. **copystatic** - 复制静态文件（.wasm, .js）
5. **build** - TypeScript 编译 → `tmp/`
6. **removetest** - 删除测试文件
7. **hash** - 计算哈希值
8. **combinejs** - 合并 JS → `www/js/tool.js`
9. **indexjs** - 压缩 index.js → `www/js/index.js`
10. **copytemplate** - 复制模板 `src/html/index.html` → `www/index.html`
11. **inlineHtml** - 内联 CSS/JS 到 HTML

## 自动部署

### GitHub Actions 配置

位置: `.github/workflows/pages.yml`

```yaml
on:
  push:
    branches: ["master"]  # 推送到 master 时触发

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - checkout 代码
      - npm ci
      - npm run build  # 构建 www/ 目录
      - 在 www/ 目录 git init
      - force push 到 page 分支
```

### 部署流程

1. 推送代码到 `master` 分支
2. GitHub Actions 自动触发
3. 执行 `npm run build` 生成 `www/` 目录
4. 将 `www/` 目录 force push 到 `page` 分支
5. GitHub Pages 从 `page` 分支部署

## 注意事项

- `www/` 目录已从 git 中删除，不会被提交
- `.gitignore` 已配置忽略 `www/` 目录
- 构建产物通过 CI 自动部署到 `page` 分支
- 本地开发时 `www/` 目录由构建命令生成
