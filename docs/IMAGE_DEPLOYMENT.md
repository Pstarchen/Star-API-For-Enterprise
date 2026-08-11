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

替换模板内的 `example.com` 和证书路径。Nginx 模板已关闭请求及响应缓冲并取消请求体大小限制，以支持媒体流式上传、图片返回和视频 Range 响应。

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
