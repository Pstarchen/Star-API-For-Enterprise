# Docker 部署指南

本文档适用于单机 Docker Compose 部署。容器包括 Caddy、Next.js 应用、一次性迁移任务、PostgreSQL 和 Redis；只有 Caddy 对外暴露端口。

## 1. 环境要求

- Docker Engine 24+
- Docker Compose v2+
- 建议 2 核 CPU、4 GB 内存、20 GB 可用磁盘
- 生产环境准备一个解析到服务器的域名，并开放 TCP 80/443 与 UDP 443

## 2. 首次部署

```bash
git clone https://github.com/Pstarchen/Star-API-For-Enterprise.git
cd Star-API-For-Enterprise
cp .env.docker.example .env
chmod 600 .env
```

分别执行四次 `openssl rand -hex 32`，将不同结果写入：

- `POSTGRES_PASSWORD`
- `API_KEY_PEPPER`
- `SESSION_SECRET`
- `INSTALL_TOKEN`

将 `SITE_ADDRESS` 改为已解析的域名，例如 `api.example.com`。Caddy 会自动签发和续期 HTTPS 证书。随后启动：

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail https://api.example.com/api/health
```

首次打开 `https://api.example.com/install`。需要部署令牌时，在服务器项目目录执行：

```bash
npm run --silent install:token
```

该命令会自动定位当前项目正在运行的 `app` 容器，不依赖 Compose 重新解析 `.env`。如果服务器没有 Node.js/npm，但保留了完整的 Compose 项目环境，可直接执行：

```bash
docker compose exec app node /app/scripts/show-install-token.mjs
```

命令会在容器内部通过回环地址确认平台尚未初始化，再单独输出部署令牌，不会打印其他环境变量。输入令牌后设置网站名称、网站介绍、公开地址、网站图标和首个管理员账号。初始化成功后安装接口会永久关闭，上述命令也会拒绝再次显示令牌。管理员密码只通过安装页提交，不写入 Compose 配置。安装完成后，平台管理员仍可在“平台设置”中更新这些品牌信息；配置保存在 PostgreSQL 中，容器升级或重启不会丢失。

### IP 临时测试

没有域名时可暂时使用明文 HTTP，仅用于验收：

```dotenv
SITE_ADDRESS=http://SERVER_IP
SESSION_COOKIE_SECURE=false
```

正式上线前必须切换到域名和 HTTPS，并恢复 `SESSION_COOKIE_SECURE=true`。

## 3. 启动与升级语义

`migrate` 容器先执行 `prisma migrate deploy`。只有数据库迁移成功且 PostgreSQL、Redis 健康时，应用才会启动；Caddy 又会等待应用健康后接流量。

```bash
git pull --ff-only
docker compose build --pull migrate app
docker compose up -d
docker compose ps
docker compose logs --tail=200 migrate app caddy
```

部署前先备份数据库。涉及不可逆数据变更时，应通过新的向前 migration 修复，不要在生产库执行 `prisma migrate dev`。

## 4. 运维检查

```bash
docker compose ps
docker compose logs -f --tail=200 app
docker compose logs -f --tail=200 postgres redis caddy
curl --fail https://api.example.com/api/health
```

健康响应中的 `database` 必须为 `connected`。同时监控容器重启次数、磁盘空间、PostgreSQL 连接数和证书续期日志。

## 5. 备份与恢复

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U starapi -d starapi -Fc > backups/starapi-$(date +%F-%H%M).dump
```

恢复前先在隔离环境验证备份：

```bash
docker compose exec -T postgres pg_restore -U starapi -d starapi --clean --if-exists < backups/<备份文件>.dump
```

停止容器但保留数据使用 `docker compose down`。不要在生产环境执行 `docker compose down -v`，它会删除数据库、Redis 和 Caddy 数据卷。

## 6. 上线清单

- `.env` 权限为 `600`，四个敏感值互不相同且长度不少于 32 字符
- 使用域名 HTTPS，`SESSION_COOKIE_SECURE=true`
- 防火墙仅开放 SSH、80 和 443，数据库、Redis、Node 端口均不对外
- `/install` 已关闭，普通用户无法访问 `/admin`
- 已完成注册、登录、退出、会话过期和 API Key 单次显示测试
- 已配置每日 PostgreSQL 备份及异机保留
- 已确认日志不记录密码、会话令牌和 API Key 明文
