import type { ProviderName } from "@pinpatch/core";

const escapeInlineScriptJson = (json: string): string =>
  json
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const serializeInlineScriptValue = (value: string): string => escapeInlineScriptJson(JSON.stringify(value));

export const injectOverlayScript = (
  html: string,
  bridgePort: number,
  provider: ProviderName,
  model: string
): string => {
  const bridgeUrl = `http://localhost:${bridgePort}`;
  const injectBlock = [
    `<script>window.__PINPATCH_BRIDGE_URL = ${serializeInlineScriptValue(bridgeUrl)};</script>`,
    `<script>window.__PINPATCH_PROVIDER = ${serializeInlineScriptValue(provider)};</script>`,
    `<script>window.__PINPATCH_MODEL = ${serializeInlineScriptValue(model)};</script>`,
    `<script src="${bridgeUrl}/overlay.js" data-pinpatch-overlay="true"></script>`
  ].join("\n");

  if (html.includes("</head>")) {
    return html.replace("</head>", `${injectBlock}\n</head>`);
  }

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injectBlock}\n</body>`);
  }

  return `${html}\n${injectBlock}`;
};

