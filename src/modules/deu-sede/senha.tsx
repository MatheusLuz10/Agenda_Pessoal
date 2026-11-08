import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Delete, Lock } from "lucide-react";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Campo, Input } from "@/modules/deu-sede/components/ui/input";
import { chamar, executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import type { Acesso } from "@/modules/deu-sede/data/tipos";
import { useSoPedidos } from "@/modules/deu-sede/soPedidos";
import { cn } from "@/lib/utils";

// Senha de 4 dígitos das áreas sensíveis (um app só: o caixa usa o PDV e
// as áreas protegidas pedem a senha). Depois de digitada, as áreas ficam
// liberadas por 10 minutos sem uso (ou até "Bloquear").
// É uma trava de tela para uso compartilhado; quem pode o quê no banco
// continua definido pelo nível de acesso de cada login.

export type AreaSensivel =
  | "deu-sede"
  | "painel"
  | "fornecedores"
  | "cotacoes"
  | "comparacao"
  | "pedidos"
  | "relatorios"
  | "configuracoes"
  | "produtos_editar"
  | "estoque_ajuste"
  | "cancelar_venda"
  | "pdv_desconto"
  | "estoque"
  | "recebimentos"
  | "produtos"
  | "pdv";

const AREAS: { area: AreaSensivel; rotulo: string }[] = [
  { area: "deu-sede", rotulo: "DEU SEDE! (entrada)" },
  { area: "painel", rotulo: "Painel inicial (valores)" },
  { area: "pdv", rotulo: "PDV (vender)" },
  { area: "pdv_desconto", rotulo: "Desconto e preço manual no PDV" },
  { area: "cancelar_venda", rotulo: "Cancelar venda" },
  { area: "produtos", rotulo: "Produtos (consulta)" },
  { area: "produtos_editar", rotulo: "Cadastrar/editar produtos e preços" },
  { area: "estoque", rotulo: "Estoque (consulta e entrada por nota)" },
  { area: "estoque_ajuste", rotulo: "Saídas e ajustes de estoque" },
  { area: "recebimentos", rotulo: "Recebimentos" },
  { area: "fornecedores", rotulo: "Fornecedores" },
  { area: "cotacoes", rotulo: "Cotações" },
  { area: "comparacao", rotulo: "Comparação de preços" },
  { area: "pedidos", rotulo: "Pedidos de compra" },
  { area: "relatorios", rotulo: "Relatórios" },
  { area: "configuracoes", rotulo: "Configurações (sempre protegida)" },
];

interface ConfigSenha {
  definida: boolean;
  areas: AreaSensivel[];
}

const DURACAO_MS = 10 * 60 * 1000;
const CHAVE = "deusede:desbloqueado-ate";

function lerAte(): number {
  try {
    return Number(sessionStorage.getItem(CHAVE)) || 0;
  } catch {
    return 0;
  }
}
function gravarAte(v: number) {
  try {
    if (v) sessionStorage.setItem(CHAVE, String(v));
    else sessionStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento: vale enquanto a página estiver aberta */
  }
}

interface ContextoSenha {
  config: ConfigSenha | undefined;
  erroConfig: string | undefined;
  desbloqueado: boolean;
  protegida: (area: AreaSensivel) => boolean;
  liberada: (area: AreaSensivel) => boolean;
  desbloquear: (pin: string) => Promise<boolean>;
  bloquear: () => void;
  renovar: () => void;
  /** Para ações: resolve true se liberado (pede a senha se precisar). */
  pedirSenha: (area: AreaSensivel) => Promise<boolean>;
}

const Contexto = createContext<ContextoSenha | null>(null);

export function SenhaProvider({ children }: { children: ReactNode }) {
  const { dados: config, erro: erroConfig } = useConsulta<ConfigSenha | null>("config_senha");
  const [ate, setAte] = useState(lerAte);
  const [agora, setAgora] = useState(() => Date.now());
  const [pedido, setPedido] = useState<{ area: AreaSensivel; resolver: (ok: boolean) => void } | null>(null);

  // relógio de 15 s para expirar a liberação
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const desbloqueado = ate > agora;
  const cfg = config ?? undefined;
  const protegida = useCallback((area: AreaSensivel) => area === "deu-sede" || (!!cfg && (cfg.areas.includes(area) || area === "configuracoes")), [cfg]);
  const liberada = useCallback((area: AreaSensivel) => !protegida(area) || (!!cfg?.definida && desbloqueado), [protegida, cfg, desbloqueado]);

  const renovar = useCallback(() => {
    const novo = Date.now() + DURACAO_MS;
    gravarAte(novo);
    setAte(novo);
    setAgora(Date.now());
  }, []);

  const desbloquear = useCallback(
    async (pin: string) => {
      const r = await chamar<{ ok: boolean }>("verificar_senha", { pin });
      if (r.ok) renovar();
      return r.ok;
    },
    [renovar],
  );

  const bloquear = useCallback(() => {
    gravarAte(0);
    setAte(0);
  }, []);

  const pedirSenha = useCallback(
    (area: AreaSensivel) => {
      if (liberada(area)) {
        if (protegida(area)) renovar();
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolver) => setPedido({ area, resolver }));
    },
    [liberada, protegida, renovar],
  );

  return (
    <Contexto.Provider value={{ config: cfg, erroConfig, desbloqueado: desbloqueado && !!cfg?.definida, protegida, liberada, desbloquear, bloquear, renovar, pedirSenha }}>
      {children}
      {pedido && (
        <Dialogo
          aberto
          titulo="Área protegida"
          aoFechar={() => {
            pedido.resolver(false);
            setPedido(null);
          }}
        >
          <EntradaSenha
            area={pedido.area}
            aoLiberar={() => {
              pedido.resolver(true);
              setPedido(null);
            }}
          />
        </Dialogo>
      )}
    </Contexto.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSenha() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useSenha precisa estar dentro de <SenhaProvider>");
  return c;
}

/** Tela inteira protegida: mostra a senha antes do conteúdo. */
export function AreaProtegida({ area, children }: { area: AreaSensivel; children: ReactNode }) {
  const { config, erroConfig, liberada, protegida, renovar } = useSenha();
  // o login de pedidos já entrou com a própria senha e só vê a área de pedidos
  const soPedidos = useSoPedidos();
  const ok = !!config && liberada(area);
  useEffect(() => {
    if (ok && protegida(area)) renovar();
  }, [ok, area, protegida, renovar]);
  if (soPedidos) return <>{children}</>;
  if (erroConfig) return <Aviso tom="erro">{erroConfig}</Aviso>;
  if (config === undefined) return <Carregando texto="Verificando senha…" />;
  if (!config) return <Aviso tom="erro">Não foi possível carregar as configurações de senha.</Aviso>;
  if (ok) return <>{children}</>;
  const rotulo = AREAS.find((a) => a.area === area)?.rotulo ?? "Área protegida";
  return (
    <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-linha bg-superficie p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-verde text-amarelo">
        <Lock className="size-6" />
      </span>
      <div>
        <h1 className="text-xl font-bold text-verde">{rotulo}</h1>
        <p className="text-sm text-texto-suave">Área protegida por senha.</p>
      </div>
      <EntradaSenha area={area} />
    </div>
  );
}

/** Teclado de 4 dígitos (também aceita o teclado do computador). */
function EntradaSenha({ area, aoLiberar }: { area: AreaSensivel; aoLiberar?: () => void }) {
  const { config, desbloquear } = useSenha();
  const { dados: acesso } = useConsulta<Acesso | null>("meu_acesso");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [tentativas, setTentativas] = useState(0);
  const [bloqueadoAte, setBloqueadoAte] = useState(0);
  const [verificando, setVerificando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => campo.current?.focus(), []);

  if (config && !config.definida) return <CriarSenha aoCriar={aoLiberar} admin={acesso?.papel === "admin"} />;

  async function conferir(valor: string) {
    if (Date.now() < bloqueadoAte) return;
    setVerificando(true);
    try {
      const ok = await desbloquear(valor);
      if (ok) {
        setErro(null);
        aoLiberar?.();
        return;
      }
      const n = tentativas + 1;
      setTentativas(n);
      if (n % 5 === 0) {
        setBloqueadoAte(Date.now() + 30000);
        setErro("Muitas tentativas. Aguarde 30 segundos.");
      } else setErro("Senha incorreta.");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setVerificando(false);
      setPin("");
      campo.current?.focus();
    }
  }

  function digitar(d: string) {
    if (verificando) return;
    const novo = (pin + d).slice(0, 4);
    setPin(novo);
    if (novo.length === 4) void conferir(novo);
  }

  return (
    <div className="flex w-full flex-col items-center gap-4" data-area={area}>
      <input
        ref={campo}
        aria-label="Senha de 4 dígitos"
        inputMode="numeric"
        autoComplete="off"
        type="password"
        maxLength={4}
        value={pin}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
          setPin(v);
          if (v.length === 4) void conferir(v);
        }}
        className="sr-only"
      />
      <div className="flex gap-3" aria-hidden onClick={() => campo.current?.focus()}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("size-4 rounded-full border-2 border-verde", i < pin.length && "bg-verde")} />
        ))}
      </div>
      {erro && <p className="text-sm font-medium text-perigo">{erro}</p>}
      <div className="grid w-full max-w-64 grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <TeclaSenha key={d} onClick={() => digitar(d)}>
            {d}
          </TeclaSenha>
        ))}
        <span />
        <TeclaSenha onClick={() => digitar("0")}>0</TeclaSenha>
        <TeclaSenha aria-label="Apagar" onClick={() => setPin((p) => p.slice(0, -1))}>
          <Delete className="size-5" />
        </TeclaSenha>
      </div>
    </div>
  );
}

