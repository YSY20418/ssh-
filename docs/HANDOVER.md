# 小鱼儿 · 交接文档

> 这份文档是项目所有阶段资料的总入口，把**项目本身**讲清楚：
>
> - 它是什么、解决什么问题、跑什么命令、产物长什么样；
> - 页面里**每一个对话框（弹窗、面板、入口卡片、对话流程）的触发条件、行为、可关闭方式、与上下文的联动**——这是把产品「从代码读出来」的关键一节；
> - 已经踩过的坑、还有什么没做、移交时该交代什么。
>
> 它不是 README 的复制：README 是「用户从零跑起来」的入口；这份文档是「接手这个项目的人一天之内把每一行代码为什么在那、知道这件事是什么角色」的入口。
>
> 同源 HTML 单页版：`docs-site/handover.html`（离线可打开，结构相同）。

---

## 一、这个项目是什么

### 1.1 一句话

面向银发群体的 **AI 网页代驾**：老人用口语或语音说出需求，四个智能体在真实网页流程中替他跑完挂号 / 缴费等全部步骤；涉及不可撤销的高危动作时，强制停下等待本人授权。

### 1.2 范式：与常见 AI Web 产品的差异

| 维度 | 常见 AI Web 产品 | 小鱼儿 |
| --- | --- | --- |
| AI 的角色 | 顾问：告诉你怎么做 | 代办者：直接替你做完 |
| 交互范式 | 人操作网页，AI 在旁边答疑 | 人说话，AI 操作网页 |
| 网页形态 | 为人设计的 DOM | 为人渲染，同时为 Agent 暴露**能力清单** |
| 风险控制 | 无 | 高危动作强制人工授权 + 全程审计 + 敏感值脱敏 |
| 兜底 | 模型不可用即不可用 | 大模型与规则引擎双链路，无缝降级 |

### 1.3 演示形态一览

仓库里有**两类交付物**，分别面向不同场景。

| 形态 | 路径 | 怎么打开 | 适用场景 |
| --- | --- | --- | --- |
| 主控台（Next.js） | `app/page.tsx` | `npm install && npm run dev`，开 `http://localhost:3000` | 看四智能体协同、能力清单、审计日志、轨迹回放 |
| 适老预约挂号页 | `public/elder/index.html` | **双击** index.html，或 `npm run serve:static public` | 给老人用的纯静态页，含语音助手、小医灵 |
| 适老页单文件版 | `public/elder/standalone.html` | 双击即可 | 手机端最稳（无任何外链，无编码问题） |

被代驾的两个站点（市第一医院 / 市民之家）通过 `/sim/city-hospital` 与 `/sim/citizen-hall` 路由访问，由主控台 iframe 承载。

---

## 二、技术栈与零成本约束

- **前端**：Next.js 15 App Router + React 19 + Tailwind v4
- **AI 接入**：Vercel AI SDK + OpenAI 兼容协议（智谱 GLM / SiliconFlow / OpenRouter / Ollama 任选）
- **类型系统**：TypeScript strict，`tsc --noEmit` 零错误
- **适老页**：零框架、零依赖、纯 ES5；`file://` 双击可开
- **零成本兜底**：未配置 `LLM_API_KEY` 时自动走规则引擎，链路完全一致；不填 Key 必须能完整演示

---

## 三、目录结构（按角色梳理）

