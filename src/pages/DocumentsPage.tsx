import { useRef, useState } from "react";
import { Camera, FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentCategories } from "@/contexts/DocumentCategoriesContext";
import { useDocuments } from "@/contexts/DocumentsContext";
import { usePets } from "@/contexts/PetsContext";
import { uploadDocumentFile } from "@/data/documentsApi";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AppDocument, Pet, PetSpecies } from "@/types";

// "pet" é um valor sentinela pra sub-aba fixa "PETS" — as demais abas são
// os ids das categorias dinâmicas (useDocumentCategories).
const PET_TAB = "pet";

const PET_SPECIES_OPTIONS: PetSpecies[] = ["Gato", "Cachorro"];

const EMPTY_PET_FORM = { name: "", species: "Gato" as PetSpecies, breed: "", color: "", notes: "" };

// Tela "/documentos" — sub-abas de categoria (dinâmicas, ver
// DocumentCategoriesContext) são listas simples (nome + foto/PDF
// anexado), e "PETS" (fixa, sempre por último) é o cadastro de pets
// (nome, espécie, raça, cor, notas) com os documentos de cada pet dentro
// do próprio cartão do pet (mesma tabela "documents", petId em vez de
// categoryId).
export function DocumentsPage() {
  const [listSearch, setListSearch] = useState("");
  const { documents, addDocument, deleteDocument } = useDocuments();
  const { pets, addPet, deletePet } = usePets();
  const { categories, addCategory, deleteCategory } = useDocumentCategories();
  const [activeTab, setActiveTab] = useState<string>(PET_TAB);

  // Dialog de novo documento — compartilhado entre uma categoria (petId
  // null) e o "+ Documento" de dentro de um cartão de pet (petId setado).
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogCategoryId, setDialogCategoryId] = useState<string | null>(null);
  const [dialogPetId, setDialogPetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  function openNewDocumentDialog(categoryId: string | null, petId: string | null) {
    setDialogCategoryId(categoryId);
    setDialogPetId(petId);
    setName("");
    setContent("");
    setSelectedFile(null);
    setSaveError(null);
    setIsDialogOpen(true);
  }

  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  function openNewCategoryDialog() {
    setCategoryName("");
    setIsCategoryDialogOpen(true);
  }

  function handleSaveCategory() {
    const trimmed = categoryName.trim();
    if (!trimmed) return;
    addCategory(trimmed);
    setIsCategoryDialogOpen(false);
  }

  // Apaga os documentos da categoria primeiro (mesmo raciocínio de
  // handleDeletePet) antes de apagar a categoria em si.
  function handleDeleteCategory(categoryId: string) {
    documents.filter((doc) => doc.categoryId === categoryId).forEach((doc) => deleteDocument(doc.id));
    deleteCategory(categoryId);
    if (activeTab === categoryId) setActiveTab(PET_TAB);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file) setSelectedFile(file);
    event.target.value = "";
  }

  async function handleSaveDocument() {
    if (!name.trim()) return setSaveError("Informe um título para a nota.");
    if (!content.trim() && !selectedFile) return setSaveError("Escreva uma nota ou anexe uma foto/PDF.");
    setIsSaving(true);
    setSaveError(null);
    try {
      let fileUrl: string | null = null;
      let fileName: string | null = null;

      if (selectedFile && isSupabaseConfigured) {
        const uploaded = await uploadDocumentFile(selectedFile);
        fileUrl = uploaded.url;
        fileName = uploaded.name;
      } else if (selectedFile) {
        // Sem Supabase configurado (modo mock/teste local) não há onde
        // enviar o arquivo — usa uma URL local só pra sessão atual, pra
        // o anexo continuar visível/clicável enquanto testa.
        fileUrl = URL.createObjectURL(selectedFile);
        fileName = selectedFile.name;
      }

      await addDocument({ categoryId: dialogCategoryId, petId: dialogPetId, name: name.trim(), fileUrl, fileName, content: content.trim() });
      setIsDialogOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar a nota.");
    } finally {
      setIsSaving(false);
    }
  }

  function renderDocumentCard(doc: AppDocument) {
    return (
      <Card key={doc.id}>
        <CardContent className="flex flex-col gap-3 pt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{doc.name}</p>
            <Button variant="ghost" size="icon" aria-label={`Apagar ${doc.name}`} onClick={() => deleteDocument(doc.id)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
          {doc.content && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{doc.content}</p>}
          {doc.fileUrl && doc.fileName && (
            <div className="flex flex-col gap-2">
              {/\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(doc.fileName) && <img src={doc.fileUrl} alt={doc.name} className="max-h-80 w-full rounded-lg border object-contain" />}
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary underline-offset-2 hover:underline">
                <Paperclip className="size-4 shrink-0" />
                {doc.fileName}
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderFlatList(categoryId: string) {
    const query = listSearch.trim().toLocaleLowerCase("pt-BR");
    const items = documents.filter((doc) => doc.categoryId === categoryId && `${doc.name} ${doc.content ?? ""} ${doc.fileName ?? ""}`.toLocaleLowerCase("pt-BR").includes(query));

    return (
      <div className="flex flex-col gap-3">
        <Input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Filtrar documentos por nome, texto ou arquivo" aria-label="Filtrar documentos" />
        <Button className="w-fit gap-1.5" size="sm" onClick={() => openNewDocumentDialog(categoryId, null)}>
          <Plus className="size-4" />
          Novo documento
        </Button>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum documento cadastrado ainda.</p>
        ) : (
          <div className="flex flex-col gap-3">{items.map(renderDocumentCard)}</div>
        )}
      </div>
    );
  }

  // --- Sub-aba PETS ---

  const [isPetDialogOpen, setIsPetDialogOpen] = useState(false);
  const [petForm, setPetForm] = useState(EMPTY_PET_FORM);

  function openNewPetDialog() {
    setPetForm(EMPTY_PET_FORM);
    setIsPetDialogOpen(true);
  }

  function handleSavePet() {
    const petName = petForm.name.trim();
    if (!petName) return;
    addPet({
      name: petName,
      species: petForm.species,
      breed: petForm.breed.trim(),
      color: petForm.color.trim(),
      notes: petForm.notes.trim(),
    });
    setIsPetDialogOpen(false);
  }

  // Apaga os documentos do pet primeiro (estado local + Storage/banco via
  // deleteDocument) antes de apagar o pet em si.
  function handleDeletePet(pet: Pet) {
    documents.filter((doc) => doc.petId === pet.id).forEach((doc) => deleteDocument(doc.id));
    deletePet(pet.id);
  }

  function renderPetsSection() {
    const query = listSearch.trim().toLocaleLowerCase("pt-BR");
    const petsFiltrados = pets.filter((pet) => `${pet.name} ${pet.species} ${pet.breed} ${pet.color} ${pet.notes}`.toLocaleLowerCase("pt-BR").includes(query) || documents.some((doc) => doc.petId === pet.id && `${doc.name} ${doc.content ?? ""} ${doc.fileName ?? ""}`.toLocaleLowerCase("pt-BR").includes(query)));
    return (
      <div className="flex flex-col gap-3">
        <Input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Filtrar pets e documentos por nome ou texto" aria-label="Filtrar pets e documentos" />
        <Button className="w-fit gap-1.5" size="sm" onClick={openNewPetDialog}>
          <Plus className="size-4" />
          Novo pet
        </Button>

        {pets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pet cadastrado ainda.</p>
        ) : petsFiltrados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pet corresponde ao filtro.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {petsFiltrados.map((pet) => {
              const petDocuments = documents.filter((doc) => doc.petId === pet.id && `${doc.name} ${doc.content ?? ""} ${doc.fileName ?? ""}`.toLocaleLowerCase("pt-BR").includes(query));
              return (
                <Card key={pet.id}>
                  <CardContent className="flex flex-col gap-3 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <p className="font-medium">{pet.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {pet.species}
                          {pet.breed && ` · ${pet.breed}`}
                          {pet.color && ` · ${pet.color}`}
                        </p>
                        {pet.notes && <p className="text-sm text-muted-foreground">{pet.notes}</p>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeletePet(pet)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit gap-1.5"
                      onClick={() => openNewDocumentDialog(null, pet.id)}
                    >
                      <Plus className="size-4" />
                      Documento
                    </Button>

                    {petDocuments.length > 0 && (
                      <div className="flex flex-col gap-2">{petDocuments.map(renderDocumentCard)}</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">DOCUMENTOS</h1>
        <p className="text-sm text-muted-foreground">Guarde notas em texto, fotos e PDFs organizados por categoria.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            {categories.map((category) => (
              <TabsTrigger key={category.id} value={category.id}>
                {category.name.toUpperCase()}
              </TabsTrigger>
            ))}
            <TabsTrigger value={PET_TAB}>PETS</TabsTrigger>
          </TabsList>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openNewCategoryDialog}>
            <Plus className="size-4" />
            Criar categoria
          </Button>
        </div>

        {categories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {category.name}
              </p>
              <Button variant="ghost" size="icon" onClick={() => handleDeleteCategory(category.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            {renderFlatList(category.id)}
          </TabsContent>
        ))}

        <TabsContent value={PET_TAB}>{renderPetsSection()}</TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo documento</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-name">Nome do documento</Label>
              <Input id="doc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-content">Nota / texto</Label>
              <Textarea id="doc-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escreva os detalhes desta nota..." rows={5} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Foto ou PDF (opcional)</Label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Camera className="size-4" />
                  Tirar foto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => pdfInputRef.current?.click()}
                >
                  <FileText className="size-4" />
                  Anexar PDF
                </Button>
              </div>
              {selectedFile && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Paperclip className="size-3.5" />
                  {selectedFile.name}
                </p>
              )}
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDocument} disabled={!name.trim() || (!content.trim() && !selectedFile) || isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPetDialogOpen} onOpenChange={setIsPetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo pet</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pet-name">Nome</Label>
              <Input
                id="pet-name"
                value={petForm.name}
                onChange={(e) => setPetForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pet-species">Categoria</Label>
              <Select
                value={petForm.species}
                onValueChange={(value) => setPetForm((prev) => ({ ...prev, species: value as PetSpecies }))}
              >
                <SelectTrigger id="pet-species">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PET_SPECIES_OPTIONS.map((species) => (
                    <SelectItem key={species} value={species}>
                      {species}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pet-breed">Raça (opcional)</Label>
              <Input
                id="pet-breed"
                value={petForm.breed}
                onChange={(e) => setPetForm((prev) => ({ ...prev, breed: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pet-color">Cor (opcional)</Label>
              <Input
                id="pet-color"
                value={petForm.color}
                onChange={(e) => setPetForm((prev) => ({ ...prev, color: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pet-notes">Outras informações (opcional)</Label>
              <Textarea
                id="pet-notes"
                value={petForm.notes}
                onChange={(e) => setPetForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPetDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePet} disabled={!petForm.name.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-name">Nome</Label>
            <Input
              id="category-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Ex: Trabalho, Carro..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCategory} disabled={!categoryName.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
