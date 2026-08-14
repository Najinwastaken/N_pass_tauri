// Minimal custom context menu (native menus are not available in the WebView).

import { useEffect, useState } from "react";

export interface MenuItem {
  label: string;
  action: () => void;
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/**
 * Usage:
 *   const { menu, openMenu } = useContextMenu();
 *   <input onContextMenu={(e) => openMenu(e, [{ label, action }])} />
 *   ... {menu}
 */
export function useContextMenu() {
  const [state, setState] = useState<MenuState | null>(null);

  useEffect(() => {
    if (!state) return;
    const close = () => setState(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("blur", close);
    };
  }, [state]);

  function openMenu(e: React.MouseEvent, items: MenuItem[]) {
    e.preventDefault();
    e.stopPropagation();
    setState({ x: e.clientX, y: e.clientY, items });
  }

  const menu = state ? (
    <ul className="context-menu" style={{ left: state.x, top: state.y }}>
      {state.items.map((item) => (
        <li
          key={item.label}
          onClick={() => {
            setState(null);
            item.action();
          }}
        >
          {item.label}
        </li>
      ))}
    </ul>
  ) : null;

  return { menu, openMenu };
}
