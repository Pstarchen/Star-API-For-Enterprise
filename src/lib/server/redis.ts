import "server-only";

import { createClient, type RedisClientType } from "redis";

const globalRedis = globalThis as unknown as { starApiRedis?: RedisClientType; starApiRedisPromise?: Promise<RedisClientType> };

async function connectedRedis() {
  if (globalRedis.starApiRedis?.isReady) return globalRedis.starApiRedis;
  if (!globalRedis.starApiRedisPromise) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not configured");
    const client = createClient({ url });
    client.on("error", (error) => console.error("Redis connection error", error.message));
    globalRedis.starApiRedis = client;
    globalRedis.starApiRedisPromise = client.connect().then(() => client);
  }
  return globalRedis.starApiRedisPromise;
}

export async function consumeRateLimit(key: string, limit: number) {
  if (limit <= 0) return { allowed: false, remaining: 0 };
  const redis = await connectedRedis();
  const count = Number(await redis.eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],2) end; return n",
    { keys: [key], arguments: [] },
  ));
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
