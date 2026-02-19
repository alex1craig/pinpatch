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

export const captureScreenshot = async (): Promise<string> => {
  try {
    const html2canvasModule = await import("html2canvas");
    const html2canvas = html2canvasModule.default as unknown as (
      element: HTMLElement,
      options: {
        logging: boolean;
        useCORS: boolean;
        backgroundColor: string | null;
        ignoreElements: (element: Element) => boolean;
      }
    ) => Promise<HTMLCanvasElement>;

    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      backgroundColor: null,
      ignoreElements: (element: Element) => {
        return element.id === "pinpatch-overlay-root" || element.closest("#pinpatch-overlay-root") !== null;
      }
    });
    return canvas.toDataURL("image/png");
  } catch {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1, 1);
    }
    return canvas.toDataURL("image/png");
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
import { randomId } from "./ids";
