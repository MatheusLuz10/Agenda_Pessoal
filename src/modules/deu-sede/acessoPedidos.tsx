import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { AREA_PEDIDOS, INICIO_PEDIDOS, useSoPedidos } from "@/modules/deu-sede/soPedidos";

/** Envolve todas as rotas logadas: o login de pedidos só entra em /deu-sede/pedidos. */
export function TravaSoPedidos() {
  const so = useSoPedidos();
  const { pathname } = useLocation();
  if (so === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-fundo">
        <Carregando />
      </div>
    );
  }
  if (so && !AREA_PEDIDOS.test(pathname)) return <Navigate to={INICIO_PEDIDOS} replace />;
  return <Outlet />;
}
