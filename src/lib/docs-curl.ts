type DocsRequestParameter = {
  location: "PATH" | "QUERY" | "BODY";
  name: string;
  required: boolean;
  defaultValue: string | null;
  sensitive: boolean;
};

type DocsCurlInput = {
  url: string;
  methods: string[];
  parameters: DocsRequestParameter[];
};

function exampleValue(parameter: DocsRequestParameter) {
  if (!parameter.sensitive && parameter.defaultValue?.trim()) return parameter.defaultValue;
  return `{${parameter.name}}`;
}

function encodeExample(value: string) {
  return /^\{[A-Za-z0-9_-]+\}$/.test(value) ? value : encodeURIComponent(value);
}

function requestUrl(url: string, parameters: DocsRequestParameter[]) {
  let result = url;
  for (const parameter of parameters.filter((item) => item.location === "PATH")) {
    result = result.replaceAll(`{${parameter.name}}`, encodeExample(exampleValue(parameter)));
  }

  const query = parameters
    .filter((item) => item.location === "QUERY" && (item.required || Boolean(item.defaultValue?.trim())))
    .map((parameter) => `${encodeURIComponent(parameter.name)}=${encodeExample(exampleValue(parameter))}`);
  if (!query.length) return result;
  return `${result}${result.includes("?") ? "&" : "?"}${query.join("&")}`;
}

function requestBody(parameters: DocsRequestParameter[]) {
  return Object.fromEntries(parameters
    .filter((item) => item.location === "BODY" && (item.required || Boolean(item.defaultValue?.trim())))
    .map((parameter) => [parameter.name, exampleValue(parameter)]));
}

function callableMethods(methods: string[]) {
  if (methods.includes("ALL")) return ["GET"];
  return methods.length ? methods : ["GET"];
}

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildDocsCurlCommands(input: DocsCurlInput) {
  const url = requestUrl(input.url, input.parameters);
  const body = requestBody(input.parameters);
  const hasBody = Object.keys(body).length > 0;

  return callableMethods(input.methods).map((method) => {
    const command = hasBody && !["GET", "HEAD"].includes(method)
      ? [
          `curl --request ${method} ${shellSingleQuote(url)} \\`,
          "  --header 'Authorization: Bearer $STAR_API_KEY' \\",
          "  --header 'Content-Type: application/json' \\",
          `  --data ${shellSingleQuote(JSON.stringify(body))}`,
        ].join("\n")
      : [
          `curl --request ${method} ${shellSingleQuote(url)} \\`,
          "  --header 'Authorization: Bearer $STAR_API_KEY'",
        ].join("\n");
    return { method, command };
  });
}
