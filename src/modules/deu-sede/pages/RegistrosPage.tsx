import { useMemo, useState } from "react";
import { ChevronDown, ScrollText } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { CampoBusca } from "@/modules/deu-sede/components/ui/filtros";
import { Select } from "@/modules/deu-sede/components/ui/input";
import { FiltroPeriodo } from "@/modules/deu-sede/components/FiltroPeriodo";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import type { ListaRegistros, Registro } from "@/modules/deu-sede/data/tipos";
import { periodoDoAtalho, type Periodo } from "@/modules/deu-sede/domain/periodo";
import { contemBusca, dataBR, moeda } from "@/modules/deu-sede/domain/formatos";
import { cn } from "@/lib/utils";

const PAPEL: Record<string, string> = {
  admin: "Administrador",
  comprador: "Comprador",
  conferente: "Conferente",
  vendedor: "Vendedor",
  consulta: "Consulta",
  pedidos: "Só pedidos",
};

const AREAS: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Tudo" },
  { valor: "pedidos", rotulo: "Pedidos de compra" },
  { valor: "acesso", rotulo: "Entradas no sistema" },
  { valor: "cotacoes", rotulo: "Cotações" },
  { valor: "recebimentos", rotulo: "Recebimentos" },
];

// Registros (logs, migração 0017): o que cada login fez — produtos marcados
// e desmarcados no Montar pedido, quantidades e valores alterados, pedidos
// realizados, WhatsApp/PDF, entradas no sistema — junto com o histórico dos
// pedidos. Só admin e comprador veem.
export function RegistrosPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("hoje"));
  const [usuario, setUsuario] = useState("");
  const [area, setArea] = useState("");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<number | string>>(new Set());
  const { dados, erro } = useConsulta<ListaRegistros>("listar_atividades", {
    de: periodo.de,
    ate: periodo.ate,
    usuario_id: usuario || undefined,
    area: area || undefined,
  });

  const lista = useMemo(
    () => (dados?.registros ?? []).filter((r) => contemBusca(busca, r.descricao, r.usuario_nome, JSON.stringify(r.detalhes))),
    [dados, busca],
  );
  // separados por dia
  const dias = useMemo(() => {
    const m = new Map<string, Registro[]>();
    for (const r of lista) {
      const d = diaLocal(r.quando);
      m.set(d, [...(m.get(d) ?? []), r]);
    }
    return [...m.entries()];
  }, [lista]);

  return (
    <>
      <PageHeader
        title="Registros (logs)"
        description="O que cada login fez: produtos marcados e desmarcados no Montar pedido, quantidades e valores, pedidos realizados, WhatsApp, PDF e entradas no sistema."
      />
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-2">
        <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} comHoje />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[14rem_14rem_minmax(0,1fr)]">
          <Select value={usuario} onChange={(e) => setUsuario(e.target.value)} aria-label="Usuário">
            <option value="">Todos os usuários</option>
            {(dados?.usuarios ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({PAPEL[u.papel] ?? u.papel})
              </option>
            ))}
          </Select>
          <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
            {AREAS.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.rotulo}
              </option>
            ))}
          </Select>
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Pesquisar (produto, pedido, ação…)" />
        </div>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && lista.length === 0 && (
        <Vazio icone={ScrollText} titulo="Nenhum registro">
          Mude o período ou os filtros.
        </Vazio>
      )}
      {dados && lista.length > 0 && (
        <div className="grid gap-4">
          <p className="text-sm text-texto-suave">
            {lista.length} {lista.length === 1 ? "registro" : "registros"}
            {dados.registros.length >= 1000 && " (mostrando os 1.000 mais recentes; diminua o período para ver o resto)"}
          </p>
          {dias.map(([dia, regs]) => (
            <section key={dia} className="overflow-hidden rounded-xl border border-linha bg-superficie" aria-label={`Registros de ${dataBR(dia)}`}>
              <h2 className="border-b border-linha bg-fundo px-3 py-2 text-sm font-semibold text-verde">{dataBR(dia)}</h2>
              <ul className="divide-y divide-linha">
                {regs.map((r) => {
                  const chave = `${r.origem}-${r.ordem}`;
                  const temDetalhes = Object.keys(r.detalhes ?? {}).length > 0 && r.origem === "app";
                  const aberto = abertos.has(chave);
                  return (
                    <li key={chave}>
                      <button
                        type="button"
                        disabled={!temDetalhes}
                        aria-expanded={temDetalhes ? aberto : undefined}
                        onClick={() =>
                          setAbertos((s) => {
                            const n = new Set(s);
                            if (n.has(chave)) n.delete(chave);
                            else n.add(chave);
                            return n;
                          })
                        }
                        className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm disabled:cursor-default"
                      >
                        <span className="w-16 shrink-0 pt-0.5 text-xs text-texto-suave tabular-nums">{horaLocal(r.quando)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-verde">{r.descricao}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-texto-suave">
                            {r.usuario_nome ?? "—"}
                            {r.papel && <Badge tone={r.papel === "pedidos" ? "amarelo" : "neutro"}>{PAPEL[r.papel] ?? r.papel}</Badge>}
                            {r.origem === "historico" && <span>· histórico</span>}
                          </span>
                        </span>
                        {temDetalhes && <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-texto-suave transition-transform", aberto && "rotate-180")} />}
                      </button>
                      {temDetalhes && aberto && <Detalhes detalhes={r.detalhes} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const ROTULO_CAMPO: Record<string, string> = {
  produto: "Produto",
  produtos: "Produtos",
  quantidade: "Quantidade",
  valor: "Valor",
  total: "Total",
  fornecedor: "Fornecedor",
  pedido: "Pedido",
  pagamento: "Pagamento",
  conta_a_pagar: "Conta a pagar",
  observacoes: "Observações",
  itens: "Itens",
  de: "De",
  para: "Para",
  busca: "Busca",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

// detalhes da ação, sem os ids internos
function Detalhes({ detalhes }: { detalhes: Record<string, unknown> }) {
  const campos = Object.entries(detalhes).filter(([k, v]) => !k.endsWith("_id") && v !== null && v !== undefined && v !== "");
  return (
    <dl className="grid gap-1.5 border-t border-linha/60 bg-fundo px-3 py-2 text-xs sm:pl-22">
      {campos.map(([k, v]) => (
        <div key={k} className="grid gap-0.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-2">
          <dt className="font-semibold text-texto-suave">{ROTULO_CAMPO[k] ?? k}</dt>
          <dd className="min-w-0 break-words text-verde">{valorLegivel(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function valorLegivel(campo: string, v: unknown): React.ReactNode {
  if (campo === "total" && typeof v === "number") return moeda(v);
  if (campo === "pagamento" && v && typeof v === "object") {
    const p = v as { forma?: string; parcelas?: number; primeiro_vencimento?: string };
    return p.forma === "a_vista" ? "À vista" : `Parcelado em ${p.parcelas}x (1ª em ${dataBR(p.primeiro_vencimento)})`;
  }
  if (campo === "itens" && Array.isArray(v)) {
    return (
      <ul className="grid gap-0.5">
        {v.map((it, i) => {
          const x = it as { produto?: string; quantidade?: number; valor?: number; total?: number };
          return (
            <li key={i}>
              {x.quantidade ?? "?"} × {x.produto ?? "—"} · {moeda(x.valor)} = <strong>{moeda(x.total)}</strong>
            </li>
          );
        })}
      </ul>
    );
  }
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
