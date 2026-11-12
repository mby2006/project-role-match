# 报告输入格式

传入一个 UTF-8 JSON 对象。`--input` 接受文件路径，`--input -` 从标准输入读取。示例结构如下。

```json
{
  "role": "后端开发",
  "basis": "按后端开发岗的通用职责分析。",
  "scope": "预约项目的接口入口与数据库定义。",
  "revision": "本次检查的是工作区文件。",
  "coverage": ["数据库与数据一致性"],
  "matches": [
    {
      "title": "防止重复预约",
      "category": "数据库与数据一致性",
      "requirement": "数据库约束与请求重试",
      "finding": "数据库约束限制同一用户对同一时段只产生一条预约。",
      "analysis": {
        "flow": "预约接口把用户和时段写入数据库，由组合唯一约束拦截重复记录。",
        "tradeoffs": "把重复判断放在数据库，多个请求处理器共享同一条约束。",
        "limits": "只覆盖同一用户和同一时段，无法证明一个时段只能被一人预约。"
      },
      "interview": "可以讲客户端重试时，数据库如何限制重复记录。",
      "questions": [
        {
          "question": "为什么不先查询再插入？",
          "answer": "查询和写入之间可能被其他请求插入，唯一约束才能在并发下保证结果。"
        },
        {
          "question": "唯一约束覆盖了哪些列？",
          "answer": "用户和时段的组合，而不是时段单独唯一。"
        },
        {
          "question": "如何验证重复请求的行为？",
          "answer": "并发提交相同用户和时段，断言最终只有一行。"
        }
      ],
      "evidence": [
        {
          "path": "schema.sql",
          "startLine": 5,
          "excerpt": "  UNIQUE (user_id, slot_id)"
        }
      ]
    }
  ],
  "gaps": ["并发行为尚未通过运行验证。"]
}
```

- `revision` 可省略，其他顶层字段必填。`scope` 写明实际检查的项目和模块。有 Git 时，在 `revision` 记录提交号及相关未提交改动。
- `matches` 按岗位相关性排序，每条至少有一个证据。`matches` 为空时，`gaps` 至少解释一个缺口。
- 新报告为每条匹配填写 `category`（技术领域）、`analysis`（包含 `flow`、`tradeoffs`、`limits` 三个字符串）和 `questions`（由 `question`、`answer` 对象组成的数组）。追问用单行问题，答案可用分段或项目列表。旧输入可以省略这三个字段，但 strict 质量门禁会拒绝，standard 模式只给警告。
- `coverage` 可省略，用于声明本次分析应覆盖的技术领域。声明后，strict 要求每个领域都出现在某个匹配的 `category` 中，或写入 `gaps` 并包含该领域名称。岗位本身涉及领域较少时，用它显式收窄覆盖范围。
- `path` 使用项目根目录相对路径及 `/` 分隔。`startLine` 从 1 开始。`excerpt` 为连续的完整源码行，保留缩进。可以用 JSON 的 `\n` 表示多行。CLI 统一换行格式后逐行比较。
- 报告使用证据生成文件链接和行号，源码摘录只用于核对。`finding` 和 `interview` 保持在证据能支持的范围。

## 质量门禁

`--quality standard`（默认）把结构问题作为警告；`--quality strict` 在写入前阻止以下问题：

- 知识点缺少 `category`，或缺少 `analysis` 中的 `flow`、`tradeoffs`、`limits`
- 每个知识点少于 3 道面试追问（超过 5 道只提示，不阻止）
- 分类覆盖不足：未声明 `coverage` 时，至少覆盖 `min(3, 知识点数)` 个不同领域；声明 `coverage` 后，每个领域都必须有对应知识点，或写入 `gaps` 并包含领域名称

标题重复在两种模式下都会被拒绝。引用校验失败或 strict 门禁失败时返回非零退出码，不写入文件。

## 输出

`check` 校验输入与源码，`write` 校验通过后保存同名的 Markdown、独立 HTML 和门禁回执。成功时标准输出为 JSON，含 `ok`、`matches`、`citations` 和 `quality`；写入时另外含 `path`（Markdown）、`htmlPath` 和 `receiptPath`。`quality` 包含 `profile`、`ok`、`gates`、`errors` 和 `warnings`。失败时返回非零退出码并输出原因。

### 回执

回执文件为 `<报告名>.receipt.json`，与报告使用同一序号。主要内容：

- `schema`、`tool`、`generatedAt`、`ok`
- `role`、`basis`、`scope`、`revision`、`declaredCoverage`
- `summary`：`matches`、`citations`、`questions`、`categories`、`gaps`
- `quality`：`profile`、`ok`、`gates`、`errors`、`warnings`；`gates` 依次为 `citations`、`structure`、`questions`、`coverage`，每项含 `status`（`pass`/`warn`/`fail`）、自己的计数和 `issues`
- `artifacts`：Markdown 和 HTML 的 `path`（项目根目录相对路径）、`sha256`、`bytes`

回执只在 `write` 成功时写入；`check` 不写文件，但返回同样的 `quality` 对象。

### 校验回执

`verify --root <项目根目录> --receipt <回执路径|->` 读取回执，重新计算 Markdown 和 HTML 的 SHA-256 与字节数，并检查回执 schema、产物是否缺失及路径边界。成功时输出每个产物的 `status: "match"`、预期/实际哈希和字节数；文件缺失、被修改、路径越界或 schema 不匹配时返回非零退出码并列出原因。`--receipt -` 从标准输入读取回执。
