# 版本镜像部署指南

本文档用于生产环境的“版本镜像 + Docker Compose + 外部反向代理”部署。服务器不编译源码，`STAR_API_VERSION` 同时控制应用、数据库迁移器和 PHP Runner。

## 1. 发布版本镜像

将发布工作流合并到默认分支后，推送语义化版本标签：

```bash
git tag v0.1.1
git push origin v0.1.1
```

GitHub Actions 将发布以下多架构镜像：

```text
ghcr.io/pstarchen/star-api-app:0.1.1
ghcr.io/pstarchen/star-api-migrator:0.1.1
ghcr.io/pstarchen/star-api-php-runner:0.1.1
```

同时发布对应的 `sha-<commit>` 不可变标签，用于审计。GitHub 仓库的 Packages 页面必须将镜像设为公开；如果保持私有，服务器需要使用具有 `read:packages` 权限的 PAT 登录：

```bash
export GHCR_TOKEN='<read-packages-token>'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u Pstarchen --password-stdin
unset GHCR_TOKEN
```

## 2. 首次部署

服务器只需要生产编排、环境示例和反代模板，通常直接克隆仓库：

```bash
git clone https://github.com/Pstarchen/Star-API-For-Enterprise.git
cd Star-API-For-Enterprise
cp .env.production.example .env.production
chmod 600 .env.production
```

六项部署密钥由 `secrets-init` 在首次启动时随机生成，并写入 `starapi-secrets` 持久卷；`.env.production` 不保存这些密钥。旧版升级时，初始化器会在密钥卷为空的情况下导入旧 `.env.production` 中的值，确保已有 PostgreSQL 数据可以继续访问；确认升级成功后应删除旧敏感项并移除已退出的 `secrets-init` 容器。

设置已发布的镜像版本、网站域名和外部地址：

```dotenv
STAR_API_VERSION=0.1.1
APP_BIND_ADDRESS=0.0.0.0
APP_PORT=18081
API_PUBLIC_HOST=example.com
API_PUBLIC_URL=https://example.com
SESSION_COOKIE_SECURE=true
```

启动时先拉取镜像。迁移器只有在 PostgreSQL 健康后才执行，迁移成功后应用才启动：

```bash
docker compose --env-file .env.production -f compose.production.yml config --quiet
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
curl --fail http://127.0.0.1:18081/api/health
```

PostgreSQL、Redis、PHP Runner 均不暴露端口；应用发布到宿主机所有网卡的 `0.0.0.0:18081`，宿主机反向代理仍可通过 `127.0.0.1:18081` 访问。

## 3. 配置反向代理

使用仓库中的模板之一：

- Nginx：`deploy/nginx/star-api.conf.example`
- Caddy：`deploy/caddy/Caddyfile.example`

替换模板内的 `example.com` 和证书路径。Nginx 模板已关闭请求及响应缓冲，并按路由限制请求体：媒体流入口 2100 MB、API 内容与站点图片管理入口 1030 MB（覆盖后台可配置的 1024 MB PHP ZIP 上限及表单开销）、其他入口 3 MB。这样既支持图片、压缩包、视频 Range 响应，也能阻止无限请求占满代理磁盘或应用内存。调整 `MEDIA_MAX_FILE_GB` 或 `MEDIA_MAX_ARCHIVE_GB` 时，应同步调整媒体上传 location 中的 `client_max_body_size`。

反向代理必须传递原始 `Host`、`X-Forwarded-Host`、`X-Forwarded-Proto` 和客户端 IP。最终访问地址为：

```text
https://example.com
https://example.com/api/<接口路径>
```

不需要 `api.example.com` 子域名。反向代理如果也运行在 Docker 内，不能使用其容器内的 `127.0.0.1`，应创建共享外部网络并代理到 `app:3000`。

## 4. 完成安装

获取一次性部署令牌：

```bash
docker compose --env-file .env.production -f compose.production.yml exec app node /app/scripts/show-install-token.mjs
```

打开 `https://example.com/install`，公开访问地址填写 `https://example.com`。安装完成后部署令牌接口会关闭。

## 5. 版本升级

### 推荐：服务器更新器

