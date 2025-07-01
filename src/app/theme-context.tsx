"use client";

import { createContext, useState, ReactNode } from "react";

export const ThemeContext = createContext<{themeIdx: number, setThemeIdx: (idx: number) => void}>({ themeIdx: 0, setThemeIdx: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeIdx, setThemeIdx] = useState(0);
  return (
    <ThemeContext.Provider value={{ themeIdx, setThemeIdx }}>
      {children}
    </ThemeContext.Provider>
  );
} 