```
webpilot/
├─ app/                                  # Next.js 主控台
│  ├─ page.tsx                           # 主控台（SSE 事件流消费 + 授权卡片 + 站点切换）
│  ├─ sim/[site]/page.tsx                # 被代驾站点容器（postMessage 协议）
│  ├─ layout.tsx / globals.css
│  └─ api/
│     ├─ agent/route.ts                  # Agent 事件流（SSE）
│     ├─ confirm/route.ts                # 人工授权
│     ├─ mcp/route.ts                    # 标准 MCP 能力服务器（JSON-RPC 2.0）
│     ├─ session/route.ts                # 会话查询与重置
│     ├─ audit/route.ts                  # 审计日志（脱敏后输出）
│     └─ eval/route.ts                   # 评测结果
├─ components/
│  ├─ SimSite.tsx                        # 站点无关渲染器（能力清单 + ARIA）
│  ├─ TechPanels.tsx                     # 技术面板：能力清单 / 审计 / 评测 / 回放
│  └─ VoiceInput.tsx                     # 语音输入
├─ lib/
│  ├─ agents/                            # 四智能体
│  │  ├─ engine.ts                       # 编排主循环 + 自我反思
│  │  ├─ prompts.ts                      # 四角色提示词
│  │  ├─ rules.ts                        # 规则引擎（零成本兜底）
│  │  ├─ llm.ts                          # 大模型接入与引擎选择
│  │  ├─ capmatch.ts                     # 能力语义检索
│  │  └─ events.ts                       # SSE 事件协议
│  ├─ safety/guardian.ts                 # 风险裁决 / 注入检测 / 脱敏
│  ├─ rag/guides.ts                      # 办事指南知识库与 TF-IDF
│  ├─ mcp/core.ts                        # MCP 协议核心（服务端与浏览器共用）
│  ├─ runtime/                           # 浏览器内运行时（静态形态用）
│  ├─ sim/                               # 站点协议 + 两个站点实现 + 注册表
│  └─ store.ts                           # 会话状态机与审计日志
├─ data/
│  ├─ corpus.json                        # 本地对话数据库（唯一手改的话术文件）
│  └─ medic-kb.json                      # 本地医学知识库
├─ public/elder/                         # 适老预约挂号页（独立交付物）
│  ├─ index.html                         # 五步流程骨架 + 语音条 + 操作栏
│  ├─ styles.css / app.js                # 页面样式与主逻辑
│  ├─ icons.js                           # 29 个内联 SVG 图标
│  ├─ speech.js                          # 离线语音识别（浏览器内 Whisper）
│  ├─ ai.js / ai.css                     # 语音智能助手
│  ├─ corpus.js                          # 语料库编译产物
│  ├─ medic-kb.js                        # 医学知识库编译产物
│  ├─ medic.js / medic.css               # 小医灵
│  └─ standalone.html                    # 单文件版（全部内联）
├─ scripts/
│  ├─ demo.mjs                           # 一键演示启动器
│  ├─ eval.mjs / acceptance.mjs / verify.mjs
│  ├─ build-static.mjs / fix-static-paths.mjs / serve-static.mjs
│  ├─ build-corpus.mjs / check-corpus.mjs
│  ├─ build-medic.mjs / check-medic.mjs
│  ├─ build-elder-single.mjs
│  ├─ check-elder.mjs / check-docs.mjs
│  ├─ server.mjs / start-cloud.mjs
│  └─ trace-guard.cjs
├─ docs/                                 # 所有阶段文档
│  ├─ ACCEPTANCE.md                      # 功能验收（自动生成）
│  ├─ voice-corpus.md                    # 小鱼兒实现依据与话术手册
│  ├─ voice-medic.md                     # 小医灵实现依据与话术手册
│  ├─ hospital-flow-notes.md             # 真实挂号流程审核与提炼
│  ├─ workbuddy-overlay.md               # 平台 Workbuddy 字眼诊断与处置
│  ├─ devlog-2026-10-10.md               # 早期阶段日志
│  ├─ devlog-2026-10-11.md
│  ├─ devlog-2026-10-13.md
│  ├─ devlog-2026-10-14.md
│  └─ devlog-2026-10-15.md
└─ docs-site/
   ├─ index.html                         # 项目知识中心（HTML 展示页）
   ├─ handover.html                      # 交接文档（HTML 单页版，与本文件同源）
   └─ acceptance.html                    # 验收报告 HTML 版
```

---

## 四、所有对话框（弹窗 / 面板 / 入口卡片 / 对话流程）

> 每一个「会跳出来回应用户」的可交互元素都列在这里。约定：
> - **触发**：在什么条件下出现
> - **行为**：能做什么、不能做什么
> - **关闭**：怎么关
> - **联动**：和上下文的哪些地方同步
>
> 元素命名沿用源码里的 `id` / `class`，方便读代码时对上号。

### 4.1 主控台（Next.js / app/page.tsx）

#### 授权卡片（`need_confirm` 高危授权弹窗）

- **触发**：四智能体链路发出 `need_confirm` 事件——Guardian 判定当前动作是 high 风险（提交、支付、删除等）。
- **位置**：主控台右侧「执行轨迹」面板内，**就地嵌入**（不是覆盖全屏），用淡黄描边卡片（`bg-[#fffaf0]` + `border-[#e0b563]`）。
- **行为**：
  - 显示一句人话化的解释（`confirm.reason`），让老人知道「系统要在这一步做什么、为什么要等」；
  - 显示「待执行动作：xxx」（`confirm.label`）；
  - 提供两颗按钮：**「我确认，让它提交」**（实心深黄）→ 调 `postConfirm({ grant: true })`；**「先不要」**（白底描边）→ 调 `postConfirm({ grant: false })`；
  - 「先不要」被点后流程**立即终止且不产生回执**——这是兜底，不是错误。
- **关闭**：点两颗按钮之一即关闭卡片、继续或终止流程；**没有外部取消**——授权是强制门禁。
- **联动**：
  - SSE 事件流 → 右侧轨迹区追加一条 `need_confirm` 留痕；
  - 后端 `confirm.actionId` 与当前页能力清单核对，越权授权会被服务端的 Guardian 二次拦截；
  - 用户授权后事件流继续推进；拒绝则事件流在 `confirm` 处终止并显示「流程已被取消」。

> 同样的「高危授权」闸门在适老页**也会出现一次**，见 4.2.1 的「高危确认弹窗」。

### 4.2 适老预约挂号页（public/elder/index.html）

> 适老页有 12 个对话框 / 面板 / 入口卡片 / 控件条 / 流程节点，按用途分 5 组：**弹窗类**、**控件条类**、**入口卡片类**、**面板与悬浮物类**、**流程节点类**。每个对话框都按 触发 / 位置 / 行为 / 关闭 / 联动 五段描述。

