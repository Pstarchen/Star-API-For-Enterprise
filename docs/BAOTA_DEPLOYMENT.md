# 宝塔原生部署指南

该模式不构建、不拉取 Star-API Docker 镜像。PostgreSQL、Redis 和 Node.js 由宝塔管理，Next.js 使用 standalone 产物并由 PM2 守护。应用监听 `0.0.0.0:18081`，可直接使用 `IP:18081` 访问；后续是否配置反向代理不影响应用运行。

## 1. 适用范围

- 推荐系统：Ubuntu 22.04/24.04 或 Debian 12
- 推荐配置：2 核 CPU、4 GB 内存、20 GB 以上可用磁盘
- 宝塔软件：Node.js 22、PostgreSQL 16、Redis 7、PHP 8.3
- PHP 需要 CLI 和 CGI；宝塔默认路径通常为 `/www/server/php/83/bin/php` 和 `/www/server/php/83/bin/php-cgi`
- 对公网开放 TCP `18081` 后，可通过 `http://服务器IP:18081` 直接访问

不要使用 SQLite、静态站点或 `npm run dev` 代替生产运行方式。图片和视频文件存放在项目的 `.data/api-assets`，数据库与该目录都必须备份。

## 2. 创建数据库

在宝塔 PostgreSQL 管理器中创建：

- 数据库名：`starapi`
- 用户名：`starapi`
- 主机：`127.0.0.1`
- 端口：`5432`
- 密码：使用宝塔随机生成的强密码，后续初始化时输入同一个密码

Redis 只监听 `127.0.0.1:6379`，不要开放到公网。

## 3. 获取源码与初始化

```bash
cd /www/wwwroot
git clone https://github.com/Pstarchen/Star-API-For-Enterprise.git star-api
cd /www/wwwroot/star-api
bash deploy/baota/init-environment.sh
```

首次测试填写 `http://服务器IP:18081`。脚本会隐藏数据库密码输入，并自动生成 API Key Pepper、会话密钥、部署令牌、内部网关密钥、配置加密密钥和 PHP Runner 密钥。密钥只写入被 Git 忽略的 `.env.production.local`，不会输出到终端。

如果脚本检测不到 PHP，先在宝塔安装 PHP 8.3，并确认以下命令存在：

```bash
/www/server/php/83/bin/php -v
/www/server/php/83/bin/php-cgi -v
```

## 4. 构建与迁移

以下命令安装锁定版本的依赖、生成 Prisma Client、执行生产迁移、构建 Next.js，并复制 standalone 必需的静态文件：

```bash
bash deploy/baota/build.sh
```

生产数据库只能执行 `prisma migrate deploy`，不要执行 `prisma migrate dev`。

## 5. 启动 PHP Runner

上传的 PHP 源码不能直接和主站进程混跑。仓库提供的 systemd 服务使用独立系统用户、只读文件系统、私有临时目录、内存/进程限制和仅回环网络运行：

```bash
sudo bash deploy/baota/install-php-runner-service.sh
systemctl status star-api-php-runner --no-pager
```

该服务只监听 `127.0.0.1:18082`，禁止在宝塔安全页或云安全组中开放此端口。

## 6. 启动主站

宝塔 Node 项目管理器通常已经提供 PM2。没有 `pm2` 命令时先安装：

```bash
npm install --global pm2
```

启动或平滑重载：

```bash
pm2 startOrReload deploy/baota/ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

在宝塔 root 终端执行时，配置会自动将实际应用进程降权为 `www:www`；不要删除服务器的 `www` 运行用户。

然后验证：

```bash
curl --fail http://127.0.0.1:18081/api/health
```

返回值必须同时包含 `"status":"ok"` 和 `"database":"connected"`。再访问 `http://服务器IP:18081/install` 完成管理员初始化。

获取首次安装所需的部署令牌：

```bash
npm run --silent install:token:host
```

该命令先通过本机 `18081` 端口确认平台尚未安装，再只输出部署令牌。初始化完成后，安装接口永久关闭，命令也不再显示令牌。

## 7. 宝塔 Node 项目管理器参数

也可以不用手动执行 PM2 命令，在“网站 -> Node 项目”中填写：

- 项目目录：`/www/wwwroot/star-api`
- Node 版本：`22`
- 启动用户：`www`
- 启动文件：`.next/standalone/server.js`
- 运行目录：`/www/wwwroot/star-api`
- 端口：`18081`
- 环境文件：`.env.production.local`

若当前宝塔版本没有环境文件选项，使用仓库的 `ecosystem.config.cjs`，不要把密钥逐项粘贴到面板日志中。

## 8. 后续升级

先备份 PostgreSQL 和 `.data/api-assets`，然后执行：

```bash
cd /www/wwwroot/star-api
git pull --ff-only
bash deploy/baota/build.sh
sudo systemctl restart star-api-php-runner
pm2 startOrReload deploy/baota/ecosystem.config.cjs --update-env
curl --fail http://127.0.0.1:18081/api/health
```

该流程不依赖镜像版本号。升级版本由 Git 提交和数据库 migration 一起控制，比重新构建 Compose 镜像更快。

## 9. 端口与备份

- 公网：只开放 SSH、`18081`，以及你后续反向代理使用的 `80/443`
- 本机：PostgreSQL `5432`、Redis `6379`、PHP Runner `18082` 均只允许回环访问
- 必备备份：PostgreSQL 完整备份、`.data/api-assets`、`.env.production.local`
- `.env.production.local` 包含平台密钥，备份必须加密并限制读取权限

配置域名和 HTTPS 后，在 `.env.production.local` 中将 `API_PUBLIC_URL` 改成站点源地址、`API_PUBLIC_HOST` 改成域名、`SESSION_COOKIE_SECURE` 改为 `true`，并在管理员“平台设置”中同步更新公开地址，再执行 PM2 平滑重载。公开接口保持同域名下的 `/api/<路由>`，不会增加 `api.` 子域名前缀。
