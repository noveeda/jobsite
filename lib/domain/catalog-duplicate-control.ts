export type CatalogDuplicateDecision = "merged" | "separate" | null;
export type CatalogDuplicateConflict = {
  code: "SEPARATE_CONFLICT" | "INDIRECT_MERGE_CONFLICT" | "COMPONENT_LIMIT";
  blockingEdges: string[];
};

export function catalogDuplicateControlState({
  decision,
  active,
  conflict,
}: {
  decision: CatalogDuplicateDecision;
  active: boolean;
  conflict?: CatalogDuplicateConflict | null;
}) {
  if (!active) {
    return {
      label: "비활성 제안",
      canMerge: false,
      canSeparate: false,
      canUndo: false,
      canReport: false,
      blocked: false,
      blockingEdges: [] as string[],
    };
  }
  if (conflict) {
    return {
      label: "적용되지 않은 요청",
      canMerge: false,
      canSeparate: false,
      canUndo: false,
      canReport: true,
      blocked: true,
      blockingEdges: conflict.blockingEdges,
    };
  }
  return {
    label: decision === "merged" ? "병합됨" : decision === "separate" ? "별개로 유지됨" : "판단 전",
    canMerge: decision !== "merged",
    canSeparate: decision !== "separate",
    canUndo: decision !== null,
    canReport: true,
    blocked: false,
    blockingEdges: [] as string[],
  };
}