#### 弹窗类（`#modal` 共用容器，三种用途）

**信息缺失提示弹窗（`alertDialog`）**

- **触发**：点底部「下一步」但当前步骤必选项未选完（`canGoNext()` 返回 false 时）——例如第 1 步没选症状就点下一步。
- **位置**：全屏居中覆盖（`.modal` + 半透明遮罩 `.modal__mask`）。
- **行为**：标题是固定的「还需要再选一项」（`dialog.needTitle`），正文用一句大白话告诉老人「还需要再选 XXX」（如「还需要选您要看的症状」「还需要选付款方式」），单一按钮「好」（`dialog.ok`）。
- **关闭**：点「好」、点遮罩、按 Esc。
- **联动**：
  - 焦点自动落在「好」上（避免老人按 Tab 跑到背景里）；
  - Tab 焦点锁在弹窗内（`trapFocus()`），不会跑到背后的页面上；
  - 不影响页面状态——关闭后仍可继续点缺失的项。

**高危确认弹窗（`confirmDialog`）**

- **触发**：第 4 步核对页点「下一步」且**四项信息齐全**时（已选症状→科室→医生→时间→就诊人→付款方式），这是整页唯一的不可撤销动作。
- **位置**：全屏居中覆盖（同上 `alertDialog` 的 `#modal` 容器）。
- **行为**：
  - 标题是「请再核对一下您要挂的」（`dialog.confirmTitle`）；
  - 正文把刚才选的所有项拼成一段通顺的话（`dialog.confirmBody`，含 `{dept}` `{doctor}` `{time}` `{patient}` `{pay}` 五个占位符）；
  - 两颗按钮——**「先不要」**（`dialog.confirmNo`，白底）和**「确认预约」**（`dialog.confirmYes`，实心深青绿主色）；
  - 弹窗出现的**同时**用语音朗读一遍标题 + 正文（`speak()`），让老人听到自己选了什么。
- **关闭**：点两颗按钮之一；点遮罩、按 Esc **不会关**——故意屏蔽外部取消，避免「误触到闲」导致预约错挂。
- **联动**：
  - 标记 `pendingConfirm = true`，语音助手在此期间**只听「确认 / 取消」**，其他话一律被吞（`understand()` 的第一关），守护老人在弹窗里的注意力；
  - 点「确认预约」→ `submitBooking()` 生成取号码（`A` + 3 位数，基于四项信息的哈希），跳到第 5 步成功页，`pendingConfirm = false`；
  - 点「先不要」→ 弹窗关闭、流程停在第 4 步不动，所有选项保持原状，可继续修改。
- **对应规则引擎**：第 4 步所有信息齐全是 `XiaoYuEr.capabilities` 中 **`submit` 能力**接受的前提；信息不全直接拒绝执行（call 返回 `{ok:false}`），并由文字提示兜底。

**帮助弹窗（`helpDialog`）**

- **触发**：点底部「需要帮助」按钮（`#btn-help`），或在第 1-4 步停住 75 秒不动时点空闲条上的「需要帮助」（见「空闲关怀条」）。
- **位置**：全屏居中覆盖（`#modal`）。
- **行为**：
  - 标题「要帮您做点什么？」（`dialog.helpTitle`）；
  - 正文三条要点（`dialog.help1` / `help2` / `help3`，介绍每一步该做什么、用语音怎么说话、随时可以重新选）；
  - 两颗按钮——**「念一遍」**（`dialog.helpSpeak`，点一下会用语音把三条要点念出来）和**「关」**（`dialog.close`）。
- **关闭**：点「关」、点遮罩、按 Esc。
- **联动**：
  - 弹窗打开时**自动用语音朗读**标题 + 三条要点（`speak()` 调用）——老人打开就能听见，不必读字；
  - 「念一遍」按钮可重复触发（**朗读态**`#voicebar[data-speaking="1"]` 切换，会自动显示「停止朗读」按钮）。

#### 控件条类（顶部 / 底部常驻）

**语音朗读按钮（`#voicebar` / `#btn-speak` / `#btn-stop`）**

- **触发**：每一步顶部都常驻；点「听一遍」（`#btn-speak`）就读当前步骤的当前页文案；点「停止朗读」（`#btn-stop`，默认隐藏，朗读态才出现）立刻停。
- **位置**：每步标题与内容之间，常驻可见。
- **行为**：
  - 用 `speechSynthesis` 朗读当前步骤的语音脚本（`stepVoice()` 按步骤返回 1-3 句话的简短引导）；
  - 朗读中再次点「听一遍」会先停再说；点「停止朗读」立刻停；
  - 朗读中 `#btn-stop` 显示（CSS 把默认 `hidden` 去掉），避免老人看不到怎么停；
  - **朗读被打断（手动 stop 或句末自然结束）后**：`data-speaking` 复位为 `0`，按钮文字回到「听一遍」。
