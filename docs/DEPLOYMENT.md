# Docker 部署指南

本文档适用于单机 Docker Compose 部署。生产集群可沿用同一镜像接入 Kubernetes、托管 PostgreSQL 和托管 Redis。

## 1. 环境要求

- Docker Engine 24+
- Docker Compose v2+
- 建议 2 核 CPU、4 GB 内存、20 GB 可用磁盘

服务器只需对外开放应用端口，PostgreSQL 和 Redis 默认仅绑定 `127.0.0.1`。

## 2. 首次部署

```bash
git clone https://github.com/Pstarchen/Star-API-For-Enterprise.git
cd Star-API-For-Enterprise
cp .env.docker.example .env
```

为三个敏感变量分别生成不同值：

```bash
openssl rand -hex 32
```

编辑 `.env`，替换 `POSTGRES_PASSWORD`、`API_KEY_PEPPER` 和 `SESSION_SECRET`，然后启动：

```bash
docker compose config
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

默认访问地址为 `http://服务器IP:3000`。如需更换端口，修改 `.env` 中的 `APP_PORT`。

如果 Docker Hub 或本机配置的镜像加速器不可用，可取消 `.env.docker.example` 末尾三个镜像覆盖项的注释，再重新构建。镜像地址通过环境变量传入，不需要修改 Dockerfile 或 Compose 文件。

## 3. 常用运维

查看服务状态与日志：

```bash
docker compose ps
docker compose logs -f --tail=200 app
docker compose logs -f --tail=200 postgres redis
```

拉取代码并滚动更新：

```bash
git pull --ff-only
docker compose build --pull app
docker compose up -d --no-deps app
docker compose ps
```

回滚到指定提交：

```bash
git checkout <已验证的提交SHA>
docker compose up -d --build app
```

## 4. 数据备份

备份目录已加入 `.gitignore`，不会被提交到 GitHub。

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U starapi -d starapi -Fc > backups/starapi-$(date +%F-%H%M).dump
```

恢复前应先在独立环境验证备份。恢复命令会覆盖目标数据库中的同名对象：

```bash
docker compose exec -T postgres pg_restore -U starapi -d starapi --clean --if-exists < backups/<备份文件>.dump
```

## 5. 停止与清理

停止容器但保留数据：

```bash
docker compose down
```

不要在生产环境执行 `docker compose down -v`，该命令会删除 PostgreSQL 与 Redis 数据卷。

## 6. 生产建议

- 使用 Nginx、Caddy 或云负载均衡终止 HTTPS，不直接暴露明文 HTTP。
- 将环境变量放入服务器密钥管理系统，不写入镜像、Compose 文件或 Git。
- 定期执行 PostgreSQL 备份和恢复演练，Redis 仅作为可重建的缓存与计数层。
- 上线真实密钥管理前接入企业 SSO、RBAC、KMS 和不可变审计日志。
- 监控 `/api/health`、容器重启次数、磁盘空间、PostgreSQL 连接数和 Redis 内存。
