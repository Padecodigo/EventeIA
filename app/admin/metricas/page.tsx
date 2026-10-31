import { requireAdmin } from "@/lib/auth";
import { countByDay, lastNDays, maxCount, shortDay, type DailyPoint } from "@/lib/analytics/pure";
import { loadAnalyticsSince } from "@/lib/analytics/query";

import { Card } from "../ui";

export const dynamic = "force-dynamic";

const WIDTH = 560;
const HEIGHT = 140;
const GAP = 4;

function Bars({ points, color }: { points: readonly DailyPoint[]; color: string }) {
  const max = maxCount(points);
  const barWidth = (WIDTH - GAP * (points.length - 1)) / Math.max(1, points.length);
  return (
    <svg viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT + 22)}`} className="w-full" role="img" aria-label="Gráfico de barras">
      {points.map((point, index) => {
        const height = Math.round((point.count / max) * HEIGHT);
        return (
          <g key={point.day}>
            <rect
              x={index * (barWidth + GAP)}
              y={HEIGHT - height}
              width={barWidth}
              height={Math.max(1, height)}
              rx={2}
              fill={color}
            />
            <text
              x={index * (barWidth + GAP) + barWidth / 2}
              y={HEIGHT + 14}
              textAnchor="middle"
              fontSize="8"
              fill="currentColor"
              className="text-vinho/60"
            >
              {shortDay(point.day).slice(0, 5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card>
      <p className="text-caption text-vinho/70">{label}</p>
      <p className="mt-2 font-serif text-display-2 text-vinho">{value}</p>
      {hint !== undefined ? <p className="mt-1 text-caption text-vinho/50">{hint}</p> : null}
    </Card>
  );
}

export default async function MetricasPage() {
  await requireAdmin();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const rows = await loadAnalyticsSince(since);

  const views = rows.filter((row) => row.event === "page_view");
  const logins = rows.filter((row) => row.event === "login");
  const signups = rows.filter((row) => row.event === "signup");
  const today = lastNDays(1, now)[0] ?? "";
  const viewsToday = views.filter((row) => row.created_at.slice(0, 10) === today).length;
  const uniqueVisitors = new Set(views.map((row) => row.session_id).filter((id): id is string => id !== null)).size;
  const views14 = countByDay(views, 14, now);
  const auth14 = countByDay([...logins, ...signups], 14, now);

  const byPath = new Map<string, number>();
  for (const row of views) {
    const path = row.path ?? "/";
    byPath.set(path, (byPath.get(path) ?? 0) + 1);
  }
  const topPaths = [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-title-2 text-vinho">Métricas do site</h1>
        <p className="mt-1 text-caption text-vinho/70">
          Últimos 30 dias · visitas, visitantes únicos, logins e cadastros. Atualiza a cada acesso.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Visitas (30d)" value={views.length} />
        <Stat label="Visitas hoje" value={viewsToday} />
        <Stat label="Visitantes únicos" value={uniqueVisitors} hint="por sessão do navegador" />
        <Stat label="Logins (30d)" value={logins.length} />
        <Stat label="Cadastros (30d)" value={signups.length} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-caption font-semibold uppercase tracking-wide text-vinho/60">Visitas por dia (14d)</p>
          <div className="mt-4 text-vinho">
            <Bars points={views14} color="var(--color-primaria, #F0A070)" />
          </div>
        </Card>
        <Card>
          <p className="text-caption font-semibold uppercase tracking-wide text-vinho/60">Logins + cadastros por dia (14d)</p>
          <div className="mt-4 text-vinho">
            <Bars points={auth14} color="var(--color-champagne, #F0A070)" />
          </div>
        </Card>
      </section>

      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-vinho/60">Páginas mais vistas (30d)</p>
        {topPaths.length === 0 ? (
          <p className="mt-3 text-sm text-vinho/60">Ainda sem visitas registradas.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-caption uppercase tracking-wide text-vinho/50">
                <th className="py-2">Página</th>
                <th className="py-2 text-right">Visitas</th>
              </tr>
            </thead>
            <tbody>
              {topPaths.map(([path, count]) => (
                <tr key={path} className="border-t border-line-subtle">
                  <td className="py-2 text-vinho/80">{path}</td>
                  <td className="py-2 text-right font-semibold text-vinho">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
