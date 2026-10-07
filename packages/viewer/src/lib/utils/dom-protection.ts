import { createLogger } from "./logger";
import { ALLOWED_SCRIPT_SRC_PREFIXES } from "../constants";

const log = createLogger("DOM Protection");

let observer: MutationObserver | null = null;
let contextMenuHandler: ((e: Event) => void) | null = null;
let dragStartHandler: ((e: Event) => void) | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

function sanitizeScript(el: Element): void {
  const src = el.getAttribute("src");
  const type = el.getAttribute("type");
  if (!src) {
    // startsWith cobre variantes com charset; toLowerCase cobre case
    // (RFC 7159: APPLICATION/JSON == application/json)
    const t = (type ?? "").toLowerCase();
    if (t.startsWith("application/json") || t.startsWith("application/ld+json")) {
      return;
    }
    log.warn("script_inline_removido");
    el.remove();
    return;
  }
  // //cdn/x.js → https://cdn/x.js antes do allowlist; /// e \ resolvem como
  // URL remota no browser e burlariam o prefixo "/".
  const hostile = src.startsWith("///") || src.includes("\\");
  let normalizedSrc = src;
  if (src.startsWith("//") && !hostile) {
    normalizedSrc = `https:${src}`;
  }
  if (
    hostile ||
    !ALLOWED_SCRIPT_SRC_PREFIXES.some((p) => normalizedSrc.startsWith(p))
  ) {
    log.warn("script_externo_removido");
    el.remove();
  }
}

// Best-effort: clientes determinados bypassam via devtools — a autoridade é o server.
export function initDomProtection(prod = import.meta.env.PROD): void {
  if (!prod) return;
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || !(node instanceof Element)) {
          continue;
        }
        const el = node;
        // Nó adicionado + descendentes — scripts dentro de wrappers
        // também executam quando o wrapper entra no DOM.
        const candidates: Element[] = [el, ...el.querySelectorAll("script, iframe")];
        for (const candidate of candidates) {
          // tagName é lowercase em SVG (<script> embutido em SVG executa igual)
          const tag = candidate.tagName.toUpperCase();
          if (tag === "SCRIPT") {
            sanitizeScript(candidate);
          } else if (tag === "IFRAME") {
            log.warn("iframe_removido");
            candidate.remove();
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  contextMenuHandler = (e: Event) => {
    const target = e.target;
    if (
      target instanceof Element &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
    ) {
      return;
    }
    e.preventDefault();
  };
  document.addEventListener("contextmenu", contextMenuHandler);

  dragStartHandler = (e: Event) => {
    const target = e.target;
    if (
      target instanceof Element &&
      (target.tagName === "VIDEO" || target.tagName === "IMG")
    ) {
      e.preventDefault();
    }
  };
  document.addEventListener("dragstart", dragStartHandler);

  keydownHandler = (e: KeyboardEvent) => {
    if (e.key === "F12") {
      e.preventDefault();
      return;
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j")
    ) {
      e.preventDefault();
      return;
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      (e.key === "C" || e.key === "c")
    ) {
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
    }
  };
  document.addEventListener("keydown", keydownHandler);
}

export function destroyDomProtection(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (contextMenuHandler) {
    document.removeEventListener("contextmenu", contextMenuHandler);
    contextMenuHandler = null;
  }
  if (dragStartHandler) {
    document.removeEventListener("dragstart", dragStartHandler);
    dragStartHandler = null;
  }
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }
}
