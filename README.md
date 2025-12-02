# CET6 Focus · 离线刷题工作台

一个专门用于大学英语六级（CET-6）刷题的 Web 工作台，支持本地 PDF 真题、原生高清渲染、全套答题卡、自动保存与按年份归档。完全前端离线运行，不依赖后端服务。

在线访问（GitHub Pages 部署后）：

> https://mx-pai.github.io/cet6-zen/

（首次 push 到 `main` 并等待 GitHub Actions 部署完成后可用）

## 功能概览

- **本地 PDF 真题**
  - 左侧原卷 PDF（基于 pdf.js 渲染，支持缩放、页码切换、键盘左右箭头翻页）
  - 不上传服务器，文件仅在浏览器中使用

- **全套答题卡（右侧）**
  - Part I 写作：作文文本框 + 实时词数统计
  - Part II 听力：1–25 题，分 Section A/B/C，单题选择
  - Part III 阅读：26–55 题（选词填空 / 匹配 / 仔细阅读）
  - Part IV 翻译：长文本输入区

- **试卷管理**
  - 题库仪表盘：展示所有做过的试卷卡片
  - 支持 **批量导入** 多个 PDF 真题，按文件名自动生成标题
  - 自动从文件名中提取年份（如 `2023年12月 六级真题 第一套.pdf`），按年份分组折叠展示
  - 每套试卷显示完成进度条、创建时间、来源文件名

- **标注与草稿**
  - **PDF 标注**：左侧支持钢笔（红/蓝）、荧光笔、高亮，橡皮擦可单条擦除；标记按试卷和页保存
  - **草稿纸 & 单词本**：
    - 右侧单独的文本草稿区（textarea），适合记单词、句子或解题思路
    - 文本内容自动保存本地，退出 / 刷新 / 重开浏览器都能恢复

- **计时与自动保存**
  - 每套试卷有独立计时器：进入时开始计时，可「暂停 / 继续」
  - 所有答题、草稿、标注、计时信息都会在编辑后 ~1s 内自动保存到本地

- **完全离线**
  - 无登录、无云端存储，所有数据（答题、草稿、标注、PDF 文件）都保存在浏览器本地：
    - 元数据：`localStorage`（试卷列表、答案、notes、annotations、elapsedSeconds 等）
    - PDF 文件：`IndexedDB`（`cet6-zen-store / pdfs`）

## 本地开发

```bash
git clone https://github.com/mx-pai/cet6-zen.git
cd cet6-zen

npm install
npm run dev
```

开发环境默认地址通常是：

> http://localhost:5173/

## 构建 & 本地预览

```bash
npm run build
npm run preview
```

`npm run build` 会生成生产构建到 `dist/` 目录，`npm run preview` 启动一个本地静态服务器预览构建结果。

## GitHub Pages 部署

本仓库已配置好 GitHub Pages（基于 GitHub Actions + Vite 静态站点），只要 push 到 `main` 就会自动部署。

### 关键配置

- `vite.config.js`：

```js
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/cet6-zen/', // 仓库名
  plugins: [react()],
})
```

- GitHub Actions 工作流：`.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 部署步骤

1. 推送源码到 GitHub：

   ```bash
   git add .
   git commit -m "init cet6-zen"
   git push origin main
   ```

2. 在 GitHub 仓库中打开：
   - `Settings -> Pages`
   - 将 `Source` 配置为 `GitHub Actions`

3. 等待 Actions 构建完成，即可通过：

   > https://mx-pai.github.io/cet6-zen/

   在线访问。

## 技术栈

- 构建：Vite
- 前端：React 18+（函数组件 + Hooks）
- 样式：Tailwind CSS
- 图标：lucide-react
- PDF 渲染：pdf.js（CDN 加载）
- 持久化：`localStorage` + `IndexedDB`

## 数据与隐私

- 所有答题记录、草稿、标注、PDF 文件都保存在你的浏览器本地；
- 既不上传到 GitHub，也不会发送到任何服务器；
- 清空浏览器数据或在隐身模式下使用会导致记录丢失。

如果你想迁移数据，可以导出/备份浏览器的 `localStorage` 与 `IndexedDB`（`cet6-zen-store`），再导入到新的浏览器环境。此功能当前版本未在 UI 中直接提供。 

