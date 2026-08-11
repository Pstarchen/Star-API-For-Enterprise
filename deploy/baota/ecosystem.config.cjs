// PM2 loads ecosystem files through CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");
const envFile = path.join(projectRoot, ".env.production.local");
process.loadEnvFile(envFile);

const required = [
  "DATABASE_URL",
  "REDIS_URL",
  "API_KEY_PEPPER",
  "SESSION_SECRET",
  "INSTALL_TOKEN",
  "INTERNAL_GATEWAY_SECRET",
  "CONFIG_ENCRYPTION_KEY",
  "API_PUBLIC_HOST",
  "API_PUBLIC_URL",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is missing from ${envFile}`);
}

const runtimeNames = [
  "NODE_ENV",
  "APP_VERSION",
  "HOSTNAME",
  "PORT",
  "DATABASE_URL",
  "REDIS_URL",
  "API_KEY_PEPPER",
  "SESSION_SECRET",
  "INSTALL_TOKEN",
  "INTERNAL_GATEWAY_SECRET",
  "CONFIG_ENCRYPTION_KEY",
  "SESSION_COOKIE_SECURE",
  "API_PUBLIC_HOST",
  "API_PUBLIC_URL",
  "LOCAL_UPSTREAM_HOSTS",
  "PHP_RUNNER_URL",
  "PHP_RUNNER_SECRET",
  "API_ASSET_STORAGE_PATH",
  "MEDIA_MAX_API_GB",
];

const runtimeEnv = Object.fromEntries(runtimeNames.flatMap((name) => (
  process.env[name] === undefined ? [] : [[name, process.env[name]]]
)));
const runtimeIdentity = process.platform !== "win32" && process.getuid?.() === 0
  ? { uid: "www", gid: "www" }
  : {};

module.exports = {
  apps: [{
    name: "star-api-app",
    cwd: projectRoot,
    script: path.join(projectRoot, ".next/standalone/server.js"),
    interpreter: "node",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    kill_timeout: 30000,
    time: true,
    env: runtimeEnv,
    ...runtimeIdentity,
  }],
};
