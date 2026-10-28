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
}

export function ProfileForm({
  defaultName,
  defaultPhone,
  defaultCpf,
}: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
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
        hint="Necessário para emitir a cobrança. Fica restrito ao servidor."
      />

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
