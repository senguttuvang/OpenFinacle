"use client";

import { useCallback, useEffect, useState } from "react";

/** URL changes keep the banking shell mounted; Back/Forward never issue a command. */
export function usePortalLocation() {
  const [path, setPath] = useState("/");
  const navigate = useCallback((next: string) => {
    if (window.location.pathname !== next)
      window.history.pushState(null, "", next);
    setPath(next);
  }, []);
  useEffect(() => {
    const restore = () => setPath(window.location.pathname);
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  return { path, navigate };
}

export function followPortalLink(
  event: React.MouseEvent<HTMLAnchorElement>,
  navigate: () => void,
) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  navigate();
}
