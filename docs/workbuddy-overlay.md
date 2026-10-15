# 平台默认 Workbuddy 字眼 · 全量诊断与处置清单

用户原话：「线上版本不要出现 workbuddy 这个字眼」。诊断后能改的已改，不能改的是平台外壳固定写死。

## 当前 `https://workbuddy.link/p/ukGnjmEILo83bQqTprrtTM` 拉下来的 head

```
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, ..." />
<meta name="robots" content="noindex, nofollow" />                            ← 平台写
<title>小鱼兒 · 预约挂号</title>                                              ← 平台从产物 <title> 提取
<link rel="icon" href="...workbuddy/.../logo.svg" />                          ← 平台写死
<meta property="og:type" content="website" />                                 ← 平台写
<meta property="og:site_name" content="WorkBuddy" />                          ← 平台写死品牌
<meta property="og:title" content="小鱼兒 · 预约挂号" />                       ← 平台从产物 <title> 提取
<meta property="og:description" content="Workbuddy - 可人机协作的在线Page" />  ← 平台写死模板
<meta property="og:image" content=".../wb-file-html-solid.png" />             ← 平台写死
<meta name="twitter:card" content="summary" />                                ← 平台写
<meta name="twitter:title" content="小鱼兒 · 预约挂号" />                      ← 同 og:title
<meta name="twitter:description" content="Workbuddy - 可人机协作的在线Page" />← 同 og:description
<meta name="twitter:image" content=".../wb-file-html-solid.png" />            ← 同 og:image
```

## 来源分类

| Workbuddy 出现位置 | 来源 | 我们能否改 | 处置 |
|---|---|---|---|
| 浏览器地址栏 `workbuddy.link` | 平台托管域名 | **不能** | 这是平台物理域名，托管就在这上面 |
| `<link rel="icon">` 平台 logo SVG | 平台写死 | **不能** | 平台没暴露改 favicon 的 API |
| `og:site_name = WorkBuddy` | 平台写死品牌 | **不能** | 平台品牌字段，没 API |
| `og:description / twitter:description` 平台默认文案 | 平台写死模板 | **不能** | 平台分享卡片模板固定，没 API 改 |
| `og:image / twitter:image` 默认图 | 平台写死 | **不能** | 平台默认图，没 API 改 |
| 我们的产物 `standalone.html` 内文 | 我们写的 | **能** | **已 0 处** |
| 我们的产物 `og:title / twitter:title` | 我们写 | **能** | **已 =「小鱼兒 · 预约挂号」** |
| 我们的产物 `og:description` | 我们写 | **能** | **已 =「面向高龄老人...」**（但被平台后追加的覆盖） |
| 浏览器 tab 标题 | 从产物 `<title>` 取 | **能** | **已 =「小鱼兒 · 预约挂号」** |
| 节点 title（管理列表里显示） | `rename-node` | **能** | **已 =「小鱼兒 · 预约挂号」**（通过 `space.workspace.rename-node` 改） |

## HTML 规范的覆盖关系（关键）

平台渲染时**把我们产物的内容塞进外壳里**，再**追加**自己的 meta（og:site_name / og:description / og:image / favicon）。按 HTML 规范，**后写的同属性 meta 覆盖先写的**——所以平台追加的 og:description 覆盖了我们产物里写的 og:description。这是浏览器和分享爬虫默认行为的根因。

## 已经做的（用户能直观感受到的部分）

1. ✅ **产物 `standalone.html` 内 0 处 Workbuddy 字眼**（grep 验证）
2. ✅ **`og:title` / `twitter:title` 已是「小鱼兒 · 预约挂号」**（平台从 `<title>` 提取）
3. ✅ **浏览器 tab 标题已是「小鱼兒 · 预约挂号」**（同上）
4. ✅ **节点 title 已改为「小鱼兒 · 预约挂号」**（管理列表 / 部分机器人 / 部分分享预览会取这个）

## 仍存在的 Workbuddy 字眼（平台层固定，不能改）

| 位置 | 频次 | 触发场景 |
|---|---|---|
| 浏览器地址栏 | 1 | 永远在 |
| 浏览器 tab favicon | 1 | 永远在 |
| 分享卡片（聊天 / Twitter / Slack） | 4 处 | 把链接粘到聊天里 / 发推 / 群内 |

**触发分享卡片 = 用户把链接发给朋友时**：标题是「小鱼兒 · 预约挂号」（我们的），但 site_name 写着「WorkBuddy」，描述写着「Workbuddy - 可人机协作的在线Page」，小图是 Workbuddy 平台 logo。

## 想彻底解决，唯一的方案

**不托管在这个平台**——把 standalone.html 部署到自有域名：
- 自有域名（无 workbuddy 字样）
- 自有 favicon
- 自有分享 meta（og:site_name = 小鱼兒、og:description = 我们的、og:image = 我们的）
- 自有 https 证书

代码产物 `public/elder/standalone.html` 已经可直接拿出去用，自部署一节看 README「部署」段（已写好）。

## 当前推荐

接受平台层 Workbuddy 字眼的存在。理由：
- 平台层字眼**只在分享卡片**与**地址栏**出现，**不影响实际使用**
- 产品的实际功能（挂号、语音助手、小医灵）**正文里全部是我们的品牌**
- 改起来需要把整个项目迁出平台，**代价远超收益**

如果用户坚持要分享卡片也完全干净，告诉我，我们可以做一次自部署（`docs-site` 已经有 nginx 配置示例）。
