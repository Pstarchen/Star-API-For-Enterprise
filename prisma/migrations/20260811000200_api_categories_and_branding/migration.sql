CREATE TABLE "ApiCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiCategory_name_key" ON "ApiCategory"("name");
CREATE INDEX "ApiCategory_enabled_sortOrder_idx" ON "ApiCategory"("enabled", "sortOrder");

INSERT INTO "ApiCategory" ("id", "name", "description", "sortOrder", "enabled", "updatedAt") VALUES
    ('cat-identity', '身份核验', '身份认证与实名核验能力', 10, true, CURRENT_TIMESTAMP),
    ('cat-enterprise', '企业数据', '企业信息与经营数据服务', 20, true, CURRENT_TIMESTAMP),
    ('cat-recognition', '智能识别', '图像、文字和内容识别能力', 30, true, CURRENT_TIMESTAMP),
    ('cat-location', '位置服务', '地图、地址与位置查询服务', 40, true, CURRENT_TIMESTAMP),
    ('cat-message', '消息通信', '短信、邮件与消息推送能力', 50, true, CURRENT_TIMESTAMP),
    ('cat-lifestyle', '生活服务', '天气、内容与生活信息服务', 60, true, CURRENT_TIMESTAMP),
    ('cat-developer', '开发工具', '面向开发流程的基础工具能力', 70, true, CURRENT_TIMESTAMP),
    ('cat-other', '其他', '暂未归入专门类别的 API', 999, true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "ApiCategory" ("id", "name", "description", "sortOrder", "enabled", "updatedAt")
SELECT 'cat-legacy-' || md5(source."category"), source."category", '', 900, true, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "category" FROM "ApiProduct") AS source
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "ApiProduct" ADD COLUMN "categoryId" TEXT;

UPDATE "ApiProduct" AS product
SET "categoryId" = category."id"
FROM "ApiCategory" AS category
WHERE category."name" = product."category";

ALTER TABLE "ApiProduct" ALTER COLUMN "categoryId" SET NOT NULL;
DROP INDEX "ApiProduct_status_category_idx";
ALTER TABLE "ApiProduct" DROP COLUMN "category";

CREATE INDEX "ApiProduct_status_categoryId_idx" ON "ApiProduct"("status", "categoryId");
ALTER TABLE "ApiProduct" ADD CONSTRAINT "ApiProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ApiCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