function TeclaSenha({ children, onClick, ...rest }: { children: ReactNode; onClick: () => void; "aria-label"?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 items-center justify-center rounded-xl bg-offwhite text-xl font-bold text-verde hover:bg-amarelo/30 active:bg-amarelo"
      {...rest}
    >
      {children}
    </button>
  );
}

function CriarSenha({ aoCriar, admin }: { aoCriar?: () => void; admin: boolean }) {
  const { renovar } = useSenha();
  const [nova, setNova] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (!admin) return <Aviso tom="atencao">A senha das áreas sensíveis ainda não foi criada. Peça ao administrador.</Aviso>;

  async function criar() {
    if (!/^\d{4}$/.test(nova)) return setErro("A senha deve ter exatamente 4 números.");
    if (nova !== repetir) return setErro("As duas senhas não são iguais.");
    setSalvando(true);
    try {
      await executar("salvar_seguranca", { pin_novo: nova });
      renovar();
      aoCriar?.();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <p className="text-sm text-texto">Crie a senha de 4 números que vai proteger as áreas sensíveis.</p>
      <Campo rotulo="Nova senha (4 números)">
        {(id) => <Input id={id} type="password" inputMode="numeric" maxLength={4} value={nova} onChange={(e) => setNova(e.target.value.replace(/\D/g, ""))} />}
      </Campo>
      <Campo rotulo="Repita a senha">
        {(id) => <Input id={id} type="password" inputMode="numeric" maxLength={4} value={repetir} onChange={(e) => setRepetir(e.target.value.replace(/\D/g, ""))} />}
      </Campo>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Button onClick={criar} disabled={salvando}>
        Criar senha
      </Button>
    </div>
  );
}
