# 前端开发 · 项目源码匹配报告

## 岗位匹配总览

**判断依据**　按前端开发岗的通用职责分析，重点检查交互性能、请求生命周期和可访问性。

**检查范围**　搜索组件的防抖、请求取消、状态处理与键盘/ARIA 实现，以及请求封装。

**版本**　本次检查的是工作区文件。

- **交互与性能**　输入防抖减少重复请求
- **异常处理**　取消过期请求并区分中止错误
- **可访问性**　键盘可操作的组合框语义

## 知识点详解

### 1. 输入防抖减少重复请求

**领域**　交互与性能

**对应岗位要求**　前端性能优化与请求控制

#### 项目做法

搜索框用 useDebouncedValue 把输入延迟 250ms 再触发查询，并在值变化或卸载时清理定时器。

#### 执行流程

用户输入更新 query；useDebouncedValue 在 effect 中启动 setTimeout；250ms 内再次输入会清理旧定时器并重新计时；debouncedQuery 稳定后才进入请求 effect，调用 searchNotes。

#### 设计取舍

固定 250ms 延迟实现简单，能减少输入过程中的请求；但不同交互节奏和网络条件需要不同延迟，当前没有自适应策略。

#### 适用边界

防抖不能替代服务端限流；同一查询重复触发时仍会重新请求；示例没有测量真实输入下的请求数量。

#### 源码证据

- [SearchBox.jsx](../SearchBox.jsx)（第 4 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 7 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 19 行）

#### 面试讲法

可以讲连续输入时如何用防抖把请求收敛到最后一次输入，以及为什么把防抖放在独立 hook 里。

#### 面试追问与答题要点

##### 1. 为什么把防抖放在独立 hook 里，而不是直接在输入事件里写 setTimeout？

组件里 query 是受控状态。hook 把原始输入和延迟输入分开，请求 effect 只依赖 debouncedQuery，输入变化不会直接触发请求。独立 hook 也便于复用和单独测试。

##### 2. 250ms 这个延迟是怎么取舍的？

示例固定 250ms，目标是过滤连续按键又保持响应感。延迟越长请求越少但反馈越慢；生产上应按输入节奏和网络状况调整，并用真实输入采样验证。

##### 3. 防抖和节流在这个场景有什么区别？

防抖关心停止输入后的最终值，适合搜索建议；节流按固定频率执行，适合滚动或拖拽。这里需要在用户停止输入后查询，所以选择防抖。

### 2. 取消过期请求并区分中止错误

**领域**　异常处理

**对应岗位要求**　竞态条件与错误处理

#### 项目做法

每次查询创建 AbortController，effect 清理函数调用 abort；AbortError 被忽略，其他异常写入 error 并切换到错误状态。

#### 执行流程

debouncedQuery 变化时创建 controller 并进入 loading；请求完成后写入结果和 ready；effect 清理时 abort 上一次请求；catch 中识别 AbortError 并直接返回，其他错误设置 error 并切换到错误状态。

#### 设计取舍

用 AbortController 取消过期请求，避免旧响应覆盖新结果；把 AbortError 当作正常控制流，不展示给用户。代价是请求封装必须把 signal 传到底层 fetch。

#### 适用边界

取消只发生在客户端，服务端可能已经处理了请求；示例没有处理超时、重试或离线队列。

#### 源码证据

- [SearchBox.jsx](../SearchBox.jsx)（第 29 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 32 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 39 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 43 行）
- [api.js](../api.js)（第 2 行）

#### 面试讲法

可以讲搜索竞态如何产生，以及 AbortController 如何保证旧请求不会覆盖新结果。

#### 面试追问与答题要点

##### 1. 为什么需要 AbortController，而不是只依赖 debounce？

防抖减少请求数量，但请求发出后用户仍可能继续输入。AbortController 让旧请求在 effect 清理时被取消，避免旧结果晚到覆盖新结果。

##### 2. AbortError 为什么要单独判断？

取消是主动行为，不是用户可见的失败。若不区分，组件会在用户正常输入时闪烁错误提示。示例在 catch 中识别 cause.name 后直接返回。

##### 3. 服务端已经处理了被取消的请求，怎么办？

客户端取消不代表服务端回滚。只读接口通常可以接受；涉及写入时应使用幂等键或服务端取消机制。示例只覆盖只读搜索。

### 3. 键盘可操作的组合框语义

**领域**　可访问性

**对应岗位要求**　Web 可访问性与键盘交互

#### 项目做法

输入框使用 combobox 语义并关联 listbox/option id；上下键移动 activeIndex，Enter 选择，Escape 清空；loading 和 error 分别使用 status/alert 角色。

#### 执行流程

输入框设置 role=combobox、aria-expanded、aria-controls 和 aria-activedescendant；列表项使用 role=option 与稳定 id；handleKeyDown 更新 activeIndex 或触发 onSelect；状态文本分别用 role=status 和 role=alert 播报。

#### 设计取舍

用 aria-activedescendant 保持焦点在输入框，键盘和鼠标共享一套选中状态；代价是需要为每个选项生成稳定 id，并自己处理边界移动。

#### 适用边界

示例没有覆盖屏幕阅读器的实际播报、焦点陷阱或虚拟滚动；选项数量大时仍需虚拟化。

#### 源码证据

- [SearchBox.jsx](../SearchBox.jsx)（第 70 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 71 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 73 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 49 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 86 行）
- [SearchBox.jsx](../SearchBox.jsx)（第 79 行）

#### 面试讲法

可以讲如何把自定义搜索下拉做成屏幕阅读器可理解、键盘可操作的组合框。

#### 面试追问与答题要点

##### 1. 为什么用 aria-activedescendant 而不是把焦点移到选项上？

焦点留在输入框可以继续输入，同时用 aria-activedescendant 告诉辅助技术当前选项。移到选项上会导致输入中断，还要处理焦点返回。

##### 2. ArrowDown 到列表末尾后会发生什么？

示例用 Math.min(index + 1, results.length - 1) 限制在最后一项，不会循环。是否循环是可访问性设计选择，需要和产品行为一致。

##### 3. loading 和 error 为什么要用不同 role？

role=status 是礼貌播报，适合加载提示；role=alert 会立即打断，适合需要用户注意的错误。还要控制播报频率，避免每次输入都打断用户。

## 待核实事项

- 防抖延迟、请求取消和键盘操作尚未在真实浏览器与屏幕阅读器中验证。
- 示例没有包含列表虚拟化或大数据量场景。
