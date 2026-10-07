import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

class FakeElement {
  nodeType = 1;
  tagName: string;
  removed = false;
  children: FakeElement[] = [];
  private attrs = new Map<string, string>();
  constructor(tag: string, attrs: Record<string, string> = {}) {
    this.tagName = tag;
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  remove() {
    this.removed = true;
  }
  querySelectorAll(sel: string): FakeElement[] {
    const tags = sel.split(",").map((s) => s.trim().toUpperCase());
    const found: FakeElement[] = [];
    const walk = (el: FakeElement) => {
      for (const c of el.children) {
        if (tags.includes(c.tagName.toUpperCase())) found.push(c);
        walk(c);
      }
    };
    walk(this);
    return found;
  }
}

let moCallback: ((mutations: { addedNodes: unknown[] }[]) => void) | null =
  null;

class FakeMutationObserver {
  static last: FakeMutationObserver | null = null;
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(cb: typeof moCallback) {
    moCallback = cb;
    FakeMutationObserver.last = this;
  }
}

const listeners = new Map<string, (e: unknown) => void>();
const fakeDocument = {
  body: {},
  addEventListener: (t: string, fn: (e: unknown) => void) =>
    listeners.set(t, fn),
  removeEventListener: (t: string) => listeners.delete(t),
};

vi.stubGlobal("MutationObserver", FakeMutationObserver);
vi.stubGlobal("document", fakeDocument);
vi.stubGlobal("Node", { ELEMENT_NODE: 1 });
vi.stubGlobal("Element", FakeElement);

function fireNodes(nodes: unknown[]) {
  moCallback?.([{ addedNodes: nodes }]);
}

function fireEvent(type: string, e: { target: unknown; preventDefault: () => void }) {
  listeners.get(type)?.(e);
}

function evt() {
  return { target: null as unknown, preventDefault: vi.fn() };
}

async function load() {
  vi.resetModules();
  return await import("./dom-protection");
}

beforeEach(() => {
  moCallback = null;
  FakeMutationObserver.last = null;
  listeners.clear();
});

describe("init guard", () => {
  it("prod=false → no-op (sem observer nem listeners)", async () => {
    const m = await load();
    m.initDomProtection(false);
    expect(moCallback).toBeNull();
    expect(listeners.size).toBe(0);
  });

  it("double-init → um único observer", async () => {
    const m = await load();
    m.initDomProtection(true);
    const cb = moCallback;
    m.initDomProtection(true);
    expect(moCallback).toBe(cb);
  });
});

describe("mutation rules", () => {
  it("script inline sem src → removido", async () => {
    const m = await load();
    m.initDomProtection(true);
    const s = new FakeElement("SCRIPT");
    fireNodes([s]);
    expect(s.removed).toBe(true);
  });

  it("script de dados application/json preservado (case + charset)", async () => {
    const m = await load();
    m.initDomProtection(true);
    const a = new FakeElement("SCRIPT", {
      type: "APPLICATION/JSON; charset=utf-8",
    });
    const b = new FakeElement("SCRIPT", { type: "application/ld+json" });
    fireNodes([a, b]);
    expect(a.removed).toBe(false);
    expect(b.removed).toBe(false);
  });

  it("src fora do allowlist → removido; src local → preservado", async () => {
    const m = await load();
    m.initDomProtection(true);
    const evil = new FakeElement("SCRIPT", { src: "https://evil.com/x.js" });
    const local = new FakeElement("SCRIPT", { src: "/_app/x.js" });
    fireNodes([evil, local]);
    expect(evil.removed).toBe(true);
    expect(local.removed).toBe(false);
  });

  it("protocol-relative normaliza para https:; triple-slash rejeitado", async () => {
    const m = await load();
    m.initDomProtection(true);
    const proto = new FakeElement("SCRIPT", { src: "//evil.com/x.js" });
    const triple = new FakeElement("SCRIPT", { src: "///evil.com/x.js" });
    fireNodes([proto, triple]);
    expect(proto.removed).toBe(true);
    expect(triple.removed).toBe(true);
  });

  it("iframe injetado → removido", async () => {
    const m = await load();
    m.initDomProtection(true);
    const f = new FakeElement("IFRAME", { src: "https://evil.com" });
    fireNodes([f]);
    expect(f.removed).toBe(true);
  });

  it("script/iframe aninhados em wrapper também são removidos", async () => {
    const m = await load();
    m.initDomProtection(true);
    const wrapper = new FakeElement("DIV");
    const script = new FakeElement("SCRIPT", { src: "https://evil.com/x.js" });
    const inline = new FakeElement("SCRIPT");
    const iframe = new FakeElement("IFRAME");
    const nested = new FakeElement("SECTION");
    nested.children = [iframe];
    wrapper.children = [script, nested];
    fireNodes([wrapper]);
    expect(script.removed).toBe(true);
    expect(inline.removed).toBe(false); // não inserido — só conferindo seletividade
    expect(iframe.removed).toBe(true);
    expect(wrapper.removed).toBe(false);
  });

  it("tagName lowercase (script em SVG) também é sanitizado", async () => {
    const m = await load();
    m.initDomProtection(true);
    const svgScript = new FakeElement("script", { src: "https://evil.com/x.js" });
    const svgIframe = new FakeElement("iframe");
    fireNodes([svgScript, svgIframe]);
    expect(svgScript.removed).toBe(true);
    expect(svgIframe.removed).toBe(true);
  });

  it("backslash no src resolve como URL remota → removido", async () => {
    const m = await load();
    m.initDomProtection(true);
    const backslash = new FakeElement("SCRIPT", { src: "/\\evil.com/x.js" });
    const local = new FakeElement("SCRIPT", { src: "/_app/x.js" });
    fireNodes([backslash, local]);
    expect(backslash.removed).toBe(true);
    expect(local.removed).toBe(false);
  });
});

describe("listeners", () => {
  it("contextmenu prevenido fora de input; dentro de INPUT/TEXTAREA passa", async () => {
    const m = await load();
    m.initDomProtection(true);
    const div = new FakeElement("DIV");
    const input = new FakeElement("INPUT");
    const e1 = evt();
    e1.target = div;
    const e2 = evt();
    e2.target = input;
    fireEvent("contextmenu", e1);
    fireEvent("contextmenu", e2);
    expect(e1.preventDefault).toHaveBeenCalled();
    expect(e2.preventDefault).not.toHaveBeenCalled();
  });

  it("dragstart em VIDEO/IMG prevenido; DIV passa", async () => {
    const m = await load();
    m.initDomProtection(true);
    const v = evt();
    v.target = new FakeElement("VIDEO");
    const i = evt();
    i.target = new FakeElement("IMG");
    const d = evt();
    d.target = new FakeElement("DIV");
    fireEvent("dragstart", v);
    fireEvent("dragstart", i);
    fireEvent("dragstart", d);
    expect(v.preventDefault).toHaveBeenCalled();
    expect(i.preventDefault).toHaveBeenCalled();
    expect(d.preventDefault).not.toHaveBeenCalled();
  });

  it("F12, Ctrl+Shift+I/J/C e Ctrl+U prevenidos; tecla normal passa", async () => {
    const m = await load();
    m.initDomProtection(true);
    const cases = [
      { key: "F12" },
      { key: "I", ctrlKey: true, shiftKey: true },
      { key: "j", metaKey: true, shiftKey: true },
      { key: "C", ctrlKey: true, shiftKey: true },
      { key: "u", ctrlKey: true },
      { key: "U", metaKey: true },
    ];
    for (const c of cases) {
      const e = evt();
      Object.assign(e, c);
      fireEvent("keydown", e);
      expect(e.preventDefault).toHaveBeenCalled();
    }
    const normal = evt();
    Object.assign(normal, { key: "a" });
    fireEvent("keydown", normal);
    expect(normal.preventDefault).not.toHaveBeenCalled();
  });
});

describe("destroy", () => {
  it("desconecta observer e remove os 3 listeners", async () => {
    const m = await load();
    m.initDomProtection(true);
    const obs = FakeMutationObserver.last;
    expect(listeners.size).toBe(3);
    m.destroyDomProtection();
    expect(obs?.disconnect).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
  });
});
