import Header from "../../components/header"

const steps = [
  ["01", "Conte o que você imagina", "Descreva seu casamento, festa ou evento corporativo: data, cidade, estilo e o que não pode faltar."],
  ["02", "A EventeIA prospecta", "Nossa inteligência encontra fornecedores relevantes e entra em contato em seu nome, sem buscas intermináveis."],
  ["03", "Receba propostas claras", "Os orçamentos chegam organizados para você comparar caminhos, valores e possibilidades com tranquilidade."],
]

export default function ComoFunciona() {
  return <main className="min-h-screen bg-[#F7F3EE]"><Header /><section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24"><span className="eyebrow">Como a EventeIA faz acontecer</span><h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.04em] text-[#3D1B28] sm:text-7xl">Da primeira ideia à proposta que faz <em>sentido.</em></h1><p className="mt-8 max-w-2xl text-lg leading-8 text-[#3D1B28]/70">O trabalho de encontrar, contatar e organizar fornecedores acontece nos bastidores. Você recebe clareza para tomar a decisão certa.</p><div className="mt-20 grid gap-10 border-t border-[#EEE7DF] pt-8 md:grid-cols-3">{steps.map(([number, title, text]) => <article key={number} className="border-t border-[#C5A56F] pt-4"><span className="text-xs font-semibold tracking-widest text-[#C5A56F]">{number}</span><h2 className="mt-8 font-serif text-3xl leading-tight text-[#3D1B28]">{title}</h2><p className="mt-4 text-sm leading-6 text-[#3D1B28]/65">{text}</p></article>)}</div></section></main>
}
