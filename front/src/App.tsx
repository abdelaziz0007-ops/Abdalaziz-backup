import { PreferencesProvider } from "@/state/PreferencesProvider";
import { DemoProvider } from "@/state/DemoProvider";
import { AppRoutes } from "@/routes/AppRoutes";
import { WorkbenchProvider } from '@/state/WorkbenchProvider';
import { PlanningProvider } from '@/state/PlanningProvider';

/** Root component: global display preferences + demo/workspace state + routes. */
export function App() {
  return (
    <PreferencesProvider>
      <DemoProvider>
        <PlanningProvider><WorkbenchProvider><AppRoutes /></WorkbenchProvider></PlanningProvider>
      </DemoProvider>
    </PreferencesProvider>
  );
}
