import { useState } from "react";
import { Database, FlaskConical, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input } from "@/modules/deu-sede/components/ui/input";
import { Confirmar, Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Secao } from "@/modules/deu-sede/components/ui/secao";
import { useSessaoDeuSede } from "@/modules/deu-sede/sessao";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros, useEnvio } from "@/modules/deu-sede/data/hooks";
import { apagarBancoLocal } from "@/modules/deu-sede/data/bancoLocal";
import type { Acesso, Categoria, Empresa } from "@/modules/deu-sede/data/tipos";
import { cnpjValido, formatarCnpj, formatarTelefone, somenteDigitos } from "@/modules/deu-sede/domain/formatos";

const PAPEIS: Record<string, string> = {
  admin: "Administrador",
  comprador: "Comprador",
  conferente: "Conferente",
  vendedor: "Vendedor",
  consulta: "Consulta",
  pedidos: "Só pedidos de compra",
};

export function SettingsPage() {
  const { mode, userLabel, signOut } = useSessaoDeuSede();
  const acesso = useConsulta<Acesso | null>("meu_acesso");
  const empresa = useConsulta<Empresa | null>("empresa");
  const local = mode === "local";
  const [apagar, setApagar] = useState(false);

  return (
    <>
      <PageHeader title="Configurações" description="Empresa, categorias, acesso e dados de teste." />
      <div className="grid max-w-3xl gap-5">
        <Secao
          titulo={local ? "Modo de teste local" : "Conectado ao banco de dados"}
          acoes={<Badge tone={local ? "amarelo" : "verde"}>{local ? "Local" : "Supabase"}</Badge>}
        >
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-offwhite text-marrom">
              {local ? <FlaskConical className="size-6" /> : <Database className="size-6" />}
            </span>
            <div className="min-w-0 text-sm">
              <p className="text-texto">
                {local
                  ? "Sem login. Os dados ficam salvos só neste navegador, num banco igual ao do Supabase."
                  : `Sessão: ${userLabel}`}
              </p>
              {acesso.dados && <p className="text-texto-suave">Nível de acesso: {PAPEIS[acesso.dados.papel] ?? acesso.dados.papel}</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {local ? (
              <Button variant="contorno" className="text-perigo" onClick={() => setApagar(true)}>
                <Trash2 className="size-4" /> Apagar dados de teste deste navegador
              </Button>
            ) : (
              <Button variant="contorno" onClick={() => signOut()}>
                <LogOut className="size-4" /> Sair
              </Button>
            )}
          </div>
        </Secao>

        {empresa.dados === undefined ? <Carregando /> : <DadosEmpresa key={JSON.stringify(empresa.dados)} empresa={empresa.dados} editavel={acesso.dados?.papel === "admin"} />}

        <Categorias />

        <Secao titulo="Usuários e níveis de acesso">
          <div className="flex flex-col gap-2 text-sm text-texto">
            <p>Níveis: Administrador (tudo), Comprador (cadastros, pedidos e recebimentos), Conferente (consulta e recebimentos) e Consulta (só leitura).</p>
            <p className="text-texto-suave">
              Ter login na Agenda não dá acesso ao DEU SEDE!. Para liberar alguém, o administrador cria o perfil no Supabase (SQL Editor):
            </p>
            <pre className="overflow-x-auto rounded-xl bg-offwhite/60 p-3 text-xs text-verde">
              {`insert into deusede.perfis (id, nome, papel)\nselect id, 'Nome da pessoa', 'comprador'\nfrom auth.users where email = 'pessoa@exemplo.com';`}
            </pre>
          </div>
        </Secao>
      </div>

      <Confirmar
        aberto={apagar}
        titulo="Apagar os dados de teste?"
        mensagem="Todos os produtos, fornecedores, pedidos e recebimentos cadastrados NESTE navegador serão apagados. Não afeta o banco do Supabase."
        perigo
        textoConfirmar="Apagar tudo"
        aoFechar={() => setApagar(false)}
        aoConfirmar={async () => {
          await apagarBancoLocal();
          window.location.reload();
        }}
      />
    </>
  );
}

function DadosEmpresa({ empresa, editavel }: { empresa: Empresa | null; editavel: boolean }) {
  const [v, setV] = useState({
    nome: empresa?.nome ?? "DEU SEDE!",
    cnpj: formatarCnpj(empresa?.cnpj),
    telefone: formatarTelefone(empresa?.telefone),
    email: empresa?.email ?? "",
    endereco: empresa?.endereco ?? "",
  });
  const [salvo, setSalvo] = useState(false);
  const { enviando, erro, setErro, enviar } = useEnvio();
  const campo = (k: keyof typeof v) => ({
    value: v[k],
    disabled: !editavel,
    onChange: (e: { target: { value: string } }) => {
      setSalvo(false);
      setV((x) => ({ ...x, [k]: e.target.value }));
    },
  });

  async function salvar() {
    if (v.cnpj && !cnpjValido(v.cnpj)) return setErro("CNPJ inválido.");
    const ok = await enviar(() =>
      executar("salvar_empresa", { ...v, cnpj: somenteDigitos(v.cnpj) || null, telefone: somenteDigitos(v.telefone) || null }),
    );
    if (ok) setSalvo(true);
  }

  return (
    <Secao titulo="Dados da empresa" descricao="Aparecem no cabeçalho dos relatórios em PDF/Excel e nas mensagens de pedido.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" className="sm:col-span-2">{(id) => <Input id={id} {...campo("nome")} />}</Campo>
        <Campo rotulo="CNPJ">{(id) => <Input id={id} inputMode="numeric" {...campo("cnpj")} />}</Campo>
        <Campo rotulo="Telefone">{(id) => <Input id={id} type="tel" {...campo("telefone")} />}</Campo>
        <Campo rotulo="E-mail">{(id) => <Input id={id} type="email" {...campo("email")} />}</Campo>
        <Campo rotulo="Endereço">{(id) => <Input id={id} {...campo("endereco")} />}</Campo>
      </div>
      {erro && <Aviso tom="erro" className="mt-3">{erro}</Aviso>}
      {salvo && <Aviso tom="sucesso" className="mt-3">Dados da empresa salvos.</Aviso>}
      {editavel ? (
        <div className="mt-3 flex justify-end">
          <Button onClick={salvar} disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar dados da empresa"}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-texto-suave">Só o administrador altera estes dados.</p>
      )}
    </Secao>
  );
}

function Categorias() {
  const { dados, produtos } = useCadastros();
  const [editando, setEditando] = useState<Categoria | "nova" | null>(null);
  const [nome, setNome] = useState("");
  const { enviando, erro, setErro, enviar } = useEnvio();

  function abrir(c: Categoria | "nova") {
    setEditando(c);
    setNome(c === "nova" ? "" : c.nome);
    setErro(null);
  }

  async function salvar() {
    if (!nome.trim()) return setErro("Informe o nome da categoria.");
    const ok = await enviar(() => executar("salvar_categoria", { id: editando === "nova" ? undefined : editando?.id, nome }));
    if (ok) setEditando(null);
  }

  const usos = (id: string) => [...produtos.values()].filter((p) => p.categoria_id === id).length;

  return (
    <Secao
      titulo="Categorias de produtos"
      acoes={
        <Button size="sm" onClick={() => abrir("nova")}>
          <Plus className="size-4" /> Nova categoria
        </Button>
      }
      semPadding
    >
      <ul className="divide-y divide-linha">
        {(dados?.categorias ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2">
            <span className={c.ativo ? "text-sm font-medium text-verde" : "text-sm text-texto-suave line-through"}>
              {c.nome} <span className="font-normal text-texto-suave no-underline">· {usos(c.id)} produto(s)</span>
            </span>
            <span className="flex gap-1">
              <Button size="sm" variant="fantasma" onClick={() => abrir(c)} aria-label={`Renomear ${c.nome}`}>
                <Pencil className="size-4" />
              </Button>
              <Button size="sm" variant="fantasma" onClick={() => executar("definir_ativo", { tabela: "categorias", id: c.id, ativo: !c.ativo })}>
                {c.ativo ? "Desativar" : "Reativar"}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <Dialogo
        aberto={editando !== null}
        titulo={editando === "nova" ? "Nova categoria" : "Renomear categoria"}
        aoFechar={() => setEditando(null)}
        rodape={
          <>
            <Button variant="contorno" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button data-principal onClick={salvar} disabled={enviando}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Campo rotulo="Nome" obrigatorio>{(id) => <Input id={id} value={nome} onChange={(e) => setNome(e.target.value)} />}</Campo>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      </Dialogo>
    </Secao>
  );
}
