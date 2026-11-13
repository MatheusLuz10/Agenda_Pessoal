import { Navigate, Route } from "react-router-dom";
import { DeuSedeLayout } from "@/modules/deu-sede/components/DeuSedeLayout";
import { DEU_SEDE_BASE, rota } from "@/modules/deu-sede/config/modules";
import { telaSobDemanda } from "@/lib/telaSobDemanda";

// Cada tela é baixada só quando é aberta (ver src/lib/telaSobDemanda.tsx).
const DashboardPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/DashboardPage"), "DashboardPage");
const NotFoundPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/NotFoundPage"), "NotFoundPage");
const SettingsPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/SettingsPage"), "SettingsPage");
const ProdutosPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/produtos/ProdutosPage"), "ProdutosPage");
const ProdutoFormPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/produtos/ProdutoFormPage"), "ProdutoFormPage");
const ProdutoDetalhePage = telaSobDemanda(() => import("@/modules/deu-sede/pages/produtos/ProdutoDetalhePage"), "ProdutoDetalhePage");
const FornecedoresPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/fornecedores/FornecedoresPage"), "FornecedoresPage");
const FornecedorFormPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/fornecedores/FornecedorFormPage"), "FornecedorFormPage");
const FornecedorDetalhePage = telaSobDemanda(() => import("@/modules/deu-sede/pages/fornecedores/FornecedorDetalhePage"), "FornecedorDetalhePage");
const PedidosPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/pedidos/PedidosPage"), "PedidosPage");
const PedidoSimplesPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/pedidos/PedidoSimplesPage"), "PedidoSimplesPage");
const PedidoDetalhePage = telaSobDemanda(() => import("@/modules/deu-sede/pages/pedidos/PedidoDetalhePage"), "PedidoDetalhePage");
const RecebimentosPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/recebimentos/RecebimentosPage"), "RecebimentosPage");
const RegistrarRecebimentoPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/recebimentos/RegistrarRecebimentoPage"), "RegistrarRecebimentoPage");
const EstoquePage = telaSobDemanda(() => import("@/modules/deu-sede/pages/estoque/EstoquePage"), "EstoquePage");
const EntradaNotaPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/estoque/EntradaNotaPage"), "EntradaNotaPage");
const RelatoriosPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/RelatoriosPage"), "RelatoriosPage");
const ContasPagarPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/financeiro/ContasPagarPage"), "ContasPagarPage");
const RegistrosPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/RegistrosPage"), "RegistrosPage");

// Rotas da seção DEU SEDE!. Entram no App.tsx dentro do
// <RequireAuth />, então valem as mesmas regras de login do app
// (sem .env.local = modo de teste local, sem login).
export const deuSedeRoutes = (
  <Route path={DEU_SEDE_BASE} element={<DeuSedeLayout />}>
    <Route index element={<DashboardPage />} />
    <Route path="produtos" element={<ProdutosPage />} />
    <Route path="produtos/novo" element={<ProdutoFormPage />} />
    <Route path="produtos/:id" element={<ProdutoDetalhePage />} />
    <Route path="produtos/:id/editar" element={<ProdutoFormPage />} />
    <Route path="fornecedores" element={<FornecedoresPage />} />
    <Route path="fornecedores/novo" element={<FornecedorFormPage />} />
    <Route path="fornecedores/:id" element={<FornecedorDetalhePage />} />
    <Route path="fornecedores/:id/editar" element={<FornecedorFormPage />} />
    {/* Cotações e Comparação de preços saíram do app (migração 0020): links antigos vão para o Montar pedido */}
    <Route path="cotacoes/*" element={<Navigate to={rota("pedidos", "montar")} replace />} />
    <Route path="comparacao" element={<Navigate to={rota("pedidos", "montar")} replace />} />
    <Route path="pedidos" element={<PedidosPage />} />
    <Route path="pedidos/montar" element={<PedidoSimplesPage />} />
    <Route path="pedidos/montar-comparacao" element={<Navigate to={rota("pedidos", "montar")} replace />} />
    <Route path="pedidos/:id" element={<PedidoDetalhePage />} />
    <Route path="recebimentos" element={<RecebimentosPage />} />
    <Route path="recebimentos/novo/:pedidoId" element={<RegistrarRecebimentoPage />} />
    <Route path="pdv" element={<Navigate to="/pdv" replace />} />
    <Route path="estoque" element={<EstoquePage />} />
    <Route path="estoque/entrada" element={<EntradaNotaPage />} />
    <Route path="contas" element={<ContasPagarPage />} />
    <Route path="relatorios" element={<RelatoriosPage />} />
    <Route path="configuracoes" element={<SettingsPage />} />
    <Route path="registros" element={<RegistrosPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Route>
);