- **关闭**：本身就是过渡态控件，不需要关闭。
- **联动**：
  - 打开帮助弹窗时**自动朗读**弹窗内容；按「念一遍」按钮**重复触发**朗读；
  - 与 `speak()` 同一条通道——若用户已经在朗读，又触发了一次朗读，**会自动 stop 再 start**，避免叠加；
  - 朗读中切换语言，**朗读态立刻结束**（`speak()` 内部有 cancellationToken）。
- **配套可达性**：`#live`（`role="status" aria-live="polite"`）同时把朗读内容落到可见的「实时区域」，让听力下降的老人也能看到字。

**空闲关怀条（`#idlebar`）**

- **触发**：进入第 1-4 步后开始计时；若 **75 秒**（`IDLE_MS = 75000`）内没有任何点击 / 按键 / 触摸（`click` / `keydown` / `touchstart` 三个事件），提示条从底部上方滑出。
- **位置**：底部操作栏上方（`#actionbar` 之上），`z-index: 41`。
- **行为**：
  - 一句温和的问句（`idle.text`，如「需要我帮您看看下一步吗？」）；
  - 两颗按钮——**「需要帮助」**（`#idlebar-help`，黄底）和**「不用」**（`#idlebar-close`）。
- **关闭**：
  - 点「不用」立刻隐藏；
  - 任意用户输入（点击 / 按键 / 触摸）→ `resetIdle()` 重置计时并隐藏；
  - 离开第 1-4 步范围（例如到第 5 步成功页或第 0 步开始页）→ 自动隐藏；
  - 不会因为点击它自己就消失（避免「点了还没出现」的尴尬）。
- **联动**：
  - 出现时给 `<body>` 加 `idle-on` class，留作 CSS 钩子（如让底部操作栏让位 padding）；
  - 点「需要帮助」→ **直接打开「帮助弹窗」**——这条路径是空闲关怀的实际价值。

#### 入口卡片类

**小鱼兒入口卡片（`#ai-inline` / `#ai-inline-open`）**

- **触发**：常驻第 0-5 步全部页面，第 0 步作为主 CTA「让小鱼兒替您办」（`ai.inlineTitle` + `ai.inlineDesc`），其他步骤作为入口提示；点开卡片本身即开面板。
- **位置**：流程主区末尾，第 0 步紧跟开始按钮下方。
- **行为**：
  - 卡片左侧「鱼」字 logo（`ai-inline__mark`）+ 中部标题/描述 + 右侧 chevron（›）；
  - 点卡片 → 打开「小鱼兒语音助手面板」。
- **关闭**：它本身是入口，不是弹窗；没有关闭动作。
- **联动**：
  - 这是**全页唯一打开语音助手的方式**——小鱼兒没有悬浮按钮（`aifab` 已移除，避免和「小医灵悬浮光点」冲突）；
  - 老人找得到入口：第 0 步是大卡片，后续步骤是小卡片。

**小医灵入口卡片（`#medic-inline` / `#medic-inline-open`）**

- **触发**：常驻第 0-5 步全部页面，紧跟小鱼兒入口之后；点开卡片本身即**打开面板**（注意：与小鱼兒不同，**小医灵有悬浮光点**也有入口卡片——老人想用哪个都行）。
- **位置**：流程主区末尾，第 0 步紧跟小鱼兒入口下方。
- **行为**：
  - 卡片左侧听诊器图标（`data-icon="stethoscope"`）+ 中部标题/描述（`medic.inlineTitle` 「不舒服？先问小医灵」+ `medic.inlineDesc` 「先排危险信号，再去挂号」）+ 右侧 chevron；
  - 点卡片 → 打开「小医灵面板」。
- **关闭**：本身是入口。
- **联动**：与小医灵悬浮光点共享同一份预问诊引擎，点哪个入口都打开同一面板。

#### 面板与悬浮物类

**小鱼兒语音助手面板（`#ai-panel` / `.ai`）**

- **触发**：点小鱼兒入口卡片；或在确认窗期间（高危确认弹窗）由代码主动打开。
- **位置**：右侧抽屉 / 底部弹出（CSS 通过 `.ai` 容器 + 媒体查询控制位置，桌面右侧抽屉，手机底部全宽）。
- **行为**：
  - 标题栏（`ai-title`）「小鱼兒 · 替您一步步辦」+ 状态行（麦克风状态：已允许 / 被拦住 / 还没问过 / 查不出来）；
  - 对话气泡区（`ai-log`）：助手气泡（淡青绿底）+ 用户气泡（白底 + 描边），按时间顺序排列；
  - 麦克风按钮（`ai__mic`，**点一下开始听，再点停止**——不是「按住说话」）；
  - 「常说的话」chips 区（`ai-chips`）：根据当前步骤给出 6-8 张建议卡片（**点击即等同于用那句话说话**），例如第 1 步「我腿疼」「我头晕」「我胃不舒服」；
  - 步骤提示行（`ai-step`）：当前是第几步、下一步建议做什么。
