# Project Role Match

把一个代码仓库与目标岗位或招聘 JD 对照，找出有源码证据的匹配点、面试讲述角度和待核实事项，在引用校验和质量门禁通过后生成 Markdown 与独立 HTML 报告。

报告先按技术领域给出岗位匹配总览，再逐项说明执行流程、设计取舍和适用边界。每个知识点附源码引用、面试讲法及带答案的追问。

内层 [`project-role-match/`](project-role-match/) 是按 [Agent Skills 开放规范](https://agentskills.io/specification) 打包的完整 Skill。能读取源码的智能体可以执行分析。具备终端访问权限和 Node.js 20+ 时，可以用随包 CLI 复核引用并写入报告。

## 使用

安装 Skill 后，在智能体中打开**想分析的项目**，发送下面这条指令。

> 用 project-role-match 分析当前项目。我想投后端开发岗，请根据源码找出最适合在面试里讲的亮点，把报告保存到项目里。

有 JD 时直接贴原文。Claude Code 也可以用 `/project-role-match`，Codex 可以用 `$project-role-match`。报告默认保存到目标项目的 `.project-role-match/YYYY-MM-DD-岗位.md`、同名 `.html` 和 `.receipt.json` 门禁回执，同日同岗位重复分析时三者追加同一序号。HTML 是可直接打开的独立文件，不依赖网络，支持浅色/深色主题和折叠问答。报告里的相对源码链接可以随项目一起移动。

### 直接读取 Skill

临时使用时，可以让智能体直接读取内层 [`SKILL.md`](project-role-match/SKILL.md)，按其中的流程分析目标项目。聊天助手也可以使用这份说明，将 `SKILL.md` 和目标项目中需要分析的源码一起提供给它，并附上岗位名称或 JD。只有聊天输出权限时，报告会在对话里以 Markdown 返回，证据范围限于助手实际读到的文件。

## 安装到项目

从目标项目根目录执行，将源路径替换为本仓库中直接包含 `SKILL.md`、`bin/` 和 `references/` 的内层 `project-role-match` 目录的绝对路径。

```sh
npx skills add "<源码仓库>/project-role-match" --skill project-role-match --copy
```

可以用 `--agent` 指定工具，也可以重复这个选项安装到多个工具。例如在上述命令后加 `--agent claude-code --agent opencode`。常见取值还有 `cursor`、`github-copilot`、`gemini-cli` 和 `codex`。跨项目使用时加 `--global`。[安装器用法与 Node.js 要求](https://github.com/vercel-labs/skills#install-a-skill) · [工具及安装目录](https://github.com/vercel-labs/skills/blob/main/docs/agents.md)

离线时，把整个内层 `project-role-match` 目录复制到所用工具的项目级 Skill 目录。例如 Claude Code 使用 `.claude/skills/`，Codex 和 OpenCode 可以使用 `.agents/skills/`。复制后可以运行 `node "<已安装的 Skill>/bin/project-role-match.mjs" doctor` 检查文件是否齐全。也可以把 [`llms.txt`](llms.txt) 交给智能体，请它按你指定的工具和安装范围操作。

## 本地试跑

从此仓库根目录执行。示例输入对应一个预约模块，可看到重复预约如何通过数据库约束处理。

```sh
node project-role-match/bin/project-role-match.mjs write --root examples/booking --input examples/booking-report.json --quality strict
npm test
```

运行后用浏览器打开 `examples/booking/.project-role-match/` 下生成的 `.html`，可以看到带目录、深浅色主题和折叠问答的报告；同目录的 `.receipt.json` 记录本次门禁结果和两个报告文件的 SHA-256。

`check` 与 `write` 使用同样的引用检查和质量门禁。`check` 只返回检查结果，`write` 额外生成同名 `.md`、`.html` 和 `.receipt.json` 并返回三个文件路径，`verify` 用回执复核产物是否被改动。输入字段说明见 [报告输入格式](project-role-match/references/report-input.md)。

## 示例

| 目录 | 目标岗位 | 演示内容 |
|---|---|---|
| `examples/booking` | 后端开发 | 数据库唯一约束、重复请求处理和返回已有记录 |
| `examples/search` | 前端开发 | 输入防抖、AbortController 请求取消、组合框可访问性 |
| `examples/rag` | AI 应用开发 | 重叠切分、检索阈值、模型调用重试和离线评测 |

每个目录包含可引用的源码，仓库根目录有对应的 `*-report.json` 报告输入。三套示例都通过 strict 门禁，并各有 Markdown、HTML 和回执的 golden 基线。换一个示例试跑：

```sh
node project-role-match/bin/project-role-match.mjs write --root examples/search --input examples/search-report.json --quality strict
```

## 质量门禁

`--quality standard`（默认）把结构问题作为警告；`--quality strict` 在写入前阻止以下问题：

- 知识点缺少 `category`，或缺少 `analysis` 中的执行流程、设计取舍、适用边界
- 每个知识点少于 3 道面试追问（超过 5 道只提示，不阻止）
- 分类覆盖不足：未声明 `coverage` 时，至少覆盖 `min(3, 知识点数)` 个不同技术领域；声明 `coverage` 后，每个领域都必须有对应知识点，或写入待核实事项并包含领域名称

标题重复在两种模式下都会被拒绝。岗位本身只涉及较少领域时，用 `coverage` 显式声明即可通过 strict。

每次 `write` 都会落盘 `<报告名>.receipt.json`，记录四道 gate（引用、结构、追问、覆盖）的状态、`errors`、`warnings`、统计摘要，以及 Markdown/HTML 的路径、SHA-256 和字节数：

```json
{
  "schema": "project-role-match.receipt/1",
  "tool": { "name": "project-role-match", "version": "0.4.0" },
  "ok": true,
  "quality": {
    "profile": "strict",
    "ok": true,
    "gates": [
      { "id": "citations", "status": "pass", "checked": 3, "total": 3 },
      { "id": "structure", "status": "pass", "checked": 1, "total": 1 },
      { "id": "questions", "status": "pass", "checked": 1, "total": 1 },
      { "id": "coverage", "status": "pass", "mode": "declared" }
    ],
    "errors": [],
    "warnings": []
  },
  "artifacts": {
    "markdown": { "path": ".project-role-match/....md", "sha256": "...", "bytes": 2637 },
    "html": { "path": ".project-role-match/....html", "sha256": "...", "bytes": 16797 }
  }
}
```

`check` 不写文件，但在 JSON 中返回同样的门禁结果（`quality`）。

生成后可以随时校验回执：

```sh
node project-role-match/bin/project-role-match.mjs verify --root "<项目根目录>" --receipt "<项目根目录>/.project-role-match/<报告名>.receipt.json"
```

成功时返回两个产物的 `status: "match"`、预期/实际 SHA-256 和字节数；文件缺失、被修改、路径越界或 schema 不匹配时返回非零退出码并列出具体原因。

## 测试

`npm test` 运行两部分：

- `test/cli.test.mjs`：CLI 行为、安装后副本、引用校验、质量门禁、回执与 `verify`
- `test/golden.test.mjs`：对 `booking`、`search`、`rag` 三个示例重新生成报告，逐字节比对 Markdown/HTML，并比对规范化后的回执

回执在比对前会把 `tool.version`、`generatedAt` 和产物文件名中的日期替换为占位符，避免时间相关字段导致基线漂移。golden 失败时会给出第一处差异行和对应的刷新命令。

有意修改报告格式、HTML 样式或回执结构后，运行：

```sh
npm run test:update-golden
```

只想跑 golden 测试时用 `npm run test:golden`。

## 仓库结构

```text
project-role-match/
├── README.md
├── SKILL.md                     # 指向可安装的 Skill
├── llms.txt
├── package.json
├── project-role-match/          # 可独立安装的 Skill 目录
│   ├── SKILL.md
│   ├── bin/                     # 引用与回执校验、质量门禁、Markdown/HTML 渲染
│   └── references/
├── examples/                   # 后端/前端/AI 三个示例与报告输入
├── scripts/                    # golden 基线更新脚本
└── test/                       # CLI、门禁、回执与 golden 输出测试
    └── golden/                 # 固定输入的 Markdown/HTML/回执基线
```
