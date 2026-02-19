import html2canvas from "html2canvas";
import { randomId } from "./ids";

const extractNearbyText = (element: HTMLElement): string[] => {
  const parent = element.parentElement;
  if (!parent) {
    return [];
  }

  return parent.innerText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
};

const computedStyleSummary = (element: HTMLElement): Record<string, string> => {
  const style = window.getComputedStyle(element);
  return {
    display: style.display,
    padding: style.padding,
    fontSize: style.fontSize,
    backgroundColor: style.backgroundColor
  };
};

const isOverlayElement = (element: Element): boolean => {
  return element.id === "pinpatch-overlay-root" || element.closest("#pinpatch-overlay-root") !== null;
};

const buildFallbackScreenshot = (reason?: string): string => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(window.innerWidth, 1);
  canvas.height = Math.max(window.innerHeight, 1);
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#334155";
    ctx.font = "16px sans-serif";
    ctx.fillText("Pinpatch screenshot unavailable", 24, 40);
    if (reason) {
      ctx.fillStyle = "#64748b";
      ctx.font = "12px sans-serif";
      ctx.fillText(reason.slice(0, 120), 24, 64);
    }
  }

  return canvas.toDataURL("image/png");
};

const COLOR_PROPERTIES = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "caret-color",
  "fill",
  "stroke"
] as const;

const isModernColorFunction = (value: string): boolean => {
  return /oklch\(|oklab\(/i.test(value);
};

const hasInlineStyle = (element: Element): element is Element & { style: CSSStyleDeclaration } => {
  return "style" in element;
};

const createColorNormalizer = (doc: Document): ((value: string) => string) => {
  const canvas = doc.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return (value: string) => value;
  }

  return (value: string): string => {
    if (!isModernColorFunction(value)) {
      return value;
    }

    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 255] = ctx.getImageData(0, 0, 1, 1).data;
      if (a === 255) {
        return `rgb(${r}, ${g}, ${b})`;
      }
      return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    } catch {
      return value;
    }
  };
};

const normalizeCloneColorFunctions = (doc: Document): void => {
  const normalizeColor = createColorNormalizer(doc);
  const elements = doc.querySelectorAll("*");

  for (const element of elements) {
    if (!(element instanceof Element)) {
      continue;
    }

    if (isOverlayElement(element)) {
      element.remove();
      continue;
    }

    const computedStyle = doc.defaultView?.getComputedStyle(element);
    if (!computedStyle || !hasInlineStyle(element)) {
      continue;
    }

    const inlineStyle = element.style;
    for (const property of COLOR_PROPERTIES) {
      const rawValue = computedStyle.getPropertyValue(property).trim();
      if (!rawValue || !isModernColorFunction(rawValue)) {
        continue;
      }

      inlineStyle.setProperty(property, normalizeColor(rawValue), "important");
    }

    if (isModernColorFunction(computedStyle.boxShadow)) {
      inlineStyle.setProperty("box-shadow", "none", "important");
    }

    if (isModernColorFunction(computedStyle.textShadow)) {
      inlineStyle.setProperty("text-shadow", "none", "important");
    }
  }
};

export const captureScreenshot = async (): Promise<string> => {
  try {
    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      foreignObjectRendering: true,
      backgroundColor: "#ffffff",
      onclone: (clonedDocument: Document) => {
        normalizeCloneColorFunctions(clonedDocument);
      },
      ignoreElements: (element: Element) => {
        return isOverlayElement(element);
      }
    });
    return canvas.toDataURL("image/png");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn("[pinpatch] screenshot capture failed", { reason });
    return buildFallbackScreenshot(reason);
  }
};

type BuildUiChangePacketArgs = {
  clientTaskId: string;
  rect: DOMRect;
  targetElement: HTMLElement;
  userRequest: string;
};

export const buildUiChangePacket = ({
  clientTaskId,
  rect,
  targetElement,
  userRequest
}: BuildUiChangePacketArgs): Record<string, unknown> => {
  return {
    id: randomId(),
    timestamp: new Date().toISOString(),
    url: `${window.location.pathname}${window.location.search}`,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    element: {
      tag: targetElement.tagName.toLowerCase(),
      role: targetElement.getAttribute("role"),
      text: targetElement.textContent?.trim() ?? null,
      attributes: {
        class: targetElement.getAttribute("class"),
        "aria-label": targetElement.getAttribute("aria-label"),
        "data-testid": targetElement.getAttribute("data-testid")
      },
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    },
    nearbyText: extractNearbyText(targetElement),
    domSnippet: targetElement.outerHTML.slice(0, 3000),
    computedStyleSummary: computedStyleSummary(targetElement),
    screenshotPath: `.pinpatch/screenshots/${clientTaskId}.png`,
    userRequest
  };
};
