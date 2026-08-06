import { recognizeSource } from "./connector";
export function manualReference(url: string) { return { ...recognizeSource(url), connectorMode: "manual" as const }; }
