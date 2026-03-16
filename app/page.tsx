import Navbar from "../components/Navbar";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />

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
      <section className="bg-white py-20">
  <div className="mx-auto max-w-6xl px-6 text-center">
    
    <h2 className="text-3xl font-bold mb-12">
      Bootcamp Programs
    </h2>

    <div className="grid gap-8 md:grid-cols-3">

      <div className="border rounded-xl p-8">
        <h3 className="text-xl font-semibold mb-4">1 Week Reset</h3>
        <p className="text-4xl font-bold mb-4">€900</p>
        <p className="text-gray-600 mb-6">
          Perfect introduction to the program.
        </p>
        <button className="bg-black text-white px-6 py-2 rounded-lg">
          Apply
        </button>
      </div>

      <div className="border rounded-xl p-8">
        <h3 className="text-xl font-semibold mb-4">2 Week Transformation</h3>
        <p className="text-4xl font-bold mb-4">€1650</p>
        <p className="text-gray-600 mb-6">
          Our most popular program.
        </p>
        <button className="bg-black text-white px-6 py-2 rounded-lg">
          Apply
        </button>
      </div>

      <div className="border rounded-xl p-8">
        <h3 className="text-xl font-semibold mb-4">3 Week Intensive</h3>
        <p className="text-4xl font-bold mb-4">€2250</p>
        <p className="text-gray-600 mb-6">
          Maximum transformation.
        </p>
        <button className="bg-black text-white px-6 py-2 rounded-lg">
          Apply
        </button>
      </div>

    </div>

  </div>
</section>
    </main>
  );
}