- **关闭**：
  - 右上角 `×` 按钮；
  - 点遮罩（`.ai__mask`）；
  - 按 **Esc**（**挂在 `document` 上，不依赖焦点**——老人点开面板后鼠标点遮罩，焦点根本不在面板里，这条路径是修「打开了无法关闭」的核心）；
  - **三条路径都接真实鼠标事件**（CDP `Input.dispatchMouseEvent`），不用 `el.click()`（合成点击绕过命中测试）。
- **联动**：
  - 入口卡片被点击 → 面板打开 → 自动聚焦到麦克风按钮；
  - 麦克风状态行由 `navigator.permissions.query` 包装，每次停下都重读（老人可能在浏览器里改过设置）；
  - 被浏览器拦截时（`NotAllowedError`）→ 状态行变「被拦住」、展开**三步恢复指引** + 「再试一次麦克风」按钮；
  - 用户的语音识别结果**走四道关**：确认窗开着只听确认取消 → 页面控制命令（念 / 停 / 字号 / 前后步）→ 业务动作（症状 / 科室 / 医生 / 时间 / 付款 / 提交）→ 都不命中才进对话层（`corpus.match()`）；
  - 业务动作的取值**只能来自当前可选项**（`XiaoYuEr.options()`），说一个页面上没有的（例如「挂心脏病科」）被挡回；
  - 业务动作的步骤闸门（`STEP_GUARD`）：选医生只能在第 2 步、付款只能在第 4 步，在错误步骤说不会被乱执行；
  - 「确认预约」只在第 4 步有 `pendingConfirm=true` 时生效，**否则只把确认窗叫出来**——高危授权闸门被语音也遵守；
  - **离线 + 云端双链路**（`speech.js`）：离线引擎（浏览器内跑 Whisper）优先；浏览器自带 Web Speech API（要把录音送到云端，国内基本连不上）作备用；都连不上 → 「常说的话」chips 仍然可用。

**小医灵面板（`#medic-panel` / `.medic-panel` / `.medic__box`）**

- **触发**：点小医灵入口卡片，或点小医灵悬浮光点（轻点 = 开面板，长按 = 拖动机器人）。
- **位置**：桌面右侧抽屉，手机底部全宽（`.medic__box` 用 `min(86vh, 720px)` / `calc(100dvh - 12px)` 两种高度约束）。
- **行为**：
  - 标题栏（`medic-title`）「小医灵 · 陪您梳理症状」+ 状态行（当前主题 / 红旗升级标记）；
  - 对话气泡区（`medic-log`）：小医灵气泡（蓝绿主色底）+ 用户选择回显（点选 chip 回填）；
  - **红旗筛查在最前**：说「我胸口疼得厉害」→ 立即给「先打 120」的急症建议，**不**进入普通问诊（安全优先）；
  - **追问一次只问一个**：每条消息问 1 个主问题 + 2-4 个点选 chip（部位 / 时间 → 性质 / 程度 → 背景与伴随）；
  - **最多 3 轮追问**，然后给四级分诊（立即急诊 / 24 小时内 / 预约门诊 / 居家观察）+ 通俗科普 + 免责声明 + 1-3 条公开权威来源；
  - **回答里再出红旗会升级**：问「有没有看东西模糊」，老人点了「看东西模糊」——这是中风信号，当场中断流程升级为急症。
- **关闭**：
  - 右上角 `×` 按钮；
  - 点遮罩（`.medic__mask`）；
  - 按 **Esc**（文档级，不依赖焦点）；
  - 同一修复背景（`pointer-events: auto`）——**面板点得动、关得上**。
- **联动**：
  - 面板里的麦克风按钮同样**点一下开始听、再点停止**——和小鱼兒语音助手面板一致；
  - 麦克风授权**全页只问一次**（`speech.js.ensureMic()`）：小鱼兒与小医灵共用同一个闸门；
  - 来源只写「机构 · 资料名」，**不写死 URL**——防止链接失效，也防止为了凑格式编造出不存在的页面；年份宁可不写，也不编；
  - 规则不动 DOM；只有老人点「我想挂号」才调 `X.nav('restart')` 回小鱼兒流程。

**小医灵悬浮光点（`#medic-root` / `.medic-orb`）**

- **触发**：进入任一步骤页面，光点自动在视口内**缓慢漂浮**（20-40 px/s，每 1.2-3 s 随机转向）。
- **位置**：右下角浮于内容之上（避让去过的避让区）。
- **行为**：
  - 形态状态机：`idle`（光点漂浮）/ `hover`（悬停放大发光 + 气泡「点击问诊 · 长按拖动」）/ `pressing`（按下）/ `dragging`（拖动）/ `chat`（打开对话面板）；
  - 轻点（不移动）→ 打开「小医灵面板」；
  - 长按 **450 ms** → 变机器人形态（白主体 + 深青描边 + 淡青小手）；
  - 拖动超过 **6 px** → 跟手移动且限视口内；
  - 松手停 **3 秒**→ 恢复漂浮；
  - 机器人可眨眼（`scaleY`）、点头（`rotate`）。
