import { requireAdmin } from "@/lib/auth";
import { getAutopilotState } from "@/lib/marketing/settings";
import { MARKETING_THEMES } from "@/lib/marketing/themes";

import { Card } from "../ui";
import { toggleAutopilotAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  await requireAdmin();
  const state = await getAutopilotState();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-title-2 text-vinho">Publicações automáticas</h1>
        <p className="mt-1 text-caption text-vinho/70">
          A publicidade roda de hora em hora com temas e públicos diferentes. Este botão desliga{" "}
          <strong>somente</strong> a publicidade — a prospecção de fornecedores continua.
        </p>
      </header>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-vinho">
              Autopilot: {state.enabled ? "ligado" : "desligado"}
            </p>
            {state.updatedAt !== null ? (
              <p className="mt-1 text-caption text-vinho/60">
                Atualizado em {state.updatedAt.slice(0, 10)}
              </p>
            ) : null}
          </div>
          <form action={toggleAutopilotAction}>
            <input type="hidden" name="enabled" value={state.enabled ? "false" : "true"} />
            <button
              type="submit"
              className={
                state.enabled
                  ? "rounded-full border border-vinho/20 px-5 py-2.5 text-sm font-semibold text-vinho"
                  : "rounded-full bg-primaria px-5 py-2.5 text-sm font-semibold text-white"
              }
            >
              {state.enabled ? "Desligar publicações automáticas" : "Ligar publicações automáticas"}
            </button>
          </form>
        </div>
      </Card>

      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-vinho/60">
          Temas da rotação (1 por hora)
        </p>
        <ul className="mt-3 space-y-2 text-sm text-vinho/80">
          {MARKETING_THEMES.map((theme) => (
            <li key={theme.key}>
              <strong className="text-vinho">{theme.label}</strong> · {theme.audience}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
