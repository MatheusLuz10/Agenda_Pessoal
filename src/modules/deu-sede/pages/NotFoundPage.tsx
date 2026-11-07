import { Link } from "react-router-dom";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { DEU_SEDE_BASE } from "@/modules/deu-sede/config/modules";

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Página não encontrada" description="O endereço acessado não existe no DEU SEDE!." />
      <Link to={DEU_SEDE_BASE} className="font-semibold text-marrom underline">
        Voltar ao painel
      </Link>
    </>
  );
}
