import type { ReactNode } from "react";

import { TreeUploadPanelProvider } from "@/components/upload/tree-upload-panel-provider";

export default function TreeSlugLayout({ children }: { children: ReactNode }) {
  return <TreeUploadPanelProvider>{children}</TreeUploadPanelProvider>;
}
