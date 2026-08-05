export const internalHandlerTemplates = [
  { id: "time.now", name: "当前时间", description: "返回服务器当前 ISO 时间与 Unix 时间戳", methods: ["GET"] },
  { id: "utility.uuid", name: "UUID 生成", description: "生成符合 RFC 4122 的随机 UUID", methods: ["GET", "POST"] },
  { id: "crypto.sha256", name: "SHA-256 摘要", description: "计算输入文本的 SHA-256 十六进制摘要", methods: ["POST"] },
  { id: "text.transform", name: "文本转换", description: "对文本执行大写、小写、去首尾空格或长度统计", methods: ["POST"] },
] as const;

export type InternalHandlerId = (typeof internalHandlerTemplates)[number]["id"];
