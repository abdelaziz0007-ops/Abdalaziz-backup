import { Link } from "react-router-dom";
import { useCopy } from "@/lib/hooks";
import { Card } from "@/components/ui/Card";

export function NotFoundPage() {
  const t = useCopy();
  return (
    <div className="stack">
      <h1>{t("routes.notFound.title")}</h1>
      <Card>
        <p>
          <Link to="/app/overview">{t("guard.backToOverview")}</Link>
        </p>
      </Card>
    </div>
  );
}
