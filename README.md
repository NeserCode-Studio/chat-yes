# Chat Yes

连接自定义 OpenAI-compatible `chat/completions` 服务的多智能体桌面对话工作台。

Chat Yes 面向需要同时管理多个模型、比较不同角色输出、控制上下文成本并追踪运行状态的场景。应用基于 Tauri 2、Vue 3 和 TypeScript 构建，智能体配置、会话消息和用量保存在本机，API Key 默认仅存在于当前进程内存。

## 当前能力

- **多智能体会话**：选择多个参与者，按配置顺序和轮次运行；AI 输出中的 `@名称` 可以路由下一位发言者。
- **发言模式**：圆桌模式让参与者按顺序各发言一次；接力模式由 AI 点名交接，未交接则结束当前链路。
- **自定义连接**：支持服务根地址、版本化地址或完整 `/chat/completions` 地址。
- **流式响应**：实时展示文本增量，并支持立即停止。
- **推理过程**：兼容 `reasoning` / `reasoning_content`，并在消息内折叠展示。
- **模型控制**：角色、行为预设、系统指令、采样参数、最大输出、上下文窗口、超时和重试。
- **可复用设置预设**：连接、模型行为、生成限制、记忆、权限与会话运行限制均可独立绑定和解绑。
- **记忆**：为每个智能体维护长期笔记，可单独启用或关闭记忆读取权限。
- **权限门禁**：网络访问、共享上下文、自动轮次、记忆读写分别控制。
- **三级设置中心**：应用偏好、AI 智能体配置、当前会话参与者与运行限制分层管理。
- **聊天字体栈**：通过独立 Dialog 从桌面端选择本机已安装字体系列，支持搜索、刷新、多选、已选顺序管理、最近选择记忆与回退。
- **用量与预算**：记录输入/输出 Token、请求数、累计延迟，并在会话级设置轮次、请求和 Token 上限。
- **本地持久化**：智能体与会话元数据使用独立键保存，消息按会话分片保存。
- **诊断导出**：从运行检查器选择保存位置并导出 JSON，包含会话配置、参与者配置、用户消息、AI 回复、事件和完整思考内容；不包含 API Key。
- **桌面集成**：保留无边框标题栏、托盘、命令面板、主题和中英双语。

## 快速开始

### 环境

- Node.js 24+
- pnpm 12+
- Rust stable
- Tauri 平台依赖

### 安装与运行

```bash
pnpm install --frozen-lockfile
pnpm dev
```

桌面联调：

```bash
pnpm tauri:dev
```

### 验证

```bash
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

`pnpm build` 会执行 `vue-tsc --noEmit` 和 Vite 生产构建。当前测试覆盖领域函数、SSE 客户端和会话编排。

## 配置智能体

1. 打开“设置”，进入 AI 分区。
2. 添加智能体并填写服务地址与模型 ID。
3. 如服务需要鉴权，填写 API Key。
4. 按需要调整系统指令、模型参数和权限。
5. 打开“对话”分区配置参与者、模式和运行限制。
6. 返回会话后发送消息。

服务地址支持以下形式：

```text
http://localhost:1234
http://localhost:1234/v1
https://example.com/v1/chat/completions
```

前两种会自动补全为 `/v1/chat/completions`。

## 安全边界

- API Key 不写入 `localStorage`，关闭应用后需要重新输入。
- 智能体请求必须满足网络权限；后续自动轮次还必须满足共享上下文和自动轮次权限。
- 当前版本不会执行模型提出的工具调用，也不会让模型直接访问文件系统。
- “写入记忆”权限为后续智能体主动记忆能力预留，当前不会自动写入。
- Tauri HTTP 白名单允许 HTTP/HTTPS 自定义服务，这是连接任意自建端点的必要条件；应用层仍通过智能体权限逐次校验。

## 性能策略

- 同一会话同一时间只允许一个运行任务。
- 流式文本直接更新当前消息，不重建整段会话。
- 上下文按字符和 CJK 比例估算 Token，并从最新消息向前裁剪。
- 请求开始前检查预计输入和最大输出是否会突破会话预算。
- 已经输出部分内容后不自动重试，避免重复文本。
- 消息按会话分片保存，降低单次序列化体积。

## 项目结构

```text
src/
├── features/chat/
│   ├── api.ts              # OpenAI-compatible 流式客户端
│   ├── domain.ts           # 上下文、预设、用量纯函数
│   ├── orchestrator.ts     # 多智能体顺序编排与权限门禁
│   ├── persistence.ts      # 分片本地持久化
│   ├── store.ts            # Pinia 会话工作区状态
│   ├── validation.ts       # 连接校验与 URL 归一化
│   └── components/         # 会话栏、消息流、输入区、运行检查器
├── views/Home.vue          # 三栏会话工作台
├── views/Settings.vue      # 智能体控制中心
├── components/frameworks/  # 标题栏、命令面板、设置与关于弹窗
└── store/                  # 主题、语言、标题和弹窗状态
```

## 数据与兼容性

- 存储键使用 `chat-yes.*.v1` 前缀。
- 会话消息键格式为 `chat-yes.messages.v1.<conversationId>`。
- 服务需接受标准 OpenAI `messages`、`temperature`、`max_tokens`、`stream` 字段。
- 流式响应按 SSE `data:` 事件解析，兼容可选的 `reasoning` / `reasoning_content` 与最终 `usage` 事件。
- 服务未返回 usage 时，应用使用上下文和响应长度估算。

## 已知边界

- API Key 的系统级安全持久化尚未实现。
- 智能体主动写入记忆尚未启用。
- 尚未提供会话导入、成本价格表和跨设备同步。
- 自主发起对话、导演 Agent、工具调用和更复杂的评审编排尚未实现。

## 技术栈

Tauri 2 · Vue 3 · TypeScript · Pinia · Tailwind CSS 4 · shadcn-vue / Reka UI · Vue Router · VueUse · Vitest

## 许可

[MIT](LICENSE)
