interface PageContainerProps {
  children: React.ReactNode;
}

export function PageContainer({ children }: PageContainerProps) {
  return <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 md:px-8 md:py-8">{children}</div>;
}
