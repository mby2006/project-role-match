# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

这是一个 Agent Skill 仓库：外层是分发仓库，内层 `project-role-match/` 是自包含、可安装的 Skill。它把目标岗位/JD 与项目源码对照，由智能体生成带源码证据的面试准备报告；随包 Node CLI 负责引用校验、质量门禁、Markdown/HTML 渲染、门禁回执和产物校验。

报告写入目标项目的 `.project-role-match/`，每次 `write` 产出同名的 `.md`、`.html` 和 `.receipt.json`。该目录已被 `.gitignore` 忽略。

## 常用命令

所有命令从仓库根目录执行。没有构建、打包或 lint 步骤，CLI 是可直接运行的零依赖 Node ESM。

```sh
npm test                                  # CLI + golden + metadata 测试
node --test test/cli.test.mjs             # 只跑 CLI 测试
node --test --test-name-pattern "strict" test/cli.test.mjs   # 只跑匹配的用例
npm run test:golden                       # 只跑三个示例的 golden 测试
npm run test:update-golden                # 有意修改报告/HTML/回执后刷新基线
npm run doctor                            # 检查安装后的 Skill 文件是否齐全
npm run release:prepare -- patch          # 发版准备；也可 minor / major / x.y.z
```

本地跑一个示例（`check` 不写文件，`write` 写三件产物，`verify` 校验回执）：

```sh
node project-role-match/bin/project-role-match.mjs check \
  --root examples/search --input examples/search-report.json --quality strict

node project-role-match/bin/project-role-match.mjs write \
  --root examples/search --input examples/search-report.json --quality strict

node project-role-match/bin/project-role-match.mjs verify \
  --root examples/search --receipt "<write 返回的 receiptPath>"
```

## 架构

### 外层仓库 vs 内层 Skill

- 仓库根目录：README、CHANGELOG、LICENSE、`llms.txt`、测试、示例、脚本、`package.json`
- `project-role-match/`：真正被安装的 Skill，只包含 `SKILL.md`、`LICENSE`、`bin/`、`references/`
- 安装器只复制内层目录，因此 **内层代码不能依赖仓库根目录的文件**。`bin/version.mjs` 是安装后仍可用的 fallback 版本来源；`resolveToolVersion()` 会优先读仓库根 `package.json`，读不到时回退到该常量。
- 仓库根 `package.json` 与 `bin/version.mjs` 的版本必须一致，`test/metadata.test.mjs` 会检查；`package.json` 的 license 也必须与 `LICENSE` 一致。

### CLI 流水线

`bin/project-role-match.mjs` 是唯一入口，按顺序：

1. 校验 JSON 输入并规范化匹配点（`role/basis/scope/matches/gaps/coverage`）
2. 逐条核对引用：文件存在、路径不越界、行号从 1 开始、摘录逐行完全匹配；换行统一为 LF
3. 运行质量门禁（`report-quality.mjs`）
4. 渲染 Markdown 和独立 HTML（`report-html.mjs`）
5. `write` 时并发生成三个文件：`.md`、`.html`、`.receipt.json`；三份文件共享同一序号，写入失败会清理
6. `verify` 时读取回执，校验 schema、质量状态、产物路径边界、文件存在性、SHA-256 和字节数

关键设计：

- `--quality standard`（默认）把结构问题记为 warnings；`--quality strict` 直接阻止写入。新报告、示例和 golden 一律使用 strict。
- 门禁包括：category + analysis 完整、每个匹配点至少 3 道追问、分类覆盖（`coverage` 声明或 `min(3, 匹配点数)` 个不同领域）、标题唯一。追问超过 5 道只提示。
- 回执 schema 为 `project-role-match.receipt/1`，包含四道 gate（citations/structure/questions/coverage）、错误/警告、统计摘要和两个产物的 SHA-256。
- `verify` 只证明回执记录的产物未被改动；它不重新校验源码引用，也不证明回执本身不可伪造。源码变化后需要重新分析或重新 `check`。
- HTML 是单文件、零外部请求，内联 CSS/JS，支持深浅色和折叠问答；所有报告内容都做 HTML 转义。

### 证据与质量约定

- `references/evidence-contract.md` 定义入口/实现/接入/运行四层证据和过度声明规则。修改分析流程或报告字段时先读它。
- `references/report-input.md` 是输入 JSON 的契约；新增字段要同步 CLI 校验、渲染器、回执和文档。
- 报告内容默认中文；代码、命令和 CLI 错误信息为英文。
- 引用路径必须相对项目根目录、用 `/`，不允许 `..`、`.git`；`.project-role-match/` 不作为源码证据。

## 测试与 golden

- `test/cli.test.mjs`：CLI 行为、安装后副本、引用校验、质量门禁、并发、回执、verify、HTML 转义
- `test/golden.test.mjs`：对 `booking`（后端）、`search`（前端）、`rag`（AI）三个示例跑 strict，逐字节比对 Markdown/HTML，并比对规范化后的回执
- `test/golden-helpers.mjs`：示例注册表、临时工作区渲染、回执规范化
- 回执在 golden 中会把 `tool.version`、`generatedAt` 和产物文件名中的日期替换为占位符；报告正文和 HTML 不含时间戳
- 只要有意改变报告文本、HTML 模板/CSS/JS 或回执结构，就必须运行 `npm run test:update-golden` 并审查基线 diff；否则不要更新
- `.gitattributes` 强制 LF；golden 测试逐字节比较，避免 Windows CRLF 漂移

## 示例

| 目录 | 岗位 | 覆盖 |
|---|---|---|
| `examples/booking` | 后端开发 | 数据库唯一约束、重复请求 |
| `examples/search` | 前端开发 | 防抖、AbortController、可访问组合框 |
| `examples/rag` | AI 应用开发 | 切分/检索阈值、重试、离线评测 |

示例项目是报告输入的可引用 fixture，不是可运行应用。

## 发布

- 日常改动：`npm test` → commit → push；不要手动改版本号或许可证。
- 发版：`npm run release:prepare -- <patch|minor|major|x.y.z>` 会检查工作区是否干净，同步 `package.json` 与 `bin/version.mjs`，插入 CHANGELOG 条目并运行完整测试；失败会自动恢复这三个文件。脚本不自动 commit/tag/push，按它输出的命令执行。
- 远程安装验证：
  `npx skills add https://github.com/mby2006/project-role-match/tree/main/project-role-match --skill project-role-match --copy`
- Skill 运行要求 Node 20+；`skills` 安装器要求 Node 22.20+。
