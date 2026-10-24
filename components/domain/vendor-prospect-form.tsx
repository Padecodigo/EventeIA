"use client";

import { useActionState } from "react";

import { addVendorProspectAction, type AddProspectState } from "@/app/(dashboard)/eventos/actions";
import { Button } from "@/components/ui/button";

const initialState: AddProspectState = {};

export function VendorProspectForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(addVendorProspectAction, initialState);

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="eventId" value={eventId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="vendor-name" className="text-sm font-medium text-vinho">
          Nome do fornecedor
        </label>
        <input
          id="vendor-name"
          name="vendorName"
          required
          minLength={2}
          maxLength={80}
          placeholder="Buffet da Vila"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="vendor-category" className="text-sm font-medium text-vinho">
          Categoria
        </label>
        <select
          id="vendor-category"
          name="vendorCategory"
          required
          defaultValue="buffet"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        >
          <option value="buffet">Buffet</option>
          <option value="decoracao">Decoração</option>
          <option value="musica">Música</option>
          <option value="fotografia">Fotografia</option>
          <option value="espaco">Espaço</option>
          <option value="outro">Outro</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5 md:col-span-2">
        <label htmlFor="vendor-phone" className="text-sm font-medium text-vinho">
          WhatsApp do fornecedor
        </label>
        <input
          id="vendor-phone"
          name="phone"
          type="tel"
          required
          placeholder="12 99999-9999"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
        <p className="text-caption text-vinho/70">
          O primeiro contato sai pelo seu WhatsApp — texto puro, intervalo humanizado de 45 a 90
          segundos entre disparos.
        </p>
      </div>

      {state.error !== undefined ? (
        <p role="alert" className="md:col-span-2 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}

      {state.success === true ? (
        <p className="md:col-span-2 rounded-xl bg-semantic-success/10 px-4 py-3 text-sm text-semantic-success">
          Fornecedor na fila de prospecção. O disparo respeita o intervalo humanizado.
        </p>
      ) : null}

      <div className="md:col-span-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Enfileirando…" : "Prospectar fornecedor"}
        </Button>
      </div>
    </form>
  );
}
