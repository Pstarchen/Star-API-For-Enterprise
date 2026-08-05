# Star API Platform

企业级公共 API 聚合、分发与治理平台。项目同时包含 API 市场、在线调试、开发者控制台、平台运营后台、版本化服务端接口和 PostgreSQL 领域模型。

## 已实现

- API 市场：搜索、分类、排序、服务状态与价格展示
- API 详情：认证说明、参数文档、在线沙箱调试
- 企业控制台：调用概览、应用/密钥、请求日志、Webhook、账单、成员权限、企业设置
- 运营后台：API 生命周期、服务商准入、企业租户、风控、审计、网关监控、平台设置
- 服务端接口：目录查询、沙箱调用、密钥生成、健康检查，统一使用 Zod 校验
- 数据基础：Prisma + PostgreSQL 多租户模型，Redis 容器用于限流、配额和缓存扩展

## 本地启动

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。当前 UI 使用隔离在 `src/lib/data.ts` 的演示数据，不依赖数据库即可查看全部工作流。

## Docker 一键部署

```bash
cp .env.docker.example .env
# 使用 openssl rand -hex 32 分别替换 .env 中的三个敏感变量
docker compose config
docker compose up -d --build
```

启动后访问 `http://localhost:3000`，健康检查地址为 `http://localhost:3000/api/health`。升级、备份、回滚和反向代理建议见 [Docker 部署指南](docs/DEPLOYMENT.md)。

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
src/lib/data.ts          可替换的演示数据适配器
src/lib/server/          仅服务端可用的密钥与数据库模块
prisma/schema.prisma     多租户领域模型
docker-compose.yml       PostgreSQL 与 Redis 本地基础设施
```

页面默认是 Server Component；仅搜索、图表、表单、弹窗等交互组件使用 Client Component。这样可以控制客户端体积，并保持后续迁移到真实仓储层时的边界清晰。

## 服务端接口

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | 服务健康检查 |
| `GET` | `/api/v1/catalog?q=&category=&method=` | API 目录查询 |
| `POST` | `/api/v1/playground` | 沙箱请求校验与响应 |
| `POST` | `/api/v1/keys` | 一次性签发密钥明文 |

`/api/v1/keys` 当前只演示安全生成和单次返回语义。生产环境必须配置 `API_KEY_PEPPER`，否则接口会返回 `503`；正式接入前还要在路由前增加企业 SSO 会话、RBAC 权限判断和审计写入，并且只保存 `secretHash`。

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
- 组件圆角不超过 6px，减少装饰卡片，保持企业工具的信息密度。
