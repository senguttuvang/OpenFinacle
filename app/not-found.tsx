export default function NotFound() {
  return (
    <main className="content">
      <h1>That screen does not exist</h1>
      <p>
        This link does not identify an OpenFinacle screen. Your saved banking
        records are unchanged.
      </p>
      <p>
        <a href="/overview">Open my saved workspace</a> ·{" "}
        <a href="/discover">Explore OpenFinacle</a>
      </p>
    </main>
  );
}
