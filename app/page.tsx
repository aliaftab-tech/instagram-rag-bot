export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        background: "#0a0a0a",
        color: "#fafafa",
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
        🤖 ig-rag-bot
      </h1>
      <p style={{ color: "#888", maxWidth: "400px", textAlign: "center" }}>
        Instagram RAG assistant is running. Webhook endpoint is at{" "}
        <code style={{ color: "#c084fc" }}>/api/webhook/instagram</code>
      </p>
    </main>
  );
}
