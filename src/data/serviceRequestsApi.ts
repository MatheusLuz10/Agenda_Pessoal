import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/imageCompression";
import type { ServiceRequest, ServiceRequestLookup, ServiceRequestStatus } from "@/types";

// Camada de acesso ao Supabase de Solicitações de Serviços — mesmo
// padrão de src/data/*Api.ts, mas com um detalhe único no app inteiro:
// as funções de CRIAÇÃO (usadas pela página pública, sem login) nunca
// dependem de `.select()` depois do insert, porque o visitante anônimo
// não tem permissão de leitura (ver policies no schema.sql) — só de
// inserir. O id é gerado no cliente antes, então nada precisa "voltar"
// do servidor pra continuar o fluxo (ex: anexar fotos à solicitação).

const PHOTOS_BUCKET = "service-request-photos";

interface ServiceRequestPhotoRow {
  id: string;
  request_id: string;
  photo_url: string;
}

interface ServiceRequestRow {
  id: string;
  request_number: string;
  client_name: string;
  company: string | null;
  phone: string;
  address: string;
  service_type: string;
  description: string;
  status: ServiceRequestStatus;
  observations: string | null;
  created_at: string;
  service_request_photos: ServiceRequestPhotoRow[];
}

function rowToServiceRequest(row: ServiceRequestRow): ServiceRequest {
  return {
    id: row.id,
    requestNumber: row.request_number,
    clientName: row.client_name,
    company: row.company,
    phone: row.phone,
    address: row.address,
    serviceType: row.service_type,
    description: row.description,
    status: row.status,
    observations: row.observations,
    photos: row.service_request_photos.map((photo) => ({ id: photo.id, url: photo.photo_url })),
    createdAt: row.created_at,
  };
}

// --- Área privada (autenticada) ---

export async function fetchServiceRequests(): Promise<ServiceRequest[]> {
  const { data, error } = await supabase!
    .from("service_requests")
    .select("*, service_request_photos(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ServiceRequestRow[]).map(rowToServiceRequest);
}

export async function updateServiceRequestStatus(id: string, status: ServiceRequestStatus): Promise<void> {
  const { error } = await supabase!.from("service_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function updateServiceRequestObservations(id: string, observations: string): Promise<void> {
  const { error } = await supabase!
    .from("service_requests")
    .update({ observations: observations.trim() || null })
    .eq("id", id);
  if (error) throw error;
}

// Apaga os arquivos do Storage primeiro — o "on delete cascade" da
// tabela só remove as linhas do Postgres, não os arquivos reais no
// Storage, que ficariam órfãos se não fossem removidos aqui.
export async function removeServiceRequest(id: string, photoUrls: string[]): Promise<void> {
  const marker = `/${PHOTOS_BUCKET}/`;
  const paths = photoUrls
    .map((url) => {
      const index = url.indexOf(marker);
      return index === -1 ? null : url.slice(index + marker.length);
    })
    .filter((path): path is string => path !== null);
  if (paths.length > 0) {
    await supabase!.storage.from(PHOTOS_BUCKET).remove(paths);
  }

  const { error } = await supabase!.from("service_requests").delete().eq("id", id);
  if (error) throw error;
}

// --- Página pública (sem login) ---

export interface NewServiceRequestInput {
  clientName: string;
  company: string;
  phone: string;
  address: string;
  serviceType: string;
  description: string;
}

// Gera o id no cliente (em vez de deixar o banco gerar e devolver via
// `.select()`) porque o visitante anônimo não tem permissão de leitura
// — só de inserir. Assim o fluxo de anexar fotos na sequência já sabe
// o request_id sem precisar de nenhuma resposta de volta do insert.
export async function createServiceRequest(input: NewServiceRequestInput): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await supabase!.from("service_requests").insert({
    id,
    client_name: input.clientName.trim(),
    company: input.company.trim() || null,
    phone: input.phone.trim(),
    address: input.address.trim(),
    service_type: input.serviceType,
    description: input.description.trim(),
    status: "nova",
  });
  if (error) throw error;
  return id;
}

// Devolve o código de acompanhamento (request_number, gerado pelo
// trigger no insert) pra mostrar ao cliente logo após enviar — via RPC
// security definer, porque o visitante anônimo não tem permissão de
// SELECT direto na tabela (ver get_service_request_number no schema.sql).
export async function getServiceRequestNumber(id: string): Promise<string | null> {
  const { data, error } = await supabase!.rpc("get_service_request_number", { p_id: id });
  if (error) throw error;
  return (data as string | null) ?? null;
}

// Consulta pública de andamento: o cliente informa o código
// (request_number) e recebe só os campos relevantes pro status, via RPC
// security definer (ver lookup_service_request no schema.sql) — não
// existe policy de SELECT pra anon na tabela, então isso nunca expõe as
// solicitações de outros clientes.
export async function lookupServiceRequest(requestNumber: string): Promise<ServiceRequestLookup | null> {
  const { data, error } = await supabase!.rpc("lookup_service_request", {
    p_request_number: requestNumber.trim(),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        request_number: string;
        service_type: string;
        status: ServiceRequestStatus;
        description: string;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    requestNumber: row.request_number,
    serviceType: row.service_type,
    status: row.status,
    description: row.description,
    createdAt: row.created_at,
  };
}

// Comprime a imagem no navegador antes de subir (ver lib/imageCompression)
// — fotos de celular costumam vir com vários MB, e o formulário permite
// várias de uma vez.
export async function uploadServiceRequestPhoto(requestId: string, file: File): Promise<void> {
  const compressed = await compressImage(file);
  const path = `${requestId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase!.storage
    .from(PHOTOS_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg" });
  if (uploadError) throw uploadError;

  const { data } = supabase!.storage.from(PHOTOS_BUCKET).getPublicUrl(path);

  const { error } = await supabase!
    .from("service_request_photos")
    .insert({ request_id: requestId, photo_url: data.publicUrl });
  if (error) throw error;
}
