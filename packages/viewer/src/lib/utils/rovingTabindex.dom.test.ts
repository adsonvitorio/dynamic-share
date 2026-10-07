// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { rovingList } from "./rovingTabindex";

function item(ul: HTMLElement): HTMLElement {
  const el = document.createElement("li");
  el.setAttribute("data-roving-item", "");
  ul.appendChild(el);
  return el;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("rovingList (DOM)", () => {
  it("item presente no mount recebe tabindex 0 sem foco", () => {
    const ul = document.createElement("ul");
    document.body.appendChild(ul);
    const first = item(ul);
    const action = rovingList(ul);
    expect(first.getAttribute("tabindex")).toBe("0");
    action.destroy();
    document.body.removeChild(ul);
  });

  it("itens que chegam depois recebem tabindex do índice ativo", async () => {
    const ul = document.createElement("ul");
    document.body.appendChild(ul);
    const action = rovingList(ul);

    const first = item(ul);
    await tick();
    expect(first.getAttribute("tabindex")).toBe("0");

    const second = item(ul);
    await tick();
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(second.getAttribute("tabindex")).toBe("-1");

    action.destroy();
    document.body.removeChild(ul);
  });

  it("índice ativo é preservado (clamp) quando a lista encolhe", async () => {
    const ul = document.createElement("ul");
    document.body.appendChild(ul);
    const a = item(ul);
    const b = item(ul);
    const action = rovingList(ul);
    await tick();

    a.focus();
    ul.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute("tabindex")).toBe("0");

    b.remove();
    await tick();
    expect(a.getAttribute("tabindex")).toBe("0");

    action.destroy();
    document.body.removeChild(ul);
  });

  it("setas movem o foco entre itens reais", async () => {
    const ul = document.createElement("ul");
    document.body.appendChild(ul);
    const a = item(ul);
    const b = item(ul);
    const c = item(ul);
    const action = rovingList(ul);
    await tick();

    a.focus();
    ul.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(b);
    ul.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(c);
    ul.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(a);

    action.destroy();
    document.body.removeChild(ul);
  });
});
