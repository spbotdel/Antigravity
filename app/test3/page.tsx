import { FamilyTreeTest3Page } from "@/components/landing/family-tree-test3-page";

interface Test3LandingPageRouteProps {
  searchParams?: Promise<{
    sunVariant?: string | string[];
  }>;
}

export default async function Test3LandingPageRoute({ searchParams }: Test3LandingPageRouteProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawSunVariant = resolvedSearchParams?.sunVariant;
  const initialSunVariant = Array.isArray(rawSunVariant) ? rawSunVariant[0] : rawSunVariant;

  return (
    <main>
      <FamilyTreeTest3Page initialSunVariant={initialSunVariant} />
    </main>
  );
}
