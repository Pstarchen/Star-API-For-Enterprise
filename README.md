# Star API Platform

面向个人开发者与企业客户的公共 API 聚合、分发与治理平台。项目同时包含 API 市场、在线调试、开发者控制台、平台运营后台、版本化服务端接口和 PostgreSQL 领域模型。

## 已实现

- API 市场：首页展示精选接口，独立市场提供全量目录、搜索、分类、请求方法、计费方式、排序和列表/网格视图
- API 详情：认证说明、参数文档、在线沙箱调试
- 账户体系：首次安装向导、个人/企业注册、scrypt 密码哈希、持久会话、登录限流与工作空间切换
- 平台品牌：安装时配置网站名称、介绍、公开地址和图标，管理员可在后台维护网站图标、首屏图片及备案信息并同步到门户、控制台与浏览器元数据
- API 分类：管理员可新增、排序、启停和删除未使用分类，API 新建、编辑、OpenAPI 导入及市场筛选共用同一套真实分类数据
- API 契约：一个端点可同时启用 GET、POST 等方法；请求参数、返回参数、默认值、校验规则、返回格式与示例均可视化维护
- 通用数据源：支持 JSON、JSONL / NDJSON、CSV、TSV、YAML / YML 和逐行 TXT；多个文件可分组或合并，并可按任意字段路径筛选记录和提取文本
- 本地媒体 API：管理员文件流式上传到 Docker 持久卷，不按内容拦截并按 SHA-256 去重；随机视频支持 HTTP Range 分段播放，不依赖第三方对象存储
- 用户控制台：调用概览、应用/密钥、请求日志、Webhook 与账单；企业空间额外承载成员权限和组织设置
- API 直链：用户可为已订阅的 GET 端点生成、复制和撤销直链；直链继续执行订阅、限流、配额、计费、脱敏和审计规则
- 运营后台：个人/企业用户管理、API 生命周期、服务商准入、企业组织、风控、审计、网关监控与平台设置
- 服务端接口：目录查询、沙箱调用、密钥生成、健康检查，统一使用 Zod 校验
- 数据基础：Prisma + PostgreSQL 多租户模型，Redis 容器用于限流、配额和缓存扩展

## 本地启动

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。认证、租户、成员关系、会话、API Key、API 分类、市场目录和运营统计均使用 PostgreSQL 持久化。

## Docker 一键部署

```bash
cp .env.docker.example .env
docker compose config
docker compose up -d --build
```

首次启动会在独立持久卷中随机生成数据库密码、会话密钥、API Key Pepper、部署令牌和配置加密密钥，不需要在 `.env` 中填写敏感值。启动后访问配置的 `SITE_ADDRESS`，首次进入 `/install` 创建平台管理员。健康检查地址为 `/api/health`，升级、备份、回滚和 HTTPS 说明见 [Docker 部署指南](docs/DEPLOYMENT.md)。