- **关闭**：没有关闭按钮——**它是入口**，不是弹窗。
- **联动**：
  - **避让是硬约束**：每 500 ms 重取避让区（按钮 / 输入 / 视频 / 弹窗关闭钮 / 重要文字）的 Rect，每帧矩形相交检测；
  - 撞上按四方向「推出距离」取最小，**只挑推得出去的方向**——贴在视口边缘时往那侧推会被边界钳位抵消（这是修「光点永久卡在右缘挡住小鱼兒」bug 的核心）；
  - **全页唯一悬浮语音模块**——小鱼兒固定悬浮球（`aifab`）已移除，避免两个悬浮物老人分不清该点哪个。

#### 通用能力清单（`window.XiaoYuEr`）

不是弹窗，但所有面板 / 弹窗背后的执行都走它：

- 9 项标准能力（`XiaoYuEr.capabilities`）：选症状 / 选科室 / 选医生 / 选日期 / 选时段 / 选就诊人 / 选付款 / 提交 / 朗读；
- 12 个导航白名单命令（`XiaoYuEr.nav`）：next / prev / help / read / stop / confirm / confirmYes / confirmNo / closeModal / restart / done / font（字号缩放）；
- 步骤闸门（`STEP_GUARD`）：每个动作只在合法步骤生效；
- 高危授权：`submit` 只能在第 4 步 + 所有信息齐全时执行，**不会越权**。

#### 流程节点类

**成功页（`#step-5` / `.success` / `#ticket`）**

- **触发**：点高危确认弹窗的「确认预约」后跳到。
- **位置**：流程主区。
- **行为**：
  - 顶部成功徽章（绿色对勾）+ 标题「预约成功了」（`step5.title`）+ 一句简短引导（`step5.lead`）；
  - **取号码票面**（`#ticket`）：大字号取号码 `Axxx` + 科室 / 医生 / 时间 / 就诊人 / 付款方式的简明列表；
  - **到院须知**（`.notice--tips`）：带身份证、提前 15 分钟到、分时段就诊三条，每条配图标；
  - **防护贴士**（`.protect`）：口罩 / 不乱吃药 / 勤洗手 / 注意交叉感染四条，每条配图标；
  - 底部两颗按钮——**「再挂一个」**（白底 ghost，调 `restart`，回到第 0 步） / **「好了」**（实心主色，调 `done`，停留不动）。
- **关闭**：它本身就是终点页。
- **联动**：
  - 「好了」按钮不会「关闭」任何东西——只是清状态、不弹任何弹窗（避免老人被突然弹窗吓到）；
  - 「再挂一个」→ 状态重置到第 0 步开始页，所有选择清空；
  - 取号码基于四项信息的哈希生成（`hash(state.dept + state.doctor + state.date + state.slot + state.patient)`），同一组信息每次都拿到同一个号码，方便老人复用与查询。

---

## 五、安全与可控性

> 详细文档见 `docs/voice-medic.md`（红旗筛查与四级分诊）与 `README.md`（主项目安全章节）。这里只列硬约束：

1. **三级风险裁决**：`low`（浏览 / 普通填写） / `medium`（身份证 / 手机号等隐私字段） / `high`（提交 / 支付 / 删除）；
2. **人工授权门禁**：`high` 级动作必须本人点击授权；拒绝则流程终止且**绝不提交**；
3. **敏感值脱敏**：身份证 `110105********1234`、手机 `138****8000`，真实值只存于会话内存，界面与日志另有输出侧兜底过滤；
4. **提示词注入检测**：覆盖「覆盖系统指令 / 套取系统提示词 / 角色劫持 / **绕过人工授权**」四类意图，命中即在进模型前拦截；
5. **防幻觉闸门**：Navigator 输出的动作 id 若不在当前页能力清单内，直接丢弃并重试；MCP 通道的 `tools/call` 同样受此约束；
6. **双链路兜底**：模型不可用或输出不可解析时，自动切到规则引擎，流程照样跑完。

---

## 六、跑起来要哪几条命令

```bash
# 0) 环境：Node ≥ 18.18（推荐 20 LTS 或 22 LTS）
node -v

# 1) 装依赖
npm install

# 2) 跑起来：主控台 + 两个站点，http://localhost:3000
npm run dev
# 或
npm run demo                  # 一键：起服务 + 打局域网 IP + 推荐话术

# 3) 适老页单独看
npm run serve:static public   # 起 0.0.0.0 静态服务（响应头强制 charset=utf-8）

# 4) 体检
npm run typecheck             # tsc --noEmit
npm run acceptance            # 起服务 → 12 类功能 → 41 断言 → docs/ACCEPTANCE.md
npm run check:elder           # 适老页 jsdom 自检（54 项）
npm run check:medic           # 小医灵沙盒测试（19 项）
npm run check:corpus          # 语料库沙盒测试（6942 次识别）
npm run check:docs            # 文档结构与编号自检（10 文档 / 7 项）
npm run eval                  # 智能体回归评测（10 用例 / 94 断言）

# 6) 改话术后的两件事
npm run build:corpus          # data/corpus.json → public/elder/corpus.js
npm run build:medic           # data/medic-kb.json → public/elder/medic-kb.js

# 7) 发布前
npm run build:elder           # 生成单文件版 standalone.html
```

