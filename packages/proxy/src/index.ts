import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import httpProxy from "http-proxy";
import type { Logger } from "@pinpatch/core";

export type ReverseProxyOptions = {
  targetPort: number;
  proxyPort: number;
  bridgePort: number;
  logger: Logger;
};

export type ReverseProxyHandle = {
  server: Server;
  start(): Promise<void>;
  stop(): Promise<void>;
};

const injectOverlayScript = (html: string, bridgePort: number): string => {
  const injectBlock = [
    `<script>window.__PINPATCH_BRIDGE_URL = "http://localhost:${bridgePort}";</script>`,
    `<script src="http://localhost:${bridgePort}/overlay.js" data-pinpatch-overlay="true"></script>`
  ].join("\n");

  if (html.includes("</head>")) {
    return html.replace("</head>", `${injectBlock}\n</head>`);
  }

  if (html.includes("</body>")) {
    return html.replace("</body>", `${injectBlock}\n</body>`);
  }

  return `${html}\n${injectBlock}`;
};

export const createReverseProxy = (options: ReverseProxyOptions): ReverseProxyHandle => {
  const target = `http://localhost:${options.targetPort}`;

  const proxy = httpProxy.createProxyServer({
    target,
    changeOrigin: true,
    ws: true,
    selfHandleResponse: true
  });

  proxy.on("proxyReq", (proxyReq) => {
    proxyReq.setHeader("accept-encoding", "identity");
  });

  proxy.on("error", (error, req, res) => {
    options.logger.error(`Proxy error: ${error.message}`, {
      component: "proxy",
      event: "proxy.error",
      meta: {
        url: req.url
      }
    });

    if (res && "writeHead" in res) {
      const nodeRes = res as ServerResponse;
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(502, { "content-type": "application/json" });
      }
      nodeRes.end(JSON.stringify({ error: "Proxy target unavailable", target }));
    }
  });

  proxy.on("proxyRes", (proxyRes, req: IncomingMessage, res: ServerResponse) => {
    const statusCode = proxyRes.statusCode ?? 502;
    const contentType = String(proxyRes.headers["content-type"] ?? "");

    if (!contentType.includes("text/html")) {
      res.writeHead(statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      return;
    }

    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));

    proxyRes.on("end", () => {
      try {
        const originalHtml = Buffer.concat(chunks).toString("utf8");

        if (originalHtml.includes("data-pinpatch-overlay")) {
          res.writeHead(statusCode, {
            ...proxyRes.headers,
            "content-length": Buffer.byteLength(originalHtml)
          });
          res.end(originalHtml);
          return;
        }

        const injectedHtml = injectOverlayScript(originalHtml, options.bridgePort);

        res.writeHead(statusCode, {
          ...proxyRes.headers,
          "content-length": Buffer.byteLength(injectedHtml)
        });
        res.end(injectedHtml);
      } catch (error) {
        options.logger.warn("Failed to inject overlay; forwarding original HTML", {
          component: "proxy",
          event: "proxy.inject.failed",
          meta: {
            url: req.url,
            error: error instanceof Error ? error.message : String(error)
          }
        });

        const originalHtml = Buffer.concat(chunks);
        res.writeHead(statusCode, {
          ...proxyRes.headers,
          "content-length": originalHtml.byteLength
        });
        res.end(originalHtml);
      }
    });
  });

  const server = createServer((req, res) => {
    proxy.web(req, res, {
      target
    });
  });

  server.on("upgrade", (req, socket, head) => {
    proxy.ws(req, socket, head, { target });
  });

  return {
    server,
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.proxyPort, () => {
          server.off("error", reject);
          resolve();
        });
      });

      options.logger.info(`Proxy listening on http://localhost:${options.proxyPort}`, {
        component: "proxy",
        event: "proxy.started",
        meta: {
          target
        }
      });
    },
    async stop() {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      proxy.close();

      options.logger.info("Proxy stopped", {
        component: "proxy",
        event: "proxy.stopped"
      });
    }
  };
};
