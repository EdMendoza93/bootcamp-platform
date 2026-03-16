export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          Wild Atlantic Fitness Retreat
        </p>

        <h1 className="mb-6 max-w-4xl text-5xl font-bold leading-tight md:text-6xl">
          Transform your body and lifestyle on the Irish coast
        </h1>

        <p className="mb-8 max-w-2xl text-lg text-gray-600">
          A premium wellness bootcamp with coaching, training, nutrition,
          accommodation, and a structured environment designed for real change.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <button className="rounded-lg bg-black px-6 py-3 text-white transition hover:bg-gray-800">
            Apply Now
          </button>
          <button className="rounded-lg border border-gray-300 px-6 py-3 transition hover:bg-white">
            View Pricing
          </button>
        </div>
      </section>
    </main>
  );
}