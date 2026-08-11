# Docker 部署指南

本文档适用于从源码构建的单机 Docker Compose 部署。容器包括 Caddy、Next.js 应用、一次性迁移任务、PostgreSQL 和 Redis。Caddy 发布 80/443，App 默认发布到宿主机 `0.0.0.0:18081`；PostgreSQL、Redis 和 PHP Runner 不发布宿主机端口。

生产环境如果使用 Nginx、Caddy 或宝塔进行外部反向代理，并希望通过修改 `STAR_API_VERSION` 升级预构建镜像，请使用[版本镜像部署指南](IMAGE_DEPLOYMENT.md)和 `compose.production.yml`。

## 1. 环境要求

- Docker Engine 24+
- Docker Compose v2+
- 建议 2 核 CPU、4 GB 内存、20 GB 可用磁盘
- 生产环境准备一个解析到服务器的域名，并开放 TCP 80/443 与 UDP 443
- App 默认监听宿主机 `0.0.0.0:18081`；如仅供同机反向代理使用，应通过防火墙阻止公网直接访问 18081

## 2. 首次部署

```bash
git clone https://github.com/Pstarchen/Star-API-For-Enterprise.git
cd Star-API-For-Enterprise
cp .env.docker.example .env
chmod 600 .env
```

数据库密码、API Key Pepper、会话密钥、部署令牌、内部网关密钥和配置加密密钥由 `secrets-init` 在首次启动时随机生成，并写入 `starapi-secrets` 持久卷。后续重启和镜像升级只读取已有值，不会重新生成。

将 `SITE_ADDRESS` 改为已解析的网站域名，例如 `example.com`。公开 API 与网站使用同一域名，通过 `/api/<接口路径>` 访问，不需要额外配置 `api.` 子域名。Caddy 会自动签发和续期 HTTPS 证书。随后启动：

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail https://example.com/api/health
```

首次打开 `https://example.com/install`。需要部署令牌时，在服务器项目目录执行：

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
curl --fail https://example.com/api/health
```

健康响应中的 `database` 必须为 `connected`。同时监控容器重启次数、磁盘空间、PostgreSQL 连接数和证书续期日志。

## 5. 备份与恢复

```bash
mkdir -p backups
BACKUP_ID=$(date +%F-%H%M)
docker compose exec -T postgres pg_dump -U starapi -d starapi -Fc > "backups/starapi-${BACKUP_ID}.dump"
docker compose run --rm --no-deps -v "$PWD/backups:/backup" app sh -c "tar -C /var/lib/star-api/assets -czf /backup/starapi-assets-${BACKUP_ID}.tar.gz ."
docker compose run --rm --no-deps --entrypoint sh -v "$PWD/backups:/backup" secrets-init -c "tar -C /run/star-api-secrets -czf /backup/starapi-secrets-${BACKUP_ID}.tar.gz ."
```

数据库保存媒体元数据，`starapi-api-assets` 卷保存图片和视频本体，`starapi-secrets` 卷保存数据库及平台密钥。三份备份必须使用同一个 `BACKUP_ID`、在同一维护窗口生成并一起异机保留。恢复前先在隔离环境验证备份。

```bash
docker compose exec -T postgres pg_restore -U starapi -d starapi --clean --if-exists < backups/<备份文件>.dump
docker compose stop app
docker compose run --rm --no-deps -v "$PWD/backups:/backup" app sh -c 'find /var/lib/star-api/assets -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C /var/lib/star-api/assets -xzf /backup/<媒体备份文件>.tar.gz'
docker compose run --rm --no-deps --entrypoint sh -v "$PWD/backups:/backup" secrets-init -c 'find /run/star-api-secrets -mindepth 1 -maxdepth 1 -delete && tar -C /run/star-api-secrets -xzf /backup/<密钥备份文件>.tar.gz'
docker compose start app
```

停止容器但保留数据使用 `docker compose down`。不要在生产环境执行 `docker compose down -v`，它会删除数据库、平台密钥、图片视频、Redis 和 Caddy 数据卷。

## 6. 上线清单

- `starapi-secrets` 已纳入加密备份，`.env` 中没有平台敏感密钥
- 使用域名 HTTPS，`SESSION_COOKIE_SECURE=true`
- 防火墙仅开放 SSH、80 和 443，数据库、Redis、Node 端口均不对外
- `/install` 已关闭，普通用户无法访问 `/admin`
- 已完成注册、登录、退出、会话过期和 API Key 单次显示测试
- 已配置每日 PostgreSQL 与媒体卷配套备份及异机保留，并完成隔离恢复演练
- 已确认日志不记录密码、会话令牌和 API Key 明文