仓库提供服务器侧更新器。它不会把 Docker Socket 暴露给网站容器，也不会读取或显示环境文件中的密钥。`production:install` 在 root + systemd 环境会自动安装 `star-api-local-update.path` 和全局 `star-api` 管理命令。管理员在平台点击更新后，应用只向受限状态目录写入严格校验的版本请求，宿主机服务再创建 PostgreSQL、媒体卷、密钥卷、环境和 Compose 备份，拉取同版本 App、迁移器和 PHP Runner，执行迁移并验证健康状态。

服务器需安装 Bash、curl、jq、GNU coreutils（提供 `timeout`）、flock、systemd 和 Docker Compose v2。Debian/Ubuntu 可执行：

```bash
apt-get update && apt-get install -y bash curl jq coreutils util-linux
```

```bash
sudo star-api doctor
sudo star-api check
sudo star-api update
sudo star-api enable-updates
```

指定版本升级：

```bash
sudo star-api update 0.1.17
```

更新器使用 `.star-api-update.lock` 防止重复执行，备份保存在 `backups/<时间-版本>/`，本机任务状态保存在 `STAR_API_UPDATE_STATE_DIR`。可通过 `STAR_API_ENV_FILE`、`STAR_API_COMPOSE_FILE` 和 `STAR_API_HEALTH_URL` 覆盖非标准路径。`STAR_API_UPDATE_REGION=cn` 优先使用 `STAR_API_IMAGE_PROXIES` 中的国内镜像并按官方平台摘要校验，失败后回退 GHCR；`global` 优先 GHCR，失败后回退代理；`auto` 根据服务器时区选择。脚本默认拒绝降级；只有确认旧应用兼容当前数据库后，才可以临时设置 `STAR_API_ALLOW_DOWNGRADE=1` 并指定旧版本。

完全不依赖 GitHub 时，将 `.env.production` 中的 `STAR_API_APP_IMAGE`、`STAR_API_MIGRATOR_IMAGE` 和 `STAR_API_PHP_RUNNER_IMAGE` 改为自有或云厂商镜像仓库，并配置独立版本源：

```dotenv
STAR_API_APP_IMAGE=registry.example.com/star-api/app
STAR_API_MIGRATOR_IMAGE=registry.example.com/star-api/migrator
STAR_API_PHP_RUNNER_IMAGE=registry.example.com/star-api/php-runner
STAR_API_UPDATE_FEED_URL=https://updates.example.com/star-api/stable.json
```

版本源响应为 `{"latestVersion":"0.1.17"}`。私有仓库凭据使用宿主机 `docker login` 管理，不写入平台数据库。指定版本更新可直接运行 `sudo star-api update 0.1.17`，不需要访问 GitHub API。

迁移执行后不会自动切回旧镜像，因为旧应用不一定兼容新数据库。失败时脚本会保留目标版本、输出日志命令和备份路径，由管理员根据发布说明决定修复当前版本或完整恢复数据库、媒体与密钥备份。

### 手工升级

升级前先创建同一时间点的数据库、媒体和密钥卷备份：

```bash
mkdir -p backups
BACKUP_ID=$(date +%F-%H%M)
docker compose --env-file .env.production -f compose.production.yml exec -T postgres pg_dump -U starapi -d starapi -Fc > "backups/starapi-${BACKUP_ID}.dump"
docker compose --env-file .env.production -f compose.production.yml run --rm --no-deps -v "$PWD/backups:/backup" app sh -c "tar -C /var/lib/star-api/assets -czf /backup/starapi-assets-${BACKUP_ID}.tar.gz ."
docker compose --env-file .env.production -f compose.production.yml run --rm --no-deps --entrypoint sh -v "$PWD/backups:/backup" secrets-init -c "tar -C /run/star-api-secrets -czf /backup/starapi-secrets-${BACKUP_ID}.tar.gz ."
```

只修改应用版本：

```bash
sed -i 's/^STAR_API_VERSION=.*/STAR_API_VERSION=0.2.0/' .env.production
docker compose --env-file .env.production -f compose.production.yml pull app migrate php-runner
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=200 migrate app
curl --fail https://example.com/api/health
```

