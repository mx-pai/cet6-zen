# CET6-Zen 六级刷题工作台

一个本地优先的六级刷题小工具：左边看 PDF 真题，右边用标准答题卡做题，所有记录自动保存在浏览器里（不需要登录，不依赖服务器）。

线上访问（GitHub Pages）：

> https://mx-pai.github.io/cet6-zen/

> 如果刚配置完，需要等 GitHub Actions 跑完一次部署。

---

## 怎么用

### 1. 本地启动（开发/调试）

```bash
git clone https://github.com/mx-pai/cet6-zen.git
cd cet6-zen

npm install
npm run dev
```

浏览器访问终端提示的地址（一般是）：

> http://localhost:5173/

### 2. 构建上线版本（本地预览）

```bash
npm run build
npm run preview
```

`build` 后会生成 `dist/`，这是最终用于部署的静态文件。

---

## 功能说明（简版）

- 左侧：PDF 试卷
  - 上传本地六级 PDF（不会上传到服务器）
  - 支持放大/缩小、翻页、键盘左右键切页
  - 钢笔标记（红/蓝）、荧光笔、高亮、橡皮擦（单条擦除）

- 右侧：答题区
  - Part I 写作：作文输入 + 词数统计
  - Part II 听力：1–25 题选项卡
  - Part III 阅读：26–55 题（选词填空 / 匹配 / 仔细阅读）
  - Part IV 翻译：翻译输入框
  - 草稿纸 & 单词本：一个简单文本区域，适合记单词 / 句子 / 解题思路

- 题库页（Dashboard）
  - 批量导入多份 PDF 真题
  - 按文件名自动生成标题
  - 自动从文件名里识别年份，并按年份分组 + 可折叠
  - 显示每套试卷的完成进度

- 自动保存 & 计时
  - 所有答题、草稿、标注、计时会自动保存到浏览器本地
  - 每套试卷有独立计时器，支持暂停/继续

---

## GitHub Pages 部署说明

这个仓库已经配置好 GitHub Pages，只要 push 到 `main`，GitHub Actions 会自动构建并部署。

关键配置：

- `vite.config.js` 中设置了：

```js
export default defineConfig({
  base: '/cet6-zen/', // 仓库名，和 GitHub 仓库保持一致
  plugins: [react()],
})
```

- Actions 工作流：`.github/workflows/deploy.yml`

简化版流程：

1. 每次 push 到 `main`：
   - 自动执行 `npm install`
   - 自动执行 `npm run build`
   - 把 `dist/` 上传为 Pages 静态资源
2. 然后通过 `actions/deploy-pages` 发布到 GitHub Pages。

初次使用时需要在仓库里确认一次：

1. 打开仓库 `Settings -> Pages`
2. 把 `Source` 设置为：`GitHub Actions`

之后只要：

```bash
git add .
git commit -m "update"
git push origin main
```

几分钟后就可以在：

> https://mx-pai.github.io/cet6-zen/

看到更新后的界面。

---

## 数据存在哪

这个项目是完全前端离线的应用：

- 答题记录、草稿文本、标注信息等：存到 `localStorage`
- PDF 文件（二进制）：存到 `IndexedDB`（数据库名 `cet6-zen-store`）

换浏览器 / 清理浏览器数据 / 使用隐身模式都会影响这些本地记录。  
目前没有做导出/导入数据的 UI，如果有需要，后面可以再加一个简单的备份功能。

