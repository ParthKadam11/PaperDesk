import { HowItWorks } from "@/components/HowItWorks";
import { SiteHeader } from "@/components/SiteHeader";

export default function SystemPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-16 sm:px-8">
        <HowItWorks guideHref="/guide" />
      </div>
    </main>
  );
}