Compose 会按新标签重建三个应用容器，PostgreSQL、Redis、媒体卷和密钥卷保持不变。`POSTGRES_IMAGE`、`REDIS_IMAGE` 不跟随 `STAR_API_VERSION`，必须单独规划升级。
健康接口返回的 `version` 同样来自 `STAR_API_VERSION`，可用于确认反向代理后实际运行的版本。

### GitHub Actions 受保护部署

仓库保留 `Deploy production` 手动工作流用于受保护发布和灾备。它只接受 SSH 私钥，不接受明文密码；`PRODUCTION_UPDATE_REGION=cn` 时服务器优先从 `PRODUCTION_IMAGE_PROXIES` 按官方 SHA256 摘要拉取，`global` 时优先官方 GHCR，失败后自动回退另一条路径。发布完成后工作流会自动启用宿主机本地更新服务，后续日常更新不再依赖 Actions。

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `PRODUCTION_SSH_HOST` | 生产服务器域名或 IP |
| Secret | `PRODUCTION_SSH_PRIVATE_KEY` | 无口令的专用部署私钥，建议使用 ED25519 |
| Secret | `PRODUCTION_SSH_KNOWN_HOSTS` | 从可信服务器控制台确认的 `known_hosts` 记录；非 22 端口使用 `[host]:port` 格式 |
| Variable | `PRODUCTION_SSH_PORT` | SSH 端口，默认 `22` |
| Variable | `PRODUCTION_SSH_USER` | SSH 用户，默认 `root` |
| Variable | `PRODUCTION_DEPLOY_PATH` | 仓库在服务器上的绝对路径，如 `/opt/Star-API-For-Enterprise` |
| Variable | `PRODUCTION_HEALTH_URL` | 可选，反向代理后的公网 `/api/health` 地址 |
| Variable | `PRODUCTION_UPDATE_REGION` | `cn` 国内镜像优先，`global` 官方 GHCR 优先；默认 `cn` |
| Variable | `PRODUCTION_IMAGE_PROXIES` | 可选，逗号分隔的 GHCR 代理主机；镜像始终按官方摘要校验 |

部署公钥应只安装到目标用户的 `~/.ssh/authorized_keys`，私钥只保存在 GitHub Environment Secret 中。`PRODUCTION_SSH_KNOWN_HOSTS` 必须来自可信的服务器控制台，不要在未核对指纹的情况下直接信任 `ssh-keyscan` 输出。

在仓库 `Actions -> Deploy production -> Run workflow` 中填写不带 `v` 的稳定版本，并输入 `DEPLOY` 确认。工作流会依次执行：

1. 校验版本标签、SSH 配置和部署路径。
2. 使用固定主机指纹建立 SSH 连接，按官方摘要从可用代理拉取目标平台镜像。
3. 传输版本化 Compose 与更新器，创建数据库、媒体、密钥、环境和当前 Compose 备份，执行迁移并更新容器。
4. 自动安装本机更新 systemd 服务，验证 PostgreSQL、Redis、App 和 PHP Runner 以及内外健康接口。

## 6. 回滚边界

镜像标签可以改回旧版本，但数据库迁移只向前执行，旧应用不一定兼容已经升级的数据库结构。因此生产回滚必须基于发布说明判断：

1. 没有数据库变更时，可以改回旧 `STAR_API_VERSION` 并重新执行 `pull`、`up -d`。
2. 存在不兼容迁移时，先停止应用，再配套恢复升级前的 PostgreSQL 和媒体备份。
3. 不要执行 `docker compose down -v`，它会删除数据库、平台密钥、Redis 和媒体卷。

## 7. 运维检查

```bash
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs -f --tail=200 app
docker compose --env-file .env.production -f compose.production.yml logs --tail=200 migrate postgres redis php-runner
curl --fail http://127.0.0.1:18081/api/health
```

健康响应必须包含 `"database":"connected"`。PostgreSQL、Redis 和 PHP Runner 的 5432、6379、8080 不能对外开放。若反向代理与应用位于同一服务器，防火墙应阻止公网访问 18081；只有反向代理位于其他受信任机器时，才对其来源 IP 放行 18081。
