WITH platform_host AS (
  SELECT lower(substring(value->>'publicUrl' FROM '^https?://([^/:]+)')) AS host
  FROM "PlatformSetting"
  WHERE key = 'platform'
), migrated_routes AS (
  SELECT
    endpoint.id,
    platform_host.host AS public_host,
    CASE
      WHEN endpoint."publicPath" = '/api' OR endpoint."publicPath" LIKE '/api/%' THEN endpoint."publicPath"
      WHEN endpoint."publicPath" = '/' THEN '/api'
      ELSE '/api' || endpoint."publicPath"
    END AS public_path
  FROM "Endpoint" AS endpoint
  CROSS JOIN platform_host
  WHERE platform_host.host IS NOT NULL
    AND (
      endpoint."publicHost" = platform_host.host
      OR endpoint."publicHost" = 'api.' || platform_host.host
      OR endpoint."publicHost" = 'gateway.' || platform_host.host
      OR endpoint."publicHost" IN ('api.localhost', 'gateway.localhost')
    )
)
UPDATE "Endpoint" AS endpoint
SET
  "publicHost" = migrated_routes.public_host,
  "publicPath" = migrated_routes.public_path
FROM migrated_routes
WHERE endpoint.id = migrated_routes.id;
