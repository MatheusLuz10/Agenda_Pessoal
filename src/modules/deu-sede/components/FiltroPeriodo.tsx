import { Input } from "@/modules/deu-sede/components/ui/input";
import { Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { periodoDoAtalho, type Atalho, type Periodo } from "@/modules/deu-sede/domain/periodo";

/** Filtro de período (atalhos + datas), sempre numa linha acima do conteúdo. */
export function FiltroPeriodo({ valor, aoMudar, comHoje }: { valor: Periodo; aoMudar: (p: Periodo) => void; comHoje?: boolean }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Segmentado<Atalho>
        rotulo="Período"
        valor={valor.atalho}
        aoMudar={(a) => aoMudar(periodoDoAtalho(a, valor))}
        opcoes={[
          ...(comHoje ? [{ valor: "hoje" as Atalho, rotulo: "Hoje" }] : []),
          { valor: "mes", rotulo: "Este mês" },
          { valor: "mes_passado", rotulo: "Mês passado" },
          { valor: "90dias", rotulo: "90 dias" },
          { valor: "ano", rotulo: "Este ano" },
          { valor: "personalizado", rotulo: "Outro" },
        ]}
      />
      {valor.atalho === "personalizado" && (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="Data inicial" value={valor.de} max={valor.ate} onChange={(e) => aoMudar({ ...valor, de: e.target.value })} className="w-40" />
          <span className="text-sm text-texto-suave">até</span>
          <Input type="date" aria-label="Data final" value={valor.ate} min={valor.de} onChange={(e) => aoMudar({ ...valor, ate: e.target.value })} className="w-40" />
        </div>
      )}
    </div>
  );
}