生产环境推荐使用版本镜像和宿主机反向代理：

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up -d
```

也可以使用便捷脚本完成常见安装和更新动作：

```bash
npm run production:install
npm run production:check
npm run production:update
npm run production:token
sudo star-api doctor
```

`production:install` 会在缺少 `.env.production` 时创建配置、拉取镜像并启动服务；在 root + systemd 环境还会自动启用宿主机本地更新服务，并安装与当前目录无关的 `/usr/local/bin/star-api` 管理命令。正式开放前请先核对 `SITE_ADDRESS`、`API_PUBLIC_URL`、`API_PUBLIC_HOST` 和 `APP_PORT`。之后可在任意目录运行 `sudo star-api check`、`sudo star-api update`、`sudo star-api update 0.1.20` 或 `sudo star-api doctor`；更新器会自动备份、迁移并验证健康状态。镜像部署、反代、备份和恢复步骤见[版本镜像部署指南](docs/IMAGE_DEPLOYMENT.md)。

管理员后台“平台设置”底部的“系统安装与更新”可以直接排队本机更新，不需要 GitHub Token，也不会把 Docker Socket 挂给网站容器。生产部署会自动启用 systemd 监听器；如需人工恢复，可在任意目录运行 `sudo star-api enable-updates`。`STAR_API_UPDATE_REGION=cn` 会优先使用国内摘要校验镜像，`global` 会优先使用官方 GHCR，`auto` 根据服务器时区选择。完全脱离 GitHub 时，将三个 `STAR_API_*_IMAGE` 指向独立镜像仓库，并配置返回 `{"latestVersion":"X.Y.Z"}` 的 `STAR_API_UPDATE_FEED_URL`。

需要启用数据库时：

```powershell
Copy-Item .env.example .env.local
docker compose up -d
npm run db:generate
npm run db:migrate -- --name init
```

请先替换 `.env.local` 中的示例口令。真实值不得提交到仓库。

## 常用检查

```powershell
npm run lint
npm run typecheck
npm run build
```

## 目录边界

```text
src/app/                 页面、布局和版本化 HTTP 路由
src/components/          设计系统与业务组件
src/lib/server/          仅服务端可用的密钥与数据库模块
prisma/schema.prisma     多租户领域模型
docker-compose.yml       PostgreSQL 与 Redis 本地基础设施
compose.production.yml   版本镜像与外部反代生产编排
```

页面默认是 Server Component；仅搜索、图表、表单、弹窗等交互组件使用 Client Component。这样可以控制客户端体积，并保持后续迁移到真实仓储层时的边界清晰。

## 服务端接口

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | 服务健康检查 |
| `GET` | `/api/v1/catalog?q=&category=&method=` | API 目录查询 |
| `GET/PATCH` | `/api/v1/admin/settings` | 管理员读取或更新平台品牌配置 |
| `GET/POST/PATCH/DELETE` | `/api/v1/admin/api-categories` | 管理员维护 API 分类；使用中的分类禁止删除 |
| `GET` | `/api/v1/branding/icon` | 返回数据库中保存的网站图标 |
| `GET` | `/api/v1/branding/hero` | 返回数据库中保存的首页首屏图片 |
| `POST` | `/api/v1/playground` | 沙箱请求校验与响应 |
| `POST` | `/api/v1/keys` | 一次性签发密钥明文 |
| `POST/PATCH` | `/api/v1/direct-links` | 为已订阅的 GET 端点生成或撤销直链 |
| `GET/POST` | `/api/v1/install` | 查询初始化状态并完成首次安装 |
| `POST` | `/api/v1/auth/register` | 创建个人/企业账号、工作区与会话 |
| `POST` | `/api/v1/auth/login` | 校验密码并创建持久会话 |
| `POST` | `/api/v1/auth/logout` | 撤销当前会话 |
| `GET` | `/api/v1/auth/me` | 返回当前账号与工作区 |

`/api/v1/keys` 需要有效用户会话和应用所属工作区权限。生产环境必须配置 `API_KEY_PEPPER`；密钥明文只在创建响应中返回一次，数据库仅保存 `secretHash`。

## 本地内容导入

后台“新建 API”中的“通用数据源”不依赖固定文件名、固定业务字段或固定业务类型，可把现有本地数据文件直接转换为可订阅调用的接口：

- JSON、YAML 根节点可以是对象、数组或包含嵌套数组的对象；JSONL / NDJSON 每个非空行是一条 JSON 记录
- CSV / TSV 使用首行为字段名并严格校验列数；TXT 按非空行拆分。转为 TXT 响应时可填写 `content.text` 形式的文本字段路径
- 默认将多文件合并为统一内容池，不自动创建任何业务参数；也可按文件名形成分类，分类参数、格式参数和列表触发值都可留空或自定义
- 同时启用 JSON 和 TXT 响应后可使用自定义格式参数，未配置格式参数时也支持通过标准 `Accept: application/json` 或 `Accept: text/plain` 协商响应
- 请求参数的“数据字段”支持 `metadata.region` 等嵌套路径，可按任意业务字段筛选记录
- 完整 PHP 项目需要压缩为 ZIP 并选择“PHP 程序包”，不要把程序依赖、可执行文件或媒体文件当作通用业务数据导入

## 生产化路线

1. 身份层：接入 OIDC/SAML 企业 SSO，短会话、MFA、RBAC 与资源级授权。
2. 网关层：使用 APISIX/Kong 承担鉴权、限流、熔断、灰度、签名和上游路由。
3. 计量层：Redis 实时计数，Kafka 异步投递，ClickHouse 保存高吞吐调用明细。
4. 账务层：PostgreSQL 保存订阅、价格快照、账单和发票，计费任务必须幂等。
5. 可观测性：OpenTelemetry、Prometheus、Grafana、Loki，所有链路贯穿 `requestId`。
6. 安全与合规：KMS 托管密钥、敏感字段脱敏、审计防篡改、数据保留策略和灾备演练。

## 设计约束

- 主色只表达可用/成功，琥珀表达风险，危险操作使用红色，避免状态语义混乱。
- 门户优先发现和试用，控制台优先扫描和批量工作，运营后台优先治理和审计。
- 所有表格支持横向滚动，固定格式控件使用稳定尺寸，键盘焦点始终可见。
- 工具组件以 8px 内的小圆角为主，减少装饰卡片，保持企业工具的信息密度。
