import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="auth-eyebrow">Internal Access</p>
          <h1>Fewfeed Clone</h1>
          <p>{user.email}</p>
        </div>
        <form action="/logout" method="post">
          <button type="submit" className="secondary-button">Logout</button>
        </form>
      </header>
      <section className="dashboard-card">
        <h2>Dashboard</h2>
        <p>Your internal workspace is ready.</p>
      </section>
    </main>
  );
}
