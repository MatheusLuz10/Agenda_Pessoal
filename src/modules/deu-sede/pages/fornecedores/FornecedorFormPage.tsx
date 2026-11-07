import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Card } from "@/modules/deu-sede/components/ui/card";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input, Interruptor, Textarea } from "@/modules/deu-sede/components/ui/input";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar } from "@/modules/deu-sede/data/cliente";
import { useCadastros, useEnvio } from "@/modules/deu-sede/data/hooks";
import type { Fornecedor } from "@/modules/deu-sede/data/tipos";
import {
  cnpjValido,
  emailValido,
  formatarCnpj,
  formatarTelefone,
  normalizarWhatsapp,
  somenteDigitos,
} from "@/modules/deu-sede/domain/formatos";

export function FornecedorFormPage() {
  const { id } = useParams();
  const { dados, erro, fornecedores } = useCadastros();
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const fornecedor = id ? fornecedores.get(id) : undefined;
  if (id && !fornecedor) return <Aviso tom="erro">Fornecedor não encontrado.</Aviso>;
  return <Formulario key={id ?? "novo"} fornecedor={fornecedor ?? null} />;
}

function Formulario({ fornecedor }: { fornecedor: Fornecedor | null }) {
  const navigate = useNavigate();
  const [v, setV] = useState({
    nome: fornecedor?.nome ?? "",
    vendedor: fornecedor?.vendedor ?? "",
    telefone: formatarTelefone(fornecedor?.telefone),
    whatsapp: formatarTelefone(fornecedor?.whatsapp),
    cnpj: formatarCnpj(fornecedor?.cnpj),
    email: fornecedor?.email ?? "",
    endereco: fornecedor?.endereco ?? "",
    condicoes_comerciais: fornecedor?.condicoes_comerciais ?? "",
    observacoes: fornecedor?.observacoes ?? "",
  });
  const [ativo, setAtivo] = useState(fornecedor?.ativo ?? true);
  const [erros, setErros] = useState<Record<string, string>>({});
  const { enviando, erro, enviar } = useEnvio();
  const campo = (k: keyof typeof v) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value })) });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const novos: Record<string, string> = {};
    const whatsapp = normalizarWhatsapp(v.whatsapp);
    const cnpj = somenteDigitos(v.cnpj);
    if (!v.nome.trim()) novos.nome = "Informe o nome da empresa.";
    if (whatsapp === "") novos.whatsapp = "Use DDD + número (10 ou 11 dígitos).";
    if (cnpj && !cnpjValido(cnpj)) novos.cnpj = "CNPJ inválido: confira os números.";
    if (!emailValido(v.email)) novos.email = "E-mail inválido.";
    setErros(novos);
    if (Object.keys(novos).length) return;
    const salvo = await enviar(() =>
      executar<Fornecedor>("salvar_fornecedor", {
        ...v,
        id: fornecedor?.id,
        whatsapp,
        cnpj: cnpj || null,
        telefone: somenteDigitos(v.telefone) || null,
        ativo,
      }),
    );
    if (salvo) navigate(rota("fornecedores", salvo.id), { replace: true });
  }

  return (
    <>
      <PageHeader title={fornecedor ? "Editar fornecedor" : "Novo fornecedor"} description={fornecedor?.nome} />
      <Card className="max-w-3xl">
        <form onSubmit={salvar} className="flex flex-col gap-4 p-4 sm:p-5" noValidate>
          <Campo rotulo="Nome da empresa" obrigatorio erro={erros.nome}>
            {(id) => <Input id={id} {...campo("nome")} autoFocus={!fornecedor} />}
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Vendedor ou representante">{(id) => <Input id={id} {...campo("vendedor")} />}</Campo>
            <Campo rotulo="CNPJ" erro={erros.cnpj}>
              {(id) => <Input id={id} inputMode="numeric" placeholder="00.000.000/0000-00" {...campo("cnpj")} />}
            </Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="WhatsApp" erro={erros.whatsapp} ajuda="Usado para enviar os pedidos.">
              {(id) => <Input id={id} type="tel" inputMode="tel" placeholder="(11) 99999-0000" {...campo("whatsapp")} />}
            </Campo>
            <Campo rotulo="Telefone">{(id) => <Input id={id} type="tel" inputMode="tel" {...campo("telefone")} />}</Campo>
          </div>
          <Campo rotulo="E-mail" erro={erros.email}>
            {(id) => <Input id={id} type="email" inputMode="email" {...campo("email")} />}
          </Campo>
          <Campo rotulo="Endereço">{(id) => <Input id={id} {...campo("endereco")} />}</Campo>
          <Campo rotulo="Condições comerciais" ajuda="Ex.: boleto 28 dias, pedido mínimo, frete grátis acima de R$ 1.000.">
            {(id) => <Textarea id={id} {...campo("condicoes_comerciais")} />}
          </Campo>
          <Campo rotulo="Observações">{(id) => <Textarea id={id} {...campo("observacoes")} />}</Campo>
          {fornecedor && <Interruptor ligado={ativo} aoMudar={setAtivo} rotulo="Fornecedor ativo" />}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <LinkBotao to={fornecedor ? rota("fornecedores", fornecedor.id) : rota("fornecedores")} variant="contorno">
              Cancelar
            </LinkBotao>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar fornecedor"}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
