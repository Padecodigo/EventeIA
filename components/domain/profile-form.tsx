"use client";

import { useActionState } from "react";

import { updateProfileAction, type ProfileState } from "@/app/(dashboard)/perfil/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

const initialState: ProfileState = {};

export interface ProfileFormProps {
  defaultName: string;
  defaultPhone: string;
  defaultCpf: string;
  whatsappOptIn: boolean;
}

export function ProfileForm({
  defaultName,
  defaultPhone,
  defaultCpf,
  whatsappOptIn,
}: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="mt-6 grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="Nome" name="displayName" required defaultValue={defaultName} maxLength={80} />
      </div>

      <Field
        label="WhatsApp"
        name="phone"
        type="tel"
        defaultValue={defaultPhone}
        placeholder="11 99999-9999"
        hint="Usado para enviar cotações e o lembrete de depoimento."
      />
      <Field
        label="CPF"
        name="cpf"
        inputMode="numeric"
        defaultValue={defaultCpf}
        placeholder="00000000000"
        hint="Necessário para emitir a cobrança no Asaas. Fica restrito ao servidor."
      />

      <div className="md:col-span-2 rounded-xl border border-line-subtle bg-areia-quente p-4">
        <label className="flex items-start gap-3 text-sm text-vinho/80">
          <input
            type="checkbox"
            name="consent"
            defaultChecked={whatsappOptIn}
            className="mt-1 h-4 w-4 shrink-0 rounded border-line-strong accent-vinho"
          />
          <span>
            Autorizo a EventeIA a enviar cotações, lembretes e o convite de depoimento pelo WhatsApp.
            Posso revogar a qualquer momento desmarcando esta opção.
          </span>
        </label>
      </div>

      {state.error !== undefined ? (
        <p role="alert" className="md:col-span-2 rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}

      {state.success === true ? (
        <p className="md:col-span-2 rounded-xl bg-champagne-claro/60 px-4 py-3 text-sm text-vinho">
          Perfil salvo.
        </p>
      ) : null}

      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar perfil"}
        </Button>
      </div>
    </form>
  );
}
