"use client";

import { useEffect } from "react";

const jobAnchor = /^job-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseJobFocusHash(hash: string) {
  try {
    const id = decodeURIComponent(hash.startsWith("#") ? hash.slice(1) : hash);
    return jobAnchor.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function FocusAnchor() {
  useEffect(() => {
    const id = parseJobFocusHash(window.location.hash);
    if (id) document.getElementById(id)?.focus();
  }, []);
  return null;
}