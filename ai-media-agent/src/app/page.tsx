import { HomeHeader } from "@/components/home/HomeHeader";
import { HeroSection } from "@/components/home/HeroSection";
import { FeatureGrid } from "@/components/home/FeatureGrid";
import { WorkflowSteps } from "@/components/home/WorkflowSteps";
import { HomeCta } from "@/components/home/HomeCta";
import { HomeFooter } from "@/components/home/HomeFooter";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <HomeHeader />
      <main className="flex-1">
        <HeroSection />
        <FeatureGrid />
        <WorkflowSteps />
        <HomeCta />
      </main>
      <HomeFooter />
    </div>
  );
}
