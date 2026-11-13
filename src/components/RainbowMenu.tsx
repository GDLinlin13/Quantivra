/** The sidebar colours: each menu item has its own soft colour, shown when the pointer is on it and when it is the open page. */
const RAINBOW = ['#fca5a5', '#fb923c', '#fde68a', '#86efac', '#7dd3fc', '#a78bfa', '#c084fc'];

/** Style rules for a menu with `className`; `offset` starts the colours further along (a second menu under the first). */
export function RainbowMenuStyle({ className, offset = 0 }: { className: string; offset?: number }) {
  const rules = RAINBOW.map((c, i) => {
    const nth = `7n+${((i - offset % 7 + 7) % 7) + 1}`;
    const item = `.${className}.ant-menu > .ant-menu-item:nth-child(${nth})`;
    return `
      ${item}:hover { color: ${c} !important; background: color-mix(in srgb, ${c} 8%, transparent) !important; }
      ${item}:hover .anticon { color: ${c} !important; }
      ${item}.ant-menu-item-selected { color: ${c} !important; background: color-mix(in srgb, ${c} 10%, transparent) !important; box-shadow: inset 3px 0 0 ${c}; }
      ${item}.ant-menu-item-selected .anticon { color: ${c} !important; }`;
  }).join('\n');
  return <style>{`.${className}.ant-menu > .ant-menu-item { transition: color 0.15s, background 0.15s; }\n${rules}`}</style>;
}