---

## 七、关键模块对照表

| 模块 | 职责 |
| --- | --- |
| `lib/agents/engine.ts` | 编排主循环：Planner/Navigator/Guardian/Reporter 调度、失败自省、步数上限 |
| `lib/agents/llm.ts` | 大模型接入（OpenAI 兼容）+ 引擎选择（有密钥走模型，否则规则引擎） |
| `lib/agents/rules.ts` | 规则引擎：无模型时的确定性决策 |
| `lib/agents/prompts.ts` | 四个角色的提示词与 JSON 强约束输出 |
| `lib/agents/capmatch.ts` | 能力语义检索：中文二元组余弦 + 核心字加成 + 编辑距离 |
| `lib/safety/guardian.ts` | 三级风险裁决、人工授权门禁、脱敏、提示词注入检测 |
| `lib/rag/guides.ts` | 办事指南知识库 + 零依赖中文 TF-IDF 检索器 |
| `lib/sim/types.ts` | 站点协议（SiteDef / PageDef / Capability） |
| `lib/sim/hospital.ts` | 站点一：医院预约挂号 |
| `lib/sim/gov.ts` | 站点二：市民之家医保/社保缴费 |
| `lib/sim/registry.ts` | 站点注册表与能力清单编译器 |
| `lib/mcp/core.ts` | MCP 协议核心（服务端与浏览器共用一份裁决） |
| `lib/runtime/transport.ts` | 静态形态下的浏览器内运行时 |
| `lib/store.ts` | 会话状态机、审计日志、执行轨迹 |
| `public/elder/icons.js` | 适老页 29 个内联 SVG 图标 |
| `public/elder/speech.js` | 离线语音识别（浏览器内跑 Whisper）+ 麦克风授权 |
| `public/elder/ai.js` | 语音智能助手（识别 + 本地意图 + 只走能力清单执行） |
| `public/elder/corpus.js` | 对话语料库编译产物（3929 条三语说法） |
| `public/elder/medic-kb.js` | 医学知识库编译产物（10 类红旗 + 12 个主题，537 条三语说法） |
| `public/elder/medic.js` | 小医灵本体：形态状态机 + 预问诊会话引擎 + 面板 |
| `public/elder/medic.css` | 小医灵配套样式 |
| `data/corpus.json` | 本地对话数据库：改话术只改这里 |
| `data/medic-kb.json` | 本地医学知识库：改话术只改这里 |

---

## 八、已踩过的坑（接手时不必再踩一遍）

### 8.1 平台层 Workbuddy 字眼（详见 docs/workbuddy-overlay.md）

托管在 `workbuddy.link` 上的页会被平台注入默认 meta——`og:site_name = "WorkBuddy"`、`og:description = "Workbuddy - 可人机协作的在线Page"`、`favicon` 是平台 logo、地址栏永远是平台域名。**这五处改不了**。

我们能改的（**已全部改完**）：
- 产物内文 0 处 Workbuddy；
- 产物 `og:title` / `twitter:title` = 「小鱼兒 · 预约挂号」（平台从 `<title>` 提取）；
- 浏览器 tab 标题同上；
- 节点 title（管理列表里显示）通过 `space.workspace.rename-node` 改。

想彻底解决：自部署到自有域名（README 部署段已写好）。

### 8.2 `pointer-events: none` 是继承的

`aifab`（小鱼兒固定悬浮球，已移除）根容器写 `pointer-events: none`，是为了让悬浮物不挡页面操作；但 `pointer-events` 是**继承属性**——`.medic-panel` 必须显式写 `auto`，否则整棵面板子树收不到真实点击（关闭按钮 / 遮罩 / chips 全死）。`el.click()` 测试不出来（合成点击绕过命中测试），必须用真实鼠标事件（CDP `Input.dispatchMouseEvent`）。

### 8.3 `el.click()` 不是点击

JS 合成点击绕过命中测试、滚动定位、遮挡检测——测「点不点得到」必须用真实鼠标事件。这条已固化为真机脚本的默认写法。

### 8.4 编码四层防护

适老页有三千多个汉字。常见静态服务器只对 `.html` / `.js` / `.css` 返回 `text/html` / `text/javascript` / `text/css`，**不带 charset**；外链脚本没有编码线索时，部分手机内核按 GBK 解析 → 电脑上正常、手机上乱码。

防护层（**已全部就位**）：
1. HTML `<meta charset="utf-8">` + `http-equiv` 双声明；
2. 外链 `<link>` / `<script>` 都显式 `charset="utf-8"`；
3. CSS 文件首行 `@charset "UTF-8";`；
5. JS 文件带 UTF-8 BOM。

最稳的一招：单文件版 `npm run build:elder` → `standalone.html`，全部内联，编码只由 `<meta charset>` 决定。

### 8.5 Whisper 幻听治理

