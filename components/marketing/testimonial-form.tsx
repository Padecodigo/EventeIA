"use client";

import { useActionState } from "react";

import {
  submitTestimonialAction,
  type TestimonialFormState,
} from "@/app/(marketing)/depoimento/actions";
import { Button } from "@/components/ui/button";

const initialState: TestimonialFormState = {};

export interface TestimonialFormProps {
  token: string;
  defaultName: string;
  consentText: string;
}

export function TestimonialForm({ token, defaultName, consentText }: TestimonialFormProps) {
  const [state, formAction, pending] = useActionState(submitTestimonialAction, initialState);

  if (state.success === true) {
    return (
      <div>
        <h2 className="font-serif text-title-1">Recebemos a sua história.</h2>
        <p className="mt-3 text-sm leading-6 text-vinho/75">
          Obrigado por compartilhar. Nossa equipe revisa o texto antes de publicar — você pode pedir
          correções ou remoção a qualquer momento.
        </p>
        <p className="mt-4 text-caption text-vinho/70">
          Nenhum depoimento é publicado sem a sua autorização registrada.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="authorName" className="text-sm font-medium text-vinho">
          Como você quer ser identificado(a)?
        </label>
        <input
          id="authorName"
          name="authorName"
          required
          minLength={2}
          maxLength={80}
          defaultValue={defaultName}
          placeholder="Nome e sobrenome"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
        <p className="text-caption text-vinho/70">
          Usamos o nome no depoimento. Você pode usar apenas o primeiro nome.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="city" className="text-sm font-medium text-vinho">
          Cidade (opcional)
        </label>
        <input
          id="city"
          name="city"
          maxLength={60}
          placeholder="São José dos Campos, SP"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="quote" className="text-sm font-medium text-vinho">
          Como foi a experiência?
        </label>
        <textarea
          id="quote"
          name="quote"
          required
          minLength={80}
          maxLength={800}
          rows={5}
          placeholder="Conte o que mudou no seu jeito de organizar, o que você economizou de tempo ou dinheiro, como foi receber as propostas…"
          className="rounded-xl border border-line-subtle bg-off-white p-4 text-sm text-vinho"
        />
        <p className="text-caption text-vinho/70">Entre 80 e 800 caracteres.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="outcome" className="text-sm font-medium text-vinho">
          Resultado em uma frase (opcional)
        </label>
        <input
          id="outcome"
          name="outcome"
          maxLength={80}
          placeholder="Ex.: R$ 2.800 abaixo do primeiro orçamento"
          className="h-12 rounded-xl border border-line-subtle bg-off-white px-4 text-sm text-vinho"
        />
      </div>

      <div className="rounded-xl border border-line-subtle bg-areia-quente p-4">
        <label className="flex items-start gap-3 text-sm text-vinho/80">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-1 h-4 w-4 shrink-0 rounded border-line-strong accent-vinho"
          />
          <span>
            Li e concordo em ter meu depoimento publicado pela EventeIA, conforme o texto abaixo.
          </span>
        </label>
        <p className="mt-3 text-caption leading-5 text-vinho/70">{consentText}</p>
      </div>

      {state.error !== undefined ? (
        <p role="alert" className="rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar depoimento"}
      </Button>
    </form>
  );
}
