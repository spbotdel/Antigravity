import { Suspense } from "react";

import { FamilyTreeTest3Page } from "@/components/landing/family-tree-test3-page";

export default function Test3LandingPageRoute() {
  return (
    <main>
      <Suspense fallback={null}>
        <FamilyTreeTest3Page />
      </Suspense>
    </main>
  );
}
