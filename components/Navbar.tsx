export default function Navbar() {
  return (
    <nav className="w-full border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="text-lg font-semibold">
          Wild Atlantic Bootcamp
        </div>

        <div className="flex gap-6 text-sm text-gray-600">
          <a href="#">Program</a>
          <a href="#">Pricing</a>
          <a href="#">Testimonials</a>
          <a href="#">FAQ</a>
        </div>

        <button className="rounded-lg bg-black px-4 py-2 text-sm text-white">
          Login
        </button>
      </div>
    </nav>
  );
}