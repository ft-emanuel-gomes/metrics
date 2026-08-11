"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface ThemedLogoProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * Logo que se adapta ao tema: no modo claro, inverte as cores (branco → preto).
 * Usa CSS filter para evitar necessidade de dois arquivos SVG.
 */
export default function ThemedLogo({ src, alt, width, height, className }: ThemedLogoProps) {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    function checkTheme() {
      setIsLight(document.documentElement.getAttribute("data-theme") === "light");
    }
    checkTheme();

    // Observar mudanças no atributo data-theme
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={{ filter: isLight ? "invert(1)" : "none", transition: "filter 0.2s ease" }}
    />
  );
}
