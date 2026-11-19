export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8 max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
        {title}
      </h1>
      {children && (
        <div className="mt-4 text-base leading-7 text-zinc-600">{children}</div>
      )}
    </header>
  );
}