Whisper-tiny 遇到环境音会输出「好」「（音樂）」「谢谢观看」之类。两层处理：
- `speech.js` 的 `clean()`：剥掉括号引号 → 原始串与剥壳串都去撞幻听清单，命中返空串；
- `ai.js` 的 `hear()`：识别结果是 1-2 字且规则引擎认不出 → 当环境音处理，回「没有听到声音，请再说一次」，**不执行任何动作**，也**不说「没听明白」**——那会让老人以为自己说错了。

### 8.6 沙箱环境坑

- npm 必须 `--registry=https://registry.npmjs.org`（淘宝源会 403）；
- 沙箱内 `next build` 写 `.next/trace` 会 EPERM → 用 `tsc --noEmit` + dev/curl 验证；`scripts/trace-guard.cjs` 预载补丁；
- curl 本地服务加 `--noproxy '*'`；无头 Chrome 加 `--no-proxy-server`；
- Windows `spawn('npx.cmd')` 报 EINVAL → `spawn(process.execPath, ['node_modules/next/dist/bin/next','build'])`；
- Git Bash 里 node 的 `/tmp` 解析成 `F:\tmp` → 临时文件写当前目录；
- 沙箱拦截对 `.next` 的删除 → 用「整体 renameSync 挪走」代替 `rm -rf`；
- **任何验证类脚本都必须自动关停**，不留后台常驻进程。

### 8.7 云端托管页手术（详见 docs/workbuddy-overlay.md）

`workbuddy.link/p/ukGnjmEILo83bQqTprrtTM` 是云端托管的 standalone 版本。平台改写时会注入 `data-page-node-id`、`<!--pnid:-->` 注释、`<script src="/page/page_comm/inject.js">`，**必须**定点手术（保留原 CRLF/BOM），不能整文件覆盖。流程：开事务（带 `baseVersion`）→ 下载基线 → 定点改 → 上传 → 提交（version+1）→ `publish_page.py` 发布。

---

## 九、当前自检状态

最后一次全量验证（2026-10-15）：

| 检查 | 结果 |
| --- | --- |
| `npm run check:elder` | **54 / 54**（含小医灵接入、面板 pointer-events 可交互、Esc 文档级可关） |
| `npm run check:medic` | **19 / 19**（537 条医学说法 + 红旗优先 + 问诊全流程 + 禁词隐私） |
| `npm run check:corpus` | **6942 次识别**全对 |
| `npm run check:docs` | **10 文档 / 7 项**全过 |
| `npm run acceptance` | **12 / 12 类功能 / 41 / 41 断言**（自动生成 ACCEPTANCE.md） |
| `npm run eval` | **10 用例 / 94 断言** |
| `npx tsc --noEmit` | 0 错误 |
| CDP 真实浏览器 | **24 / 24**（真实鼠标开关面板、chips 推进问诊、3 秒采样零遮挡、窄屏无溢出、控制台零报错） |
| 单文件版体积 | 494,581 字节（≈ 483 KB），`aifab` 残留 0、`workbuddy` 残留 0 |

---

## 十、未完成的事

1. **README「作者与分工」** —— 唯一空缺项，等用户提供姓名 / 学校 / 分工；
2. **演示视频**（5-8 分钟 1080p）—— 分镜尚未开始；
3. **技术文档 PDF**（≤ 30 页）—— 尚未开始；
4. **真实站点 MCP Server 适配层**（对接公开政务/医疗站点）；
5. **端侧小模型意图理解**（Transformers.js / WebGPU，弱网与隐私场景）；
6. **多轮方言语音优化与纠错**；
7. **代驾过程的可视化编排器**（把流程画出来，而不只是看轨迹）；
8. **云端托管页同步**：本轮本地改动同步到云端 standalone（medic.css / medic-kb.js / medic.js / 入口卡片 / speech.js ensureMic）由用户在适当时机发起。

---

## 十一、其它文档索引

| 主题 | 路径 |
| --- | --- |
| 项目说明 / 安装 / 部署 | `README.md` |
| 小鱼兒实现依据与话术手册 | `docs/voice-corpus.md` |
| 小医灵实现依据与话术手册 | `docs/voice-medic.md` |
| 真实挂号流程审核与提炼 | `docs/hospital-flow-notes.md` |
| 平台 Workbuddy 字眼诊断 | `docs/workbuddy-overlay.md` |
| 功能验收报告（自动生成） | `docs/ACCEPTANCE.md` |
| 早期开发日志 | `docs/devlog-2026-10-10.md` / `2026-10-11.md` / `2026-10-13.md` |
| 中期开发日志（离线语音 / 小医灵） | `docs/devlog-2026-10-14.md` |
| 最新开发日志（只留一个悬浮 / 面板可关 / 平台字眼） | `docs/devlog-2026-10-15.md` |
| 项目知识中心（HTML） | `docs-site/index.html` |
| 验收报告 HTML 版 | `docs-site/acceptance.html` |
| 交接文档 HTML 单页版 | `docs-site/handover.html` |