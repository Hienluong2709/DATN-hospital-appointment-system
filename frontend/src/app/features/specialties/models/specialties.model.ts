export interface Specialty {
  id: number;
  name: string;
  description: string | null;
}

export interface SpecialtyUpsertPayload {
  name: string;
  description?: string | null;
}